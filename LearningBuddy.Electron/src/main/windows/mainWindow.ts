// The main window: pages Accueil, Bibliothèque, Paquets & questions, Statistiques, Avatar, Options.
// Closing it only hides it; the application keeps running in the notification area.
import { BrowserWindow } from 'electron';
import { APP_TITLE, hardenNavigation, iconPath, rendererPage, secureWebPreferences } from '../config';

export interface MainWindowHost {
  readonly isQuitting: boolean;
  /** The window was hidden instead of closed. */
  hiddenToTray(): void;
}

export class MainWindow {
  readonly window: BrowserWindow;

  constructor(host: MainWindowHost) {
    this.window = new BrowserWindow({
      title: APP_TITLE,
      width: 1100,
      height: 850,
      minWidth: 900,
      minHeight: 680,
      center: true,
      show: false,
      icon: iconPath(),
      autoHideMenuBar: true,
      webPreferences: secureWebPreferences(),
    });
    hardenNavigation(this.window);
    this.window.on('close', (event) => {
      if (!host.isQuitting) {
        event.preventDefault();
        this.window.hide();
        host.hiddenToTray();
      }
    });
    void this.window.loadFile(rendererPage('main'));
  }

  show(): void {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.show();
    this.window.focus();
  }

  send(channel: string, value: unknown): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, value);
    }
  }
}
