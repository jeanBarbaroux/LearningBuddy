import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import {
  MAX_INTERVAL_MINUTES,
  MAX_QUESTIONS_PER_SERIES,
  MIN_INTERVAL_MINUTES,
  MIN_QUESTIONS_PER_SERIES,
} from '../core/types';
import { Channels, type SettingsPatch } from '../shared/ipc';
import { expectBoolean, expectInteger, expectObject, expectOutcome, expectString } from './validation';

export interface IpcHost {
  getState(): unknown;
  listLibrary(): unknown;
  downloadLibraryPackage(id: string): void;
  importPackageFile(): Promise<unknown>;
  deletePackage(id: string): void;
  setPackageSelected(id: string, selected: boolean): void;
  setAssistantActive(active: boolean): void;
  reviewNow(): void;
  updateSettings(patch: SettingsPatch): void;
  setCompanionVisible(visible: boolean): void;
  companionClick(): void;
  companionContextMenu(): void;
  companionDragStart(): void;
  companionDragMove(): void;
  companionDragEnd(): void;
  companionHidden(): void;
  companionSetInteractive(sender: Electron.WebContents, interactive: boolean): void;
  bubbleAnswer(outcome: ReturnType<typeof expectOutcome>): void;
  bubbleClose(): void;
  bubbleResize(sender: Electron.WebContents, height: number): void;
}

export class IpcController {
  constructor(private readonly host: IpcHost) {}

  register(): void {
    this.handle(Channels.getState, () => this.host.getState());
    this.handle(Channels.listLibrary, () => this.host.listLibrary());
    this.handle(Channels.downloadLibraryPackage, (_event, id) => this.host.downloadLibraryPackage(expectString(id)));
    this.handle(Channels.importPackageFile, () => this.host.importPackageFile());
    this.handle(Channels.deletePackage, (_event, id) => this.host.deletePackage(expectString(id)));
    this.handle(Channels.setPackageSelected, (_event, id, selected) =>
      this.host.setPackageSelected(expectString(id), expectBoolean(selected)));
    this.handle(Channels.setAssistantActive, (_event, active) => this.host.setAssistantActive(expectBoolean(active)));
    this.handle(Channels.reviewNow, () => this.host.reviewNow());
    this.handle(Channels.updateSettings, (_event, patch) =>
      this.host.updateSettings(this.validateSettingsPatch(patch)));
    this.handle(Channels.setCompanionVisible, (_event, visible) => this.host.setCompanionVisible(expectBoolean(visible)));

    this.on(Channels.companionClick, () => this.host.companionClick());
    this.on(Channels.companionContextMenu, () => this.host.companionContextMenu());
    this.on(Channels.companionDragStart, () => this.host.companionDragStart());
    this.on(Channels.companionDragMove, () => this.host.companionDragMove());
    this.on(Channels.companionDragEnd, () => this.host.companionDragEnd());
    this.on(Channels.companionHidden, () => this.host.companionHidden());
    this.on(Channels.companionSetInteractive, (event, interactive) =>
      this.host.companionSetInteractive(event.sender, expectBoolean(interactive)));
    this.on(Channels.bubbleAnswer, (_event, outcome) => this.host.bubbleAnswer(expectOutcome(outcome)));
    this.on(Channels.bubbleClose, () => this.host.bubbleClose());
    this.on(Channels.bubbleResize, (event, height) =>
      this.host.bubbleResize(event.sender, expectInteger(Math.ceil(Number(height)), 80, 2000)));
  }

  private validateSettingsPatch(value: unknown): SettingsPatch {
    const patch = expectObject(value);
    const result: { -readonly [K in keyof SettingsPatch]?: SettingsPatch[K] } = {};
    if ('intervalMinutes' in patch) {
      result.intervalMinutes = expectInteger(patch.intervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
    }
    if ('questionsPerSeries' in patch) {
      result.questionsPerSeries = expectInteger(
        patch.questionsPerSeries, MIN_QUESTIONS_PER_SERIES, MAX_QUESTIONS_PER_SERIES);
    }
    if ('companionWanderingEnabled' in patch) {
      result.companionWanderingEnabled = expectBoolean(patch.companionWanderingEnabled);
    }
    return result;
  }

  private handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args) => {
      this.assertTrustedSender(event);
      return listener(event, ...args);
    });
  }

  private on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      try {
        this.assertTrustedSender(event);
        listener(event, ...args);
      } catch (error) {
        console.error(`IPC ${channel} :`, error);
      }
    });
  }

  private assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
    const url = event.senderFrame?.url ?? '';
    if (!url.startsWith('file://')) {
      throw new Error(`Expéditeur IPC non autorisé : ${url}`);
    }
  }
}
