// Notification area icon and the companion context menu (v1 CompanionTrayIcon, CompanionWindow menu).
// Menus are rebuilt each time they open so that the countdown is always current.
import { Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { Language } from '../core/settings';
import { text, type TextKey } from '../shared/i18n/i18n';
import { APP_TITLE, iconPath } from './config';

export interface TrayHost {
  readonly language: Language;
  /** "Prochaine question dans 00:04:12." or null when there is nothing to show. */
  countdownText(): string | null;
  readonly assistantActive: boolean;
  readonly companionVisible: boolean;
  /** During a Teams meeting the companion cannot be shown. */
  readonly canShowCompanion: boolean;
  readonly wanderingEnabled: boolean;
  setCompanionVisible(visible: boolean): void;
  toggleAssistant(): void;
  showMainWindow(): void;
  setWandering(enabled: boolean): void;
  quit(): void;
}

export class TrayController {
  private tray: Tray | null = null;

  constructor(private readonly host: TrayHost) {}

  create(): void {
    this.tray = new Tray(nativeImage.createFromPath(iconPath()));
    this.tray.setToolTip(APP_TITLE);
    // Left and right clicks open the same menu (v1).
    const open = (): void => this.tray?.popUpContextMenu(this.trayMenu());
    this.tray.on('click', open);
    this.tray.on('right-click', open);
  }

  /** Balloon shown the first time the main window is closed. */
  notify(message: string): void {
    this.tray?.displayBalloon({ title: APP_TITLE, content: message, iconType: 'info' });
  }

  showCompanionMenu(window: BrowserWindow): void {
    Menu.buildFromTemplate([
      ...this.countdownItem(),
      { label: this.t('HideCompanion'), click: () => this.host.setCompanionVisible(false) },
      this.assistantItem(),
      { label: this.t('ShowApplication'), click: () => this.host.showMainWindow() },
      this.wanderingItem(),
    ]).popup({ window });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private trayMenu(): Menu {
    const visible = this.host.companionVisible;
    return Menu.buildFromTemplate([
      ...this.countdownItem(),
      {
        label: this.t(visible ? 'HideCompanion' : 'ShowCompanion'),
        enabled: visible || this.host.canShowCompanion,
        click: () => this.host.setCompanionVisible(!visible),
      },
      { type: 'separator' },
      this.assistantItem(),
      { label: this.t('ShowApplication'), click: () => this.host.showMainWindow() },
      { type: 'separator' },
      this.wanderingItem(),
      { type: 'separator' },
      { label: this.t('ExitApplication'), click: () => this.host.quit() },
    ]);
  }

  private countdownItem(): MenuItemConstructorOptions[] {
    const countdown = this.host.countdownText();
    return countdown ? [{ label: countdown, enabled: false }, { type: 'separator' }] : [];
  }

  private assistantItem(): MenuItemConstructorOptions {
    return {
      label: this.t(this.host.assistantActive ? 'PauseAssistant' : 'ResumeAssistant'),
      click: () => this.host.toggleAssistant(),
    };
  }

  private wanderingItem(): MenuItemConstructorOptions {
    const enabled = this.host.wanderingEnabled;
    return {
      label: this.t(enabled ? 'DisableCompanionWandering' : 'EnableCompanionWandering'),
      click: () => this.host.setWandering(!enabled),
    };
  }

  private t(key: TextKey): string {
    return text(this.host.language, key);
  }
}
