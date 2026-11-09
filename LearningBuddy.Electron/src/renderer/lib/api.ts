// Typed access to the main process for every window. Failed invocations throw a UiError carrying a
// message that the page can translate and display.
import type { CompanionReaction } from '../../core/companion/avatarStoryboard';
import type { LocalizedMessage } from '../../core/errors';
import type { CardContent, ReviewOutcome } from '../../core/model';
import {
  Invoke,
  Push,
  Send,
  type AppStateView,
  type BubblePlacementView,
  type BubbleView,
  type CardRow,
  type CompanionStateView,
  type FileActionResult,
  type ImageView,
  type ImportPreview,
  type InvitationView,
  type InvokeChannel,
  type LearningBuddyBridge,
  type LibraryEntryView,
  type PreferencesPatch,
  type PushChannel,
  type RhythmSettings,
  type StatisticsQuery,
  type StatisticsView,
  type UiPreferences,
} from '../../shared/ipc';

declare global {
  interface Window {
    readonly learningBuddy: LearningBuddyBridge;
  }
}

export class UiError extends Error {
  constructor(readonly localized: LocalizedMessage) {
    super(localized.key);
    this.name = 'UiError';
  }
}

const bridge = (): LearningBuddyBridge => window.learningBuddy;

async function call<T>(channel: InvokeChannel, ...args: unknown[]): Promise<T> {
  const result = await bridge().invoke(channel, ...args);
  if (!result.ok) {
    throw new UiError(result.error);
  }

  return result.value as T;
}

function on<T>(channel: PushChannel, listener: (value: T) => void): void {
  bridge().on(channel, (value) => listener(value as T));
}

export const api = {
  app: {
    getState: () => call<AppStateView>(Invoke.getState),
    getUiPreferences: () => call<UiPreferences>(Invoke.getUiPreferences),
    onState: (listener: (state: AppStateView) => void) => on(Push.stateChanged, listener),
    onUiPreferences: (listener: (preferences: UiPreferences) => void) => on(Push.uiPreferences, listener),
    onOpenCardEditor: (listener: (cardId: string) => void) => on(Push.openCardEditor, listener),
    /** Opens an http(s) link, or "other-resources" for the v1 wiki link. */
    openExternal: (url: string) => call<void>(Invoke.openExternal, url),
  },
  assistant: {
    start: () => call<void>(Invoke.startAssistant),
    pause: () => call<void>(Invoke.pauseAssistant),
    presentNow: () => call<void>(Invoke.presentNow),
  },
  companion: {
    setVisible: (visible: boolean) => call<void>(Invoke.setCompanionVisible, visible),
    setWandering: (enabled: boolean) => call<void>(Invoke.setWandering, enabled),
  },
  settings: {
    updatePreferences: (patch: PreferencesPatch) => call<void>(Invoke.updatePreferences, patch),
    saveRhythm: (rhythm: RhythmSettings) => call<void>(Invoke.saveRhythm, rhythm),
  },
  packages: {
    importFile: () => call<ImportPreview | null>(Invoke.importPackageFile),
    createImported: (name: string, cards: readonly CardContent[]) => call<string>(Invoke.createImportedPackage, name, cards),
    saveTemplate: () => call<FileActionResult>(Invoke.saveTemplate),
    export: (id: string) => call<FileActionResult>(Invoke.exportPackage, id),
    rename: (id: string, name: string) => call<void>(Invoke.renamePackage, id, name),
    delete: (id: string) => call<void>(Invoke.deletePackage, id),
    setSelected: (id: string, selected: boolean) => call<void>(Invoke.setPackageSelected, id, selected),
    setPercentages: (percentages: Record<string, number>) => call<void>(Invoke.setPackagePercentages, percentages),
  },
  cards: {
    list: (packageId: string) => call<CardRow[]>(Invoke.listCards, packageId),
    get: (cardId: string) => call<CardRow>(Invoke.getCard, cardId),
    add: (packageId: string, card: CardContent) => call<string>(Invoke.addCard, packageId, card),
    update: (cardId: string, card: CardContent, level: number | null) => call<void>(Invoke.updateCard, cardId, card, level),
    delete: (cardId: string) => call<void>(Invoke.deleteCard, cardId),
    chooseImage: () => call<string | null>(Invoke.chooseCardImage),
  },
  library: {
    list: () => call<LibraryEntryView[]>(Invoke.listLibrary),
    cards: (id: string) => call<CardContent[]>(Invoke.getLibraryCards, id),
    download: (id: string) => call<string>(Invoke.downloadLibraryPackage, id),
  },
  statistics: {
    get: (query: StatisticsQuery) => call<StatisticsView>(Invoke.getStatistics, query),
  },
  avatar: {
    toggleBubblePreview: () => call<void>(Invoke.toggleBubblePreview),
  },
  companionWindow: {
    onState: (listener: (state: CompanionStateView) => void) => on(Push.companionState, listener),
    onReaction: (listener: (reaction: CompanionReaction) => void) => on(Push.companionReaction, listener),
    click: () => bridge().send(Send.companionClick),
    contextMenu: () => bridge().send(Send.companionContextMenu),
    dragStart: () => bridge().send(Send.companionDragStart),
    dragMove: () => bridge().send(Send.companionDragMove),
    dragEnd: () => bridge().send(Send.companionDragEnd),
    hidden: () => bridge().send(Send.companionHidden),
    /** Transparent pixels let clicks through to the desktop; only the avatar itself captures the mouse. */
    setInteractive: (interactive: boolean) => bridge().send(Send.companionSetInteractive, interactive),
  },
  bubble: {
    onView: (listener: (view: BubbleView) => void) => on(Push.bubbleView, listener),
    onPlacement: (listener: (placement: BubblePlacementView) => void) => on(Push.bubblePlacement, listener),
    answer: (outcome: ReviewOutcome) => bridge().send(Send.bubbleAnswer, outcome),
    close: () => bridge().send(Send.bubbleClose),
    pause: () => bridge().send(Send.bubblePause),
    editCard: (cardId: string) => bridge().send(Send.bubbleEditCard, cardId),
    resize: (height: number) => bridge().send(Send.bubbleResize, height),
    showImage: (dataUrl: string) => bridge().send(Send.showImage, dataUrl),
  },
  image: {
    onView: (listener: (view: ImageView) => void) => on(Push.imageView, listener),
    close: () => bridge().send(Send.closeImage),
  },
  invitation: {
    onView: (listener: (view: InvitationView) => void) => on(Push.invitationView, listener),
    show: () => bridge().send(Send.invitationShow),
    snooze: () => bridge().send(Send.invitationSnooze),
    pause: () => bridge().send(Send.invitationPause),
  },
};
