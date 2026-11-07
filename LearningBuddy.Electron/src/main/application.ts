import { app, dialog } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AssistantSession } from '../core/assistantSession';
import { PackageImportError, parsePackage } from '../core/packageParser';
import {
  MAX_INTERVAL_MINUTES,
  MAX_QUESTIONS_PER_SERIES,
  MIN_INTERVAL_MINUTES,
  MIN_QUESTIONS_PER_SERIES,
  type AppSettings,
  type ReviewOutcome,
} from '../core/types';
import {
  Channels,
  type AppStateView,
  type ImportResult,
  type LibraryEntryView,
  type SettingsPatch,
} from '../shared/ipc';
import { APP_TITLE, ASSISTANT_TICK_MS, defaultPackagesDirectory, describeError, WANDER_TICK_MS } from './config';
import { IpcController, type IpcHost } from './ipcController';
import { PackageLibrary } from './library';
import { ReviewController } from './reviewController';
import { LocalStorageError, LocalStore } from './store';
import { TrayController, type TrayHost } from './tray';
import { expectBoolean, expectInteger } from './validation';
import { WindowManager, type WindowManagerHost } from './windows/windowManager';

export class LearningBuddyApplication implements IpcHost, TrayHost, WindowManagerHost {
  readonly store: LocalStore;
  readonly library: PackageLibrary;
  readonly controller: ReviewController;
  readonly windows: WindowManager;
  private readonly tray: TrayController;
  private quitting = false;
  private questionDisplayed = false;

  constructor() {
    try {
      this.store = new LocalStore(path.join(app.getPath('userData'), 'learning-buddy.json'));
    } catch (error) {
      const location = error instanceof LocalStorageError ? `\nFichier : ${error.filePath}` : '';
      dialog.showErrorBox(APP_TITLE, `Impossible d’ouvrir les données locales.\n${describeError(error)}${location}`);
      throw error;
    }

    this.library = new PackageLibrary(defaultPackagesDirectory());
    const settings = this.store.getSettings();
    const session = new AssistantSession(Date.now, {
      active: settings.assistantEnabled,
      intervalMs: settings.intervalMinutes * 60_000,
      questionsPerSeries: settings.questionsPerSeries,
    });
    this.windows = new WindowManager(this.store, this);
    this.controller = new ReviewController(this.store, session, {
      showBubble: (view) => this.windows.showBubble(view),
      closeBubble: () => this.windows.closeBubble(),
      setQuestionDisplayed: (displayed) => this.setQuestionDisplayed(displayed),
      playReaction: (reaction) => this.windows.playReaction(reaction),
      stateChanged: () => this.broadcastState(),
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    });
    this.tray = new TrayController(this);
  }

  start(): void {
    this.windows.createMainWindow();
    this.windows.createCompanionWindow();
    this.tray.create();
    if (!process.argv.includes('--background')) this.showMainWindow();
    setInterval(() => this.controller.tick(), ASSISTANT_TICK_MS);
    setInterval(() => this.windows.wanderTick(), WANDER_TICK_MS);
    new IpcController(this).register();
  }

  markQuitting(): void {
    this.quitting = true;
  }

  get isQuitting(): boolean { return this.quitting; }
  get assistantActive(): boolean { return this.controller.session.isActive; }
  get companionVisible(): boolean { return this.store.getSettings().companionVisible; }
  get wanderingEnabled(): boolean { return this.store.getSettings().companionWanderingEnabled; }
  get menuWindow() { return this.windows.companionWindow; }
  get isQuestionDisplayed(): boolean { return this.questionDisplayed; }

  onCompanionVisibilityChanged(): void { this.broadcastState(); }
  closePresentedReview(): void { if (this.controller.isPresenting) this.controller.close(); }
  showMainWindow(): void {
    if (!this.windows.mainWindow) return;
    if (this.windows.mainWindow.isMinimized()) this.windows.mainWindow.restore();
    this.windows.mainWindow.show();
    this.windows.mainWindow.focus();
  }
  reviewNow(): void { this.controller.presentNext(true); }
  setAssistantActive(active: boolean): void {
    this.store.updateSettings({ assistantEnabled: active });
    this.controller.setAssistantActive(active);
    this.windows.sendCompanionState();
    this.broadcastState();
  }
  setCompanionVisible(visible: boolean): void { this.windows.setCompanionVisible(visible); }
  updateSettings(patch: SettingsPatch = { companionWanderingEnabled: !this.wanderingEnabled }): void {
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
    const settings = this.store.updateSettings(next);
    this.controller.session.updateSettings(settings.intervalMinutes * 60_000, settings.questionsPerSeries);
    if (!settings.companionWanderingEnabled) this.windows.resetWanderer();
    this.broadcastState();
  }
  getState(): AppStateView {
    const settings = this.store.getSettings();
    const selected = settings.reviewPackageIds ? new Set(settings.reviewPackageIds) : null;
    return {
      settings,
      assistant: {
        active: this.controller.session.isActive,
        nextPresentationAt: this.controller.session.nextPresentationAt,
        series: this.controller.session.seriesProgress,
      },
      statistics: this.store.getStatistics(Date.now()),
      packages: this.store.listPackages().map(({ package: record, cardCount }) => ({
        id: record.id, name: record.name, cardCount, selected: selected ? selected.has(record.id) : true,
      })),
    };
  }
  listLibrary(): LibraryEntryView[] {
    return this.library.load().map((entry) => ({
      id: entry.id, title: entry.package.title, cardCount: entry.package.cards.length,
      downloaded: this.store.hasLibraryPackage(entry.id),
    }));
  }
  downloadLibraryPackage(id: string): void {
    const entry = this.library.find(id);
    if (!entry) throw new Error(`Paquet de bibliothèque introuvable : ${id}`);
    if (!this.store.hasLibraryPackage(id)) this.store.createPackage(entry.package, id, Date.now());
    this.broadcastState();
  }
  async importPackageFile(): Promise<ImportResult> {
    const options: Electron.OpenDialogOptions = {
      title: 'Importer un paquet', filters: [{ name: 'Paquet LearningBuddy', extensions: ['json'] }],
      properties: ['openFile'],
    };
    const result = this.windows.mainWindow
      ? await dialog.showOpenDialog(this.windows.mainWindow, options)
      : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { status: 'cancelled' };
    try {
      const imported = parsePackage(readFileSync(filePath, 'utf8'));
      this.store.createPackage(imported, null, Date.now());
      this.broadcastState();
      return { status: 'imported', name: imported.title, cardCount: imported.cards.length };
    } catch (error) {
      if (error instanceof PackageImportError || (error as NodeJS.ErrnoException).code !== undefined) {
        return { status: 'error', message: describeError(error) };
      }
      throw error;
    }
  }
  deletePackage(id: string): void { this.store.deletePackage(id); this.broadcastState(); }
  setPackageSelected(id: string, selected: boolean): void {
    const all = this.store.listPackages().map((summary) => summary.package.id);
    const current = new Set(this.store.getSettings().reviewPackageIds ?? all);
    if (selected) current.add(id); else current.delete(id);
    const reviewPackageIds = all.filter((packageId) => current.has(packageId));
    this.store.updateSettings({ reviewPackageIds: reviewPackageIds.length === all.length ? null : reviewPackageIds });
    this.broadcastState();
  }
  companionClick(): void { if (!this.controller.isPresenting) this.controller.presentNext(true); }
  companionContextMenu(): void { this.tray.showCompanionMenu(); }
  companionDragStart(): void { this.windows.startDrag(); }
  companionDragMove(): void { this.windows.moveDrag(); }
  companionDragEnd(): void { this.windows.endDrag(); }
  companionHidden(): void { this.windows.hideAfterAnimation(); }
  companionSetInteractive(sender: Electron.WebContents, interactive: boolean): void {
    this.windows.setInteractive(sender, interactive);
  }
  bubbleAnswer(outcome: ReviewOutcome): void { this.controller.answer(outcome); }
  bubbleClose(): void { this.controller.close(); }
  bubbleResize(sender: Electron.WebContents, height: number): void { this.windows.resizeBubble(sender, height); }

  private setQuestionDisplayed(displayed: boolean): void {
    this.questionDisplayed = displayed;
    this.windows.setQuestionDisplayed(displayed);
  }
  private broadcastState(): void {
    this.windows.mainWindow?.webContents.send(Channels.stateChanged, this.getState());
    this.tray.refresh();
  }
}
