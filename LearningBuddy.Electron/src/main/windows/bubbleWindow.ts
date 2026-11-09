// The review bubble shown beside the companion (v1 ReviewPromptWindow). It does not take the focus when
// it appears, follows the companion, and its size follows the "Bulle" preference of the Avatar page.
import { BrowserWindow, screen } from 'electron';
import { placeBubble } from '../../core/companion/companionLayout';
import type { ScreenRect } from '../../core/model';
import { Push, type BubblePlacementView, type BubbleView } from '../../shared/ipc';
import {
  BUBBLE_BASE_MAX_HEIGHT,
  BUBBLE_BASE_WIDTH,
  BUBBLE_GAP,
  hardenNavigation,
  rendererPage,
  secureWebPreferences,
} from '../config';

export class BubbleWindow {
  private window: BrowserWindow | null = null;
  private loaded: Promise<void> | null = null;
  private destroying = false;
  /** Height of the content in CSS pixels, reported by the renderer. */
  private contentHeight = 240;
  private companion: ScreenRect = { x: 0, y: 0, width: 0, height: 0 };

  /** `onCloseRequested` is called when Windows closes the bubble (Alt+F4): it counts as "no result". */
  constructor(private sizePercent: number, private readonly onCloseRequested: () => void) {}

  get isOpen(): boolean {
    return this.window?.isVisible() ?? false;
  }

  owns(sender: Electron.WebContents): boolean {
    return this.window?.webContents === sender;
  }

  show(view: BubbleView, companion: ScreenRect): void {
    this.companion = companion;
    const window = this.ensureWindow();
    void this.loaded!.then(() => {
      if (window.isDestroyed()) {
        return;
      }

      window.webContents.setZoomFactor(this.scale());
      window.webContents.send(Push.bubbleView, view);
      this.place();
      window.showInactive();
    });
  }

  close(): void {
    this.window?.hide();
  }

  /** The renderer measured its content. */
  resize(contentHeight: number): void {
    this.contentHeight = contentHeight;
    this.place();
  }

  followCompanion(companion: ScreenRect): void {
    this.companion = companion;
    if (this.isOpen) {
      this.place();
    }
  }

  setSizePercent(percent: number): void {
    this.sizePercent = percent;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.setZoomFactor(this.scale());
      this.place();
    }
  }

  destroy(): void {
    this.destroying = true;
    this.window?.destroy();
    this.window = null;
  }

  /** Preference scale, reduced so that the bubble always fits the work area. */
  private scale(): number {
    const workArea = screen.getDisplayMatching(this.roundedCompanion()).workArea;
    return Math.min(this.sizePercent / 100, workArea.width / BUBBLE_BASE_WIDTH, workArea.height / BUBBLE_BASE_MAX_HEIGHT);
  }

  private place(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    const scale = this.scale();
    const workArea = screen.getDisplayMatching(this.roundedCompanion()).workArea;
    const size = {
      width: Math.round(BUBBLE_BASE_WIDTH * scale),
      height: Math.min(Math.ceil(Math.min(this.contentHeight, BUBBLE_BASE_MAX_HEIGHT) * scale), workArea.height),
    };
    const placement = placeBubble(workArea, this.companion, size, BUBBLE_GAP);
    window.setBounds({
      x: Math.round(placement.x),
      y: Math.round(placement.y),
      width: Math.round(placement.width),
      height: Math.round(placement.height),
    });
    const view: BubblePlacementView = { side: placement.side, tailY: placement.tailY / scale };
    window.webContents.send(Push.bubblePlacement, view);
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const window = new BrowserWindow({
      width: BUBBLE_BASE_WIDTH,
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
    window.on('close', (event) => {
      if (!this.destroying) {
        event.preventDefault();
        this.onCloseRequested();
      }
    });
    window.on('closed', () => {
      this.window = null;
      this.loaded = null;
    });
    this.window = window;
    this.loaded = window.loadFile(rendererPage('bubble'));
    return window;
  }

  private roundedCompanion(): Electron.Rectangle {
    return {
      x: Math.round(this.companion.x),
      y: Math.round(this.companion.y),
      width: Math.max(1, Math.round(this.companion.width)),
      height: Math.max(1, Math.round(this.companion.height)),
    };
  }
}
