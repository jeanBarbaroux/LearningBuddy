// The companion: a transparent, always-on-top window showing the 3D owl. Transparent pixels let the
// mouse through; the user can drag it (position saved per display) and it can wander on its own.
import { BrowserWindow, screen, type Display } from 'electron';
import type { CompanionReaction } from '../../core/companion/avatarStoryboard';
import {
  canWander,
  clampToWorkArea,
  CompanionWanderer,
  DEFAULT_NORMALIZED_POSITION,
  denormalize,
  normalize,
} from '../../core/companion/companionLayout';
import type { ScreenPoint, ScreenRect } from '../../core/model';
import type { CompanionPosition } from '../../core/settings';
import { Push, type CompanionStateView } from '../../shared/ipc';
import { COMPANION_BASE_SIZE, hardenNavigation, rendererPage, secureWebPreferences } from '../config';

export interface CompanionWindowHost {
  /** Conditions of the companion state machine and of wandering. */
  companionConditions(): { paused: boolean; questionDisplayed: boolean; invitationDisplayed: boolean; wanderingAllowed: boolean };
  savePosition(position: CompanionPosition): void;
  /** The window moved: the bubble follows it. */
  moved(): void;
}

export class CompanionWindow {
  readonly window: BrowserWindow;
  /** Set to true when the application quits; until then closing the window is ignored. */
  closable = false;
  private visible = false;
  private size: number;
  private position: ScreenPoint = { x: 0, y: 0 };
  private dragOffset: ScreenPoint | null = null;
  private moving = false;
  private readonly wanderer = new CompanionWanderer();
  private lastWanderTick = Date.now();

  constructor(private readonly host: CompanionWindowHost, sizePercent: number, saved: CompanionPosition | null) {
    this.size = sizeFor(sizePercent);
    this.position = this.restorePosition(saved);
    this.window = new BrowserWindow({
      width: this.size,
      height: this.size,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      show: false,
      frame: false,
      transparent: false,
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
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setIgnoreMouseEvents(true, { forward: true });
    // Closing it externally is ignored: it only closes with the application.
    this.window.on('close', (event) => {
      if (!this.window.isDestroyed() && !this.closable) {
        event.preventDefault();
      }
    });
    hardenNavigation(this.window);
    this.window.webContents.on('did-finish-load', () => this.sendState());
    void this.window.loadFile(rendererPage('companion'));
    screen.on('display-metrics-changed', () => this.clampToScreen());
    screen.on('display-removed', () => this.clampToScreen());
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get isMoving(): boolean {
    return this.moving;
  }

  get isDragging(): boolean {
    return this.dragOffset !== null;
  }

  get bounds(): ScreenRect {
    return { x: this.position.x, y: this.position.y, width: this.size, height: this.size };
  }

  get display(): Display {
    return screen.getDisplayMatching(this.roundedBounds());
  }

  /** Showing plays the appear animation; hiding plays the disappear animation then hides the window. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }

    this.visible = visible;
    if (visible) {
      this.clampToScreen();
      this.window.showInactive();
    }

    this.sendState();
  }

  /** The disappear animation ended in the renderer. */
  onHiddenAnimationEnded(): void {
    if (!this.visible) {
      this.window.hide();
    }
  }

  setSizePercent(percent: number): void {
    const center = { x: this.position.x + this.size / 2, y: this.position.y + this.size / 2 };
    this.size = sizeFor(percent);
    this.position = this.clamp({ x: center.x - this.size / 2, y: center.y - this.size / 2 });
    this.window.setBounds(this.roundedBounds());
    this.savePosition();
    this.host.moved();
  }

  setInteractive(interactive: boolean): void {
    this.window.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  playReaction(reaction: CompanionReaction): void {
    this.window.webContents.send(Push.companionReaction, reaction);
  }

  sendState(): void {
    const conditions = this.host.companionConditions();
    const state: CompanionStateView = {
      visible: this.visible,
      paused: conditions.paused,
      questionDisplayed: conditions.questionDisplayed,
      invitationDisplayed: conditions.invitationDisplayed,
      moving: this.moving,
    };
    this.window.webContents.send(Push.companionState, state);
  }

  // Dragging -----------------------------------------------------------------------------------------

  startDrag(): void {
    const cursor = screen.getCursorScreenPoint();
    this.dragOffset = { x: cursor.x - this.position.x, y: cursor.y - this.position.y };
    this.wanderer.reset();
  }

  moveDrag(): void {
    if (!this.dragOffset) {
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const workArea = screen.getDisplayNearestPoint(cursor).workArea;
    this.moveTo(clampToWorkArea(workArea, this.sizeRect(), { x: cursor.x - this.dragOffset.x, y: cursor.y - this.dragOffset.y }));
  }

  endDrag(): void {
    if (this.dragOffset) {
      this.dragOffset = null;
      this.wanderer.reset();
      this.savePosition();
    }
  }

  // Wandering ----------------------------------------------------------------------------------------

  wanderTick(): void {
    const now = Date.now();
    const elapsed = now - this.lastWanderTick;
    this.lastWanderTick = now;
    const conditions = this.host.companionConditions();
    const allowed = this.visible && canWander(!conditions.paused, conditions.questionDisplayed, this.isDragging, conditions.wanderingAllowed);
    let moved = false;
    if (allowed) {
      const next = this.wanderer.advance(this.position, this.display.workArea, this.sizeRect(), elapsed);
      moved = next.x !== this.position.x || next.y !== this.position.y;
      if (moved) {
        this.moveTo(next);
      }
    }

    if (moved !== this.moving) {
      this.moving = moved;
      this.sendState();
      if (!moved) {
        this.savePosition();
      }
    }
  }

  resetWanderer(): void {
    this.wanderer.reset();
  }

  // -------------------------------------------------------------------------------------------------

  private moveTo(position: ScreenPoint): void {
    this.position = position;
    this.window.setPosition(Math.round(position.x), Math.round(position.y));
    this.host.moved();
  }

  private restorePosition(saved: CompanionPosition | null): ScreenPoint {
    const display = (saved && screen.getAllDisplays().find((candidate) => String(candidate.id) === saved.displayId))
      ?? screen.getPrimaryDisplay();
    return denormalize(display.workArea, this.sizeRect(), saved ?? DEFAULT_NORMALIZED_POSITION);
  }

  private savePosition(): void {
    const display = this.display;
    const normalized = normalize(display.workArea, this.sizeRect(), this.position);
    this.host.savePosition({ displayId: String(display.id), x: normalized.x, y: normalized.y });
  }

  private clampToScreen(): void {
    const clamped = this.clamp(this.position);
    if (clamped.x !== this.position.x || clamped.y !== this.position.y) {
      this.moveTo(clamped);
    }
  }

  private clamp(position: ScreenPoint): ScreenPoint {
    const workArea = screen.getDisplayNearestPoint({ x: Math.round(position.x), y: Math.round(position.y) }).workArea;
    return clampToWorkArea(workArea, this.sizeRect(), position);
  }

  private sizeRect(): { width: number; height: number } {
    return { width: this.size, height: this.size };
  }

  private roundedBounds(): Electron.Rectangle {
    return { x: Math.round(this.position.x), y: Math.round(this.position.y), width: this.size, height: this.size };
  }
}

function sizeFor(percent: number): number {
  return Math.round((COMPANION_BASE_SIZE * percent) / 100);
}
