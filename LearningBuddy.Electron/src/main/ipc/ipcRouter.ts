// Routes the IPC channels to the application. Every call checks that it comes from a local page of the
// application and validates its arguments; invocations always resolve to a Result so that renderers
// can display a translated error message.
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { Invoke, Send, type InvokeChannel, type Result, type SendChannel } from '../../shared/ipc';
import type { LearningBuddyApplication } from '../application';
import { describeError, toLocalizedMessage } from '../errors';
import {
  expectBoolean,
  expectCardContent,
  expectCardContents,
  expectNullableInteger,
  expectNumber,
  expectOutcome,
  expectPercentages,
  expectPreferences,
  expectRhythm,
  expectStatisticsQuery,
  expectString,
} from './validation';

type InvokeHandler = (args: unknown[], event: IpcMainInvokeEvent) => unknown;
type SendHandler = (args: unknown[], event: IpcMainEvent) => void;

export function registerIpc(application: LearningBuddyApplication): void {
  const app = application;
  const invokeHandlers: Record<InvokeChannel, InvokeHandler> = {
    [Invoke.getState]: () => app.getState(),
    [Invoke.getUiPreferences]: () => app.uiPreferences(),
    [Invoke.openExternal]: ([url]) => app.openExternal(expectString(url, 'lien', 4096)),
    [Invoke.startAssistant]: () => app.startAssistant(),
    [Invoke.pauseAssistant]: () => app.pauseAssistant(),
    [Invoke.presentNow]: () => app.presentNow(),
    [Invoke.setCompanionVisible]: ([visible]) => app.setCompanionVisible(expectBoolean(visible)),
    [Invoke.setWandering]: ([enabled]) => app.setWandering(expectBoolean(enabled)),
    [Invoke.updatePreferences]: ([patch]) => app.updatePreferences(expectPreferences(patch)),
    [Invoke.saveRhythm]: ([rhythm]) => app.saveRhythm(expectRhythm(rhythm)),
    [Invoke.importPackageFile]: () => app.importPackageFile(),
    [Invoke.createImportedPackage]: ([name, cards]) => app.createImportedPackage(expectString(name), expectCardContents(cards)),
    [Invoke.saveTemplate]: () => app.saveTemplate(),
    [Invoke.exportPackage]: ([id]) => app.exportPackage(expectString(id)),
    [Invoke.renamePackage]: ([id, name]) => app.renamePackage(expectString(id), expectString(name)),
    [Invoke.deletePackage]: ([id]) => app.deletePackage(expectString(id)),
    [Invoke.setPackageSelected]: ([id, selected]) => app.setPackageSelected(expectString(id), expectBoolean(selected)),
    [Invoke.setPackagePercentages]: ([percentages]) => app.setPackagePercentages(expectPercentages(percentages)),
    [Invoke.listCards]: ([packageId]) => app.listCards(expectString(packageId)),
    [Invoke.getCard]: ([cardId]) => app.getCard(expectString(cardId)),
    [Invoke.addCard]: ([packageId, card]) => app.addCard(expectString(packageId), expectCardContent(card)),
    [Invoke.updateCard]: ([cardId, card, level]) =>
      app.updateCard(expectString(cardId), expectCardContent(card), expectNullableInteger(level, 'niveau')),
    [Invoke.deleteCard]: ([cardId]) => app.deleteCard(expectString(cardId)),
    [Invoke.chooseCardImage]: () => app.chooseCardImage(),
    [Invoke.listLibrary]: () => app.listLibrary(),
    [Invoke.getLibraryCards]: ([id]) => app.getLibraryCards(expectString(id)),
    [Invoke.downloadLibraryPackage]: ([id]) => app.downloadLibraryPackage(expectString(id)),
    [Invoke.getStatistics]: ([query]) => app.getStatistics(expectStatisticsQuery(query)),
    [Invoke.toggleBubblePreview]: () => app.toggleBubblePreview(),
  };

  const companionOnly = (handler: SendHandler): SendHandler => (args, event) => {
    if (event.sender === app.companionWindow.window.webContents) {
      handler(args, event);
    }
  };
  const bubbleOnly = (handler: SendHandler): SendHandler => (args, event) => {
    if (app.bubbleWindow.owns(event.sender)) {
      handler(args, event);
    }
  };

  const sendHandlers: Record<SendChannel, SendHandler> = {
    [Send.companionClick]: companionOnly(() => app.companionClick()),
    [Send.companionContextMenu]: companionOnly(() => app.companionContextMenu()),
    [Send.companionDragStart]: companionOnly(() => app.companionWindow.startDrag()),
    [Send.companionDragMove]: companionOnly(() => app.companionWindow.moveDrag()),
    [Send.companionDragEnd]: companionOnly(() => app.companionWindow.endDrag()),
    [Send.companionHidden]: companionOnly(() => app.companionWindow.onHiddenAnimationEnded()),
    [Send.companionSetInteractive]: companionOnly(([interactive]) => app.companionWindow.setInteractive(expectBoolean(interactive))),
    [Send.bubbleAnswer]: bubbleOnly(([outcome]) => app.answer(expectOutcome(outcome))),
    [Send.bubbleClose]: bubbleOnly(() => app.closeBubbleWithoutResult()),
    [Send.bubblePause]: bubbleOnly(() => app.pauseAssistant()),
    [Send.bubbleEditCard]: bubbleOnly(([cardId]) => app.editCardFromBubble(expectString(cardId))),
    [Send.bubbleResize]: bubbleOnly(([height]) => app.bubbleWindow.resize(Math.min(Math.max(expectNumber(height), 60), 4000))),
    [Send.showImage]: ([dataUrl]) => app.showImage(expectImageDataUrl(dataUrl)),
    [Send.closeImage]: () => app.closeImage(),
    [Send.invitationShow]: () => app.acceptInvitation(),
    [Send.invitationSnooze]: () => app.snoozeInvitation(),
    [Send.invitationPause]: () => app.pauseAssistant(),
  };

  for (const [channel, handler] of Object.entries(invokeHandlers)) {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
      try {
        assertTrustedSender(event);
        return { ok: true, value: await handler(args, event) };
      } catch (error) {
        console.error(`IPC ${channel} :`, describeError(error));
        return { ok: false, error: toLocalizedMessage(error) };
      }
    });
  }

  for (const [channel, handler] of Object.entries(sendHandlers)) {
    ipcMain.on(channel, (event, ...args) => {
      try {
        assertTrustedSender(event);
        handler(args, event);
      } catch (error) {
        console.error(`IPC ${channel} :`, describeError(error));
      }
    });
  }
}

function expectImageDataUrl(value: unknown): string {
  const dataUrl = expectString(value, 'image');
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('Image invalide.');
  }

  return dataUrl;
}

function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith('file://')) {
    throw new Error(`Expéditeur IPC non autorisé : ${url}`);
  }
}
