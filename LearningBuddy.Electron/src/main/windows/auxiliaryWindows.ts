// Small windows: the review invitation shown while the companion is hidden (v1 ReviewInvitationWindow)
// and the enlarged image opened from the bubble (v1 ImagePreviewWindow).
import { BrowserWindow, screen } from 'electron';
import { Push, type ImageView, type InvitationView } from '../../shared/ipc';
import { APP_TITLE, hardenNavigation, iconPath, rendererPage, secureWebPreferences, type RendererName } from '../config';

const INVITATION_SIZE = { width: 440, height: 112 };
const INVITATION_MARGIN = 12;

/** A window created on first use, whose page receives one message every time it is shown. */
class SingleMessageWindow<T> {
  private window: BrowserWindow | null = null;
  private loaded: Promise<void> | null = null;

  constructor(
    private readonly page: RendererName,
    private readonly channel: string,
    private readonly options: () => Electron.BrowserWindowConstructorOptions,
    private readonly activate: boolean,
  ) {}

  show(message: T, bounds: Electron.Rectangle): void {
    const window = this.ensureWindow();
    void this.loaded!.then(() => {
      if (window.isDestroyed()) {
        return;
      }

      window.webContents.send(this.channel, message);
      window.setBounds(bounds);
      if (this.activate) {
        window.show();
        window.focus();
      } else {
        window.showInactive();
      }
    });
  }

  close(): void {
    this.window?.hide();
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const window = new BrowserWindow({ ...this.options(), show: false, webPreferences: secureWebPreferences() });
    hardenNavigation(window);
    window.on('closed', () => {
      this.window = null;
      this.loaded = null;
    });
    this.window = window;
    this.loaded = window.loadFile(rendererPage(this.page));
    return window;
  }
}

export class InvitationWindow {
  private readonly window = new SingleMessageWindow<InvitationView>('invitation', Push.invitationView, () => ({
    ...INVITATION_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
  }), false);

  /** Bottom-right corner of the primary work area. */
  show(view: InvitationView): void {
    const workArea = screen.getPrimaryDisplay().workArea;
    this.window.show(view, {
      x: workArea.x + workArea.width - INVITATION_SIZE.width - INVITATION_MARGIN,
      y: workArea.y + workArea.height - INVITATION_SIZE.height - INVITATION_MARGIN,
      ...INVITATION_SIZE,
    });
  }

  close(): void {
    this.window.close();
  }

  destroy(): void {
    this.window.destroy();
  }
}

export class ImageWindow {
  private readonly window = new SingleMessageWindow<ImageView>('image', Push.imageView, () => ({
    title: APP_TITLE,
    icon: iconPath(),
    autoHideMenuBar: true,
    alwaysOnTop: true,
    minimizable: false,
  }), true);

  /** The image is fitted in at most 1100 × 800 pixels, and in the work area. */
  show(view: ImageView, near: Electron.Point): void {
    const workArea = screen.getDisplayNearestPoint(near).workArea;
    const width = Math.min(1100, workArea.width - 88);
    const height = Math.min(800, workArea.height - 128);
    this.window.show(view, {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
    });
  }

  close(): void {
    this.window.close();
  }

  destroy(): void {
    this.window.destroy();
  }
}
