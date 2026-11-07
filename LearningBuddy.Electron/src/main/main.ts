import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AssistantSession } from '../core/assistantSession';
import type { CompanionReaction } from '../core/avatarStoryboard';
import {
  canWander,
  clampToWorkArea,
  CompanionWanderer,
  defaultCompanionPosition,
  placeBubble,
} from '../core/companionLayout';
import { PackageImportError, parsePackage } from '../core/packageParser';
import {
  MAX_INTERVAL_MINUTES,
  MAX_QUESTIONS_PER_SERIES,
  MIN_INTERVAL_MINUTES,
  MIN_QUESTIONS_PER_SERIES,
  REVIEW_OUTCOMES,
  type AppSettings,
  type ReviewOutcome,
  type ScreenPoint,
} from '../core/types';
import {
  Channels,
  type AppStateView,
  type BubbleView,
  type CompanionStateView,
  type ImportResult,
  type LibraryEntryView,
  type SettingsPatch,
} from '../shared/ipc';
import { PackageLibrary } from './library';
import { ReviewController } from './reviewController';
import { LocalStorageError, LocalStore } from './store';

const COMPANION_SIZE = 168;
const BUBBLE_WIDTH = 380;
const BUBBLE_GAP = 8;
const WANDER_TICK_MS = 33;
const ASSISTANT_TICK_MS = 1000;
const APP_TITLE = 'LearningBuddy';

// Lets tests and side-by-side runs use an isolated profile; must be set before the single-instance lock.
if (process.env.LEARNING_BUDDY_USER_DATA) {
  app.setPath('userData', process.env.LEANRING_BUDDY_USER_DATA);
}

let store: LocalStore;
let library: PackageLibrary;
let controller: ReviewController;
let mainWindow: BrowserWindow | null = null;
let companionWindow: BrowserWindow | null = null;
let bubbleWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const wanderer = new CompanionWanderer();
let companionPosition: ScreenPoint = { x: 0, y: 0 };
let isQuestionDisplayed = false;
let isMoving = false;
let dragOffset: ScreenPoint | null = null;
let lastWanderTick = Date.now();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => {
    isQuitting = true;
  });
  // The application keeps running in the notification area when every window is closed.
  app.on('window-all-closed', () => { });
  app.whenReady().then(start).catch((error: unknown) => {
    dialog.showErrorBox(APP_TITLE, `Le démarrage a échoué.\n${describeError(error)}`);
    app.exit(1);
  });
}

function start(): void {
  app.setAppUserModelId('com.learningBuddy.electron');
  try {
    store = new LocalStore(path.join(app.getPath('userData'), 'learning-buddy.json'));
  } catch (error) {
    const location = error instanceof LocalStorageError ? `\nFichier : ${error.filePath}` : '';
    dialog.showErrorBox(APP_TITLE, `Impossible d’ouvrir les données locales.\n${describeError(error)}${location}`);
    app.exit(1);
    return;
  }

  library = new PackageLibrary(defaultPackagesDirectory());
  const settings = store.getSettings();
  const session = new AssistantSession(Date.now, {
    active: settings.assistantEnabled,
    intervalMs: settings.intervalMinutes * 60_000,
    questionsPerSeries: settings.questionsPerSeries,
  });
  controller = new ReviewController(store, session, {
    showBubble,
    closeBubble,
    setQuestionDisplayed,
    playReaction,
    stateChanged: broadcastState,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  });

  registerIpc();
  createMainWindow();
  createCompanionWindow();
  createTray();
  if (!process.argv.includes('--background')) {
    mainWindow?.show();
  }

  setInterval(() => controller.tick(), ASSISTANT_TICK_MS);
  setInterval(wanderTick, WANDER_TICK_MS);
}

function defaultPackagesDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'default-packages')
    : path.resolve(app.getAppPath(), '..', 'assets', 'default-packages');
}

function rendererPage(name: 'main' | 'companion' | 'bubble'): string {
  return path.join(__dirname, '..', 'renderer', name, 'index.html');
}

function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
  };
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(),
  });
  hardenNavigation(mainWindow);
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  void mainWindow.loadFile(rendererPage('main'));
}

function createCompanionWindow(): void {
  const size = { width: COMPANION_SIZE, height: COMPANION_SIZE };
  const saved = store.getSettings().companionPosition;
  const display = saved ? screen.getDisplayNearestPoint(saved) : screen.getPrimaryDisplay();
  companionPosition = saved
    ? clampToWorkArea(display.workArea, size, saved)
    : defaultCompanionPosition(display.workArea, size);

  companionWindow = new BrowserWindow({
    ...size,
    x: Math.round(companionPosition.x),
    y: Math.round(companionPosition.y),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: { ...secureWebPreferences(), backgroundThrottling: false },
  });
  companionWindow.setAlwaysOnTop(true, 'floating');
  companionWindow.setIgnoreMouseEvents(true, { forward: true });
  hardenNavigation(companionWindow);
  companionWindow.webContents.on('did-finish-load', () => {
    if (store.getSettings().companionVisible) {
      showCompanion();
    }
  });
  void companionWindow.loadFile(rendererPage('companion'));
}

function createBubbleWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: BUBBLE_WIDTH,
    height: 240,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: secureWebPreferences(),
  });
  window.setAlwaysOnTop(true, 'floating');
  hardenNavigation(window);
  window.on('closed', () => {
    bubbleWindow = null;
  });
  return window;
}

function showBubble(view: BubbleView): void {
  if (!bubbleWindow) {
    bubbleWindow = createBubbleWindow();
    const window = bubbleWindow;
    window.webContents.once('did-finish-load', () => sendBubbleView(window, view));
    void window.loadFile(rendererPage('bubble'));
  } else {
    sendBubbleView(bubbleWindow, view);
  }
}

function sendBubbleView(window: BrowserWindow, view: BubbleView): void {
  window.webContents.send(Channels.bubbleView, view);
  placeBubbleWindow();
  window.show();
  window.focus();
}

function closeBubble(): void {
  bubbleWindow?.hide();
}

function placeBubbleWindow(): void {
  if (!bubbleWindow || !companionWindow) {
    return;
  }

  const companion = companionWindow.getBounds();
  const workArea = screen.getDisplayMatching(companion).workArea;
  const height = Math.min(bubbleWindow.getBounds().height, workArea.height);
  bubbleWindow.setBounds(roundRect(placeBubble(workArea, companion, { width: BUBBLE_WIDTH, height }, BUBBLE_GAP)));
}

function setQuestionDisplayed(displayed: boolean): void {
  isQuestionDisplayed = displayed;
  if (displayed && !store.getSettings().companionVisible) {
    store.updateSettings({ companionVisible: true });
    showCompanion();
  }

  sendCompanionState();
}

function playReaction(reaction: CompanionReaction): void {
  companionWindow?.webContents.send(Channels.companionReaction, reaction);
}

function companionStateView(): CompanionStateView {
  return {
    visible: store.getSettings().companionVisible,
    paused: !controller.session.isActive,
    questionDisplayed: isQuestionDisplayed,
    moving: isMoving,
  };
}

function sendCompanionState(): void {
  companionWindow?.webContents.send(Channels.companionState, companionStateView());
}

function showCompanion(): void {
  companionWindow?.showInactive();
  sendCompanionState();
}

/** The renderer plays the "disappear" animation, then reports `companionHidden` to hide the window. */
function setCompanionVisible(visible: boolean): void {
  if (!visible && controller.isPresenting) {
    controller.close();
  }

  store.updateSettings({ companionVisible: visible });
  if (visible) {
    showCompanion();
  } else {
    sendCompanionState();
  }

  broadcastState();
}

function wanderTick(): void {
  const now = Date.now();
  const elapsed = now - lastWanderTick;
  lastWanderTick = now;
  if (!companionWindow || !companionWindow.isVisible()) {
    return;
  }

  const settings = store.getSettings();
  const shouldWander = canWander(
    controller.session.isActive,
    isQuestionDisplayed,
    dragOffset !== null,
    settings.companionWanderingEnabled,
  );
  let moved = false;
  if (shouldWander) {
    const size = { width: COMPANION_SIZE, height: COMPANION_SIZE };
    const workArea = screen.getDisplayNearestPoint(companionPosition).workArea;
    const next = wanderer.advance(companionPosition, workArea, size, elapsed);
    moved = next.x !== companionPosition.x || next.y !== companionPosition.y;
    companionPosition = next;
    if (moved) {
      companionWindow.setPosition(Math.round(next.x), Math.round(next.y));
    }
  }

  if (moved !== isMoving) {
    isMoving = moved;
    sendCompanionState();
    if (!moved) {
      saveCompanionPosition();
    }
  }
}

function startCompanionDrag(): void {
  if (!companionWindow) {
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const bounds = companionWindow.getBounds();
  dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
  wanderer.reset();
}

function moveCompanionDrag(): void {
  if (!companionWindow || !dragOffset) {
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(cursor).workArea;
  companionPosition = clampToWorkArea(
    workArea,
    { width: COMPANION_SIZE, height: COMPANION_SIZE },
    { x: cursor.x - dragOffset.x, y: cursor.y - dragOffset.y },
  );
  companionWindow.setPosition(Math.round(companionPosition.x), Math.round(companionPosition.y));
  placeBubbleWindow();
}

function endCompanionDrag(): void {
  if (!dragOffset) {
    return;
  }

  dragOffset = null;
  saveCompanionPosition();
}

function saveCompanionPosition(): void {
  store.updateSettings({ companionPosition: { x: Math.round(companionPosition.x), y: Math.round(companionPosition.y) } });
}

function showCompanionContextMenu(): void {
  if (!companionWindow) {
    return;
  }

  Menu.buildFromTemplate(commonMenuItems()).popup({ window: companionWindow });
}

function commonMenuItems(): MenuItemConstructorOptions[] {
  const settings = store.getSettings();
  return [
    { label: 'Réviser maintenant', click: () => controller.presentNext(true) },
    {
      label: controller.session.isActive ? 'Mettre l’assistant en pause' : 'Démarrer l’assistant',
      click: () => setAssistantActive(!controller.session.isActive),
    },
    {
      label: 'Promenade du compagnon',
      type: 'checkbox',
      checked: settings.companionWanderingEnabled,
      click: () => updateSettings({ companionWanderingEnabled: !store.getSettings().companionWanderingEnabled }),
    },
    {
      label: settings.companionVisible ? 'Masquer le compagnon' : 'Afficher le compagnon',
      click: () => setCompanionVisible(!store.getSettings().companionVisible),
    },
    { type: 'separator' },
    { label: 'Ouvrir LearningBuddy', click: showMainWindow },
  ];
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.setToolTip(APP_TITLE);
  tray.on('click', showMainWindow);
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(Menu.buildFromTemplate([
    ...commonMenuItems(),
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]));
}

function iconPath(): string {
  return path.join(__dirname, '..', 'assets', 'app.ico');
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function setAssistantActive(active: boolean): void {
  store.updateSettings({ assistantEnabled: active });
  controller.setAssistantActive(active);
  sendCompanionState();
}

function updateSettings(patch: SettingsPatch): void {
  const next: { -readonly [K in keyof AppSettings]?: AppSettings[K] } = {};
  if (patch.intervalMinutes !== undefined) {
    next.intervalMinutes = expectInteger(patch.intervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
  }

  if (patch.questionsPerSeries !== undefined) {
    next.questionsPerSeries = expectInteger(patch.questionsPerSeries, MIN_QUESTIONS_PER_SERIES, MAX_QUESTIONS_PER_SERIES);
  }

  if (patch.companionWanderingEnabled !== undefined) {
    next.companionWanderingEnabled = expectBoolean(patch.companionWanderingEnabled);
  }

  const settings = store.updateSettings(next);
  controller.session.updateSettings(settings.intervalMinutes * 60_000, settings.questionsPerSeries);
  if (!settings.companionWanderingEnabled) {
    wanderer.reset();
  }

  broadcastState();
}

function appState(): AppStateView {
  const settings = store.getSettings();
  const selected = settings.reviewPackageIds ? new Set(settings.reviewPackageIds) : null;
  return {
    settings,
    assistant: {
      active: controller.session.isActive,
      nextPresentationAt: controller.session.nextPresentationAt,
      series: controller.session.seriesProgress,
    },
    statistics: store.getStatistics(Date.now()),
    packages: store.listPackages().map(({ package: record, cardCount }) => ({
      id: record.id,
      name: record.name,
      cardCount,
      selected: selected ? selected.has(record.id) : true,
    })),
  };
}

function broadcastState(): void {
  mainWindow?.webContents.send(Channels.stateChanged, appState());
  refreshTrayMenu();
}

function listLibrary(): LibraryEntryView[] {
  return library.load().map((entry) => ({
    id: entry.id,
    title: entry.package.title,
    cardCount: entry.package.cards.length,
    downloaded: store.hasLibraryPackage(entry.id),
  }));
}

function downloadLibraryPackage(id: string): void {
  const entry = library.find(id);
  if (!entry) {
    throw new Error(`Paquet de bibliothèque introuvable : ${id}`);
  }

  if (!store.hasLibraryPackage(id)) {
    store.createPackage(entry.package, id, Date.now());
  }

  broadcastState();
}

async function importPackageFile(): Promise<ImportResult> {
  const options: Electron.OpenDialogOptions = {
    title: 'Importer un paquet',
    filters: [{ name: 'Paquet LearningBuddy', extensions: ['json'] }],
    properties: ['openFile'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) {
    return { status: 'cancelled' };
  }

  try {
    const imported = parsePackage(readFileSync(filePath, 'utf8'));
    store.createPackage(imported, null, Date.now());
    broadcastState();
    return { status: 'imported', name: imported.title, cardCount: imported.cards.length };
  } catch (error) {
    if (error instanceof PackageImportError || (error as NodeJS.ErrnoException).code !== undefined) {
      return { status: 'error', message: describeError(error) };
    }

    throw error;
  }
}

function setPackageSelected(id: string, selected: boolean): void {
  const all = store.listPackages().map((summary) => summary.package.id);
  const current = new Set(store.getSettings().reviewPackageIds ?? all);
  if (selected) {
    current.add(id);
  } else {
    current.delete(id);
  }

  const reviewPackageIds = all.filter((packageId) => current.has(packageId));
  store.updateSettings({ reviewPackageIds: reviewPackageIds.length === all.length ? null : reviewPackageIds });
  broadcastState();
}

function registerIpc(): void {
  handle(Channels.getState, () => appState());
  handle(Channels.listLibrary, () => listLibrary());
  handle(Channels.downloadLibraryPackage, (_event, id) => downloadLibraryPackage(expectString(id)));
  handle(Channels.importPackageFile, () => importPackageFile());
  handle(Channels.deletePackage, (_event, id) => {
    store.deletePackage(expectString(id));
    broadcastState();
  });
  handle(Channels.setPackageSelected, (_event, id, selected) =>
    setPackageSelected(expectString(id), expectBoolean(selected)));
  handle(Channels.setAssistantActive, (_event, active) => setAssistantActive(expectBoolean(active)));
  handle(Channels.reviewNow, () => controller.presentNext(true));
  handle(Channels.updateSettings, (_event, patch) => updateSettings(expectObject(patch) as SettingsPatch));
  handle(Channels.setCompanionVisible, (_event, visible) => setCompanionVisible(expectBoolean(visible)));

  on(Channels.companionClick, () => {
    if (!controller.isPresenting) {
      controller.presentNext(true);
    }
  });
  on(Channels.companionContextMenu, showCompanionContextMenu);
  on(Channels.companionDragStart, startCompanionDrag);
  on(Channels.companionDragMove, moveCompanionDrag);
  on(Channels.companionDragEnd, endCompanionDrag);
  on(Channels.companionHidden, () => {
    if (!store.getSettings().companionVisible) {
      companionWindow?.hide();
    }
  });
  on(Channels.companionSetInteractive, (event, interactive) => {
    if (companionWindow && event.sender === companionWindow.webContents) {
      companionWindow.setIgnoreMouseEvents(!expectBoolean(interactive), { forward: true });
    }
  });
  on(Channels.bubbleAnswer, (_event, outcome) => controller.answer(expectOutcome(outcome)));
  on(Channels.bubbleClose, () => controller.close());
  on(Channels.bubbleResize, (event, height) => {
    if (bubbleWindow && event.sender === bubbleWindow.webContents) {
      bubbleWindow.setSize(BUBBLE_WIDTH, expectInteger(Math.ceil(Number(height)), 80, 2000));
      placeBubbleWindow();
    }
  });
}

function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
}

function on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedSender(event);
      listener(event, ...args);
    } catch (error) {
      console.error(`IPC ${channel} :`, error);
    }
  });
}

// Only pages bundled with the application may call the API.
function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith('file://')) {
    throw new Error(`Expéditeur IPC non autorisé : ${url}`);
  }
}

function expectString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new TypeError('Identifiant invalide.');
  }

  return value;
}

function expectBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('Booléen attendu.');
  }

  return value;
}

function expectInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Entier attendu entre ${min} et ${max}.`);
  }

  return value;
}

function expectObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Objet attendu.');
  }

  return value as Record<string, unknown>;
}

function expectOutcome(value: unknown): ReviewOutcome {
  if (!REVIEW_OUTCOMES.includes(value as ReviewOutcome)) {
    throw new TypeError('Résultat de révision invalide.');
  }

  return value as ReviewOutcome;
}

function roundRect(rect: { x: number; y: number; width: number; height: number }): Electron.Rectangle {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
