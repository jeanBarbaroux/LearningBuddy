import {
  BrowserWindow,
  screen,
  type Rectangle,
} from 'electron';
import type { CompanionReaction } from '../../core/avatarStoryboard';
import {
  canWander,
  clampToWorkArea,
  CompanionWanderer,
  defaultCompanionPosition,
  placeBubble,
} from '../../core/companionLayout';
import type { ScreenPoint } from '../../core/types';
import {
  BUBBLE_GAP,
  BUBBLE_WIDTH,
  COMPANION_SIZE,
  APP_TITLE,
  iconPath,
  rendererPage,
  secureWebPreferences,
} from '../config';
import { Channels, type BubbleView, type CompanionStateView } from '../../shared/ipc';
import type { LocalStore } from '../store';

export interface WindowManagerHost {
  readonly isQuitting: boolean;
  readonly isQuestionDisplayed: boolean;
  readonly assistantActive: boolean;
  onCompanionVisibilityChanged(visible: boolean): void;
  closePresentedReview(): void;
}

export class WindowManager {
  mainWindow: BrowserWindow | null = null;
  companionWindow: BrowserWindow | null = null;
  private bubbleWindow: BrowserWindow | null = null;
  private readonly wanderer = new CompanionWanderer();
  private companionPosition: ScreenPoint = { x: 0, y: 0 };
  private isMoving = false;
  private dragOffset: ScreenPoint | null = null;
  private lastWanderTick = Date.now();

  constructor(private readonly store: LocalStore, private readonly host: WindowManagerHost) {}

  createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
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
    this.hardenNavigation(this.mainWindow);
    this.mainWindow.on('close', (event) => {
      if (!this.host.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
    void this.mainWindow.loadFile(rendererPage('main'));
  }

  createCompanionWindow(): void {
    const size = { width: COMPANION_SIZE, height: COMPANION_SIZE };
    const saved = this.store.getSettings().companionPosition;
    const display = saved ? screen.getDisplayNearestPoint(saved) : screen.getPrimaryDisplay();
    this.companionPosition = saved
      ? clampToWorkArea(display.workArea, size, saved)
      : defaultCompanionPosition(display.workArea, size);

    this.companionWindow = new BrowserWindow({
      ...size,
      x: Math.round(this.companionPosition.x),
      y: Math.round(this.companionPosition.y),
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
    this.companionWindow.setAlwaysOnTop(true, 'floating');
    this.companionWindow.setIgnoreMouseEvents(true, { forward: true });
    this.hardenNavigation(this.companionWindow);
    this.companionWindow.webContents.on('did-finish-load', () => {
      if (this.store.getSettings().companionVisible) {
        this.showCompanion();
      }
    });
    void this.companionWindow.loadFile(rendererPage('companion'));
  }

  showBubble(view: BubbleView): void {
    if (!this.bubbleWindow) {
      this.bubbleWindow = this.createBubbleWindow();
      const window = this.bubbleWindow;
      window.webContents.once('did-finish-load', () => this.sendBubbleView(window, view));
      void window.loadFile(rendererPage('bubble'));
    } else {
      this.sendBubbleView(this.bubbleWindow, view);
    }
  }

  closeBubble(): void {
    this.bubbleWindow?.hide();
  }

  setQuestionDisplayed(displayed: boolean): void {
    if (displayed && !this.store.getSettings().companionVisible) {
      this.store.updateSettings({ companionVisible: true });
      this.showCompanion();
      this.host.onCompanionVisibilityChanged(true);
    }
    this.sendCompanionState();
  }

  playReaction(reaction: CompanionReaction): void {
    this.companionWindow?.webContents.send(Channels.companionReaction, reaction);
  }

  setCompanionVisible(visible: boolean): void {
    if (!visible) {
      this.host.closePresentedReview();
    }
    this.store.updateSettings({ companionVisible: visible });
    if (visible) {
      this.showCompanion();
    } else {
      this.sendCompanionState();
    }
    this.host.onCompanionVisibilityChanged(visible);
  }

  setInteractive(eventSender: Electron.WebContents, interactive: boolean): void {
    if (this.companionWindow && eventSender === this.companionWindow.webContents) {
      this.companionWindow.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  }

  hideAfterAnimation(): void {
    if (!this.store.getSettings().companionVisible) {
      this.companionWindow?.hide();
    }
  }

  startDrag(): void {
    if (!this.companionWindow) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = this.companionWindow.getBounds();
    this.dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    this.wanderer.reset();
  }

  moveDrag(): void {
    if (!this.companionWindow || !this.dragOffset) return;
    const cursor = screen.getCursorScreenPoint();
    const workArea = screen.getDisplayNearestPoint(cursor).workArea;
    this.companionPosition = clampToWorkArea(workArea, { width: COMPANION_SIZE, height: COMPANION_SIZE }, {
      x: cursor.x - this.dragOffset.x,
      y: cursor.y - this.dragOffset.y,
    });
    this.companionWindow.setPosition(Math.round(this.companionPosition.x), Math.round(this.companionPosition.y));
    this.placeBubbleWindow();
  }

  endDrag(): void {
    if (!this.dragOffset) return;
    this.dragOffset = null;
    this.saveCompanionPosition();
  }

  wanderTick(): void {
    const now = Date.now();
    const elapsed = now - this.lastWanderTick;
    this.lastWanderTick = now;
    if (!this.companionWindow || !this.companionWindow.isVisible()) return;

    const settings = this.store.getSettings();
    const shouldWander = canWander(this.host.assistantActive, this.host.isQuestionDisplayed,
      this.dragOffset !== null, settings.companionWanderingEnabled);
    let moved = false;
    if (shouldWander) {
      const workArea = screen.getDisplayNearestPoint(this.companionPosition).workArea;
      const next = this.wanderer.advance(this.companionPosition, workArea,
        { width: COMPANION_SIZE, height: COMPANION_SIZE }, elapsed);
      moved = next.x !== this.companionPosition.x || next.y !== this.companionPosition.y;
      this.companionPosition = next;
      if (moved) this.companionWindow.setPosition(Math.round(next.x), Math.round(next.y));
    }
    if (moved !== this.isMoving) {
      this.isMoving = moved;
      this.sendCompanionState();
      if (!moved) this.saveCompanionPosition();
    }
  }

  resetWanderer(): void {
    this.wanderer.reset();
  }

  get companionState(): CompanionStateView {
    return {
      visible: this.store.getSettings().companionVisible,
      paused: !this.host.assistantActive,
      questionDisplayed: this.host.isQuestionDisplayed,
      moving: this.isMoving,
    };
  }

  sendCompanionState(): void {
    this.companionWindow?.webContents.send(Channels.companionState, this.companionState);
  }

  resizeBubble(eventSender: Electron.WebContents, height: number): void {
    if (this.bubbleWindow && eventSender === this.bubbleWindow.webContents) {
      this.bubbleWindow.setSize(BUBBLE_WIDTH, height);
      this.placeBubbleWindow();
    }
  }

  private showCompanion(): void {
    this.companionWindow?.showInactive();
    this.sendCompanionState();
  }

  private createBubbleWindow(): BrowserWindow {
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
    this.hardenNavigation(window);
    window.on('closed', () => {
      this.bubbleWindow = null;
    });
    return window;
  }

  private sendBubbleView(window: BrowserWindow, view: BubbleView): void {
    window.webContents.send(Channels.bubbleView, view);
    this.placeBubbleWindow();
    window.show();
    window.focus();
  }

  private placeBubbleWindow(): void {
    if (!this.bubbleWindow || !this.companionWindow) return;
    const companion = this.companionWindow.getBounds();
    const workArea = screen.getDisplayMatching(companion).workArea;
    const height = Math.min(this.bubbleWindow.getBounds().height, workArea.height);
    this.bubbleWindow.setBounds(this.roundRect(placeBubble(workArea, companion,
      { width: BUBBLE_WIDTH, height }, BUBBLE_GAP)));
  }

  private saveCompanionPosition(): void {
    this.store.updateSettings({
      companionPosition: { x: Math.round(this.companionPosition.x), y: Math.round(this.companionPosition.y) },
    });
  }

  private hardenNavigation(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
  }

  private roundRect(rect: Rectangle): Electron.Rectangle {
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  }
}
