import { app, Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { APP_TITLE, iconPath } from './config';

export interface TrayHost {
  showMainWindow(): void;
  reviewNow(): void;
  setAssistantActive(active: boolean): void;
  updateSettings(): void;
  setCompanionVisible(visible: boolean): void;
  readonly assistantActive: boolean;
  readonly companionVisible: boolean;
  readonly wanderingEnabled: boolean;
  readonly menuWindow: BrowserWindow | null;
}

export class TrayController {
  private tray: Tray | null = null;

  constructor(private readonly host: TrayHost) {}

  create(): void {
    this.tray = new Tray(nativeImage.createFromPath(iconPath()));
    this.tray.setToolTip(APP_TITLE);
    this.tray.on('click', () => this.host.showMainWindow());
    this.refresh();
  }

  refresh(): void {
    this.tray?.setContextMenu(Menu.buildFromTemplate([
      ...this.commonMenuItems(),
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() },
    ]));
  }

  private commonMenuItems(): MenuItemConstructorOptions[] {
    return [
      { label: 'Réviser maintenant', click: () => this.host.reviewNow() },
      {
        label: this.host.assistantActive ? 'Mettre l’assistant en pause' : 'Démarrer l’assistant',
        click: () => this.host.setAssistantActive(!this.host.assistantActive),
      },
      {
        label: 'Promenade du compagnon',
        type: 'checkbox',
        checked: this.host.wanderingEnabled,
        click: () => this.host.updateSettings(),
      },
      {
        label: this.host.companionVisible ? 'Masquer le compagnon' : 'Afficher le compagnon',
        click: () => this.host.setCompanionVisible(!this.host.companionVisible),
      },
      { type: 'separator' },
      { label: 'Ouvrir LearningBuddy', click: () => this.host.showMainWindow() },
    ];
  }

  showCompanionMenu(): void {
    if (this.host.menuWindow) {
      Menu.buildFromTemplate(this.commonMenuItems()).popup({ window: this.host.menuWindow });
    }
  }
}
