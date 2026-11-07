// IPC contract shared by the main process, the preload and the renderers.
import type { CompanionReaction } from '../core/avatarStoryboard';
import type { AppSettings, CardType, ReviewOutcome } from '../core/types';

export const Channels = {
  getState: 'app:get-state',
  stateChanged: 'app:state-changed',
  listLibrary: 'library:list',
  downloadLibraryPackage: 'library:download',
  importPackageFile: 'packages:import-file',
  deletePackage: 'packages:delete',
  setPackageSelected: 'packages:set-selected',
  setAssistantActive: 'assistant:set-active',
  reviewNow: 'assistant:review-now',
  updateSettings: 'settings:update',
  setCompanionVisible: 'companion:set-visible',
  companionState: 'companion:state',
  companionReaction: 'companion:reaction',
  companionClick: 'companion:click',
  companionContextMenu: 'companion:context-menu',
  companionDragStart: 'companion:drag-start',
  companionDragMove: 'companion:drag-move',
  companionDragEnd: 'companion:drag-end',
  companionHidden: 'companion:hidden',
  companionSetInteractive: 'companion:set-interactive',
  bubbleView: 'bubble:view',
  bubbleAnswer: 'bubble:answer',
  bubbleClose: 'bubble:close',
  bubbleResize: 'bubble:resize',
} as const;

export interface PackageView {
  readonly id: string;
  readonly name: string;
  readonly cardCount: number;
  readonly selected: boolean;
}

export interface LibraryEntryView {
  readonly id: string;
  readonly title: string;
  readonly cardCount: number;
  readonly downloaded: boolean;
}

export interface AppStateView {
  readonly settings: AppSettings;
  readonly assistant: {
    readonly active: boolean;
    readonly nextPresentationAt: number;
    readonly series: { readonly presented: number; readonly target: number } | null;
  };
  readonly statistics: {
    readonly packageCount: number;
    readonly cardCount: number;
    readonly dueCount: number;
    readonly reviewedToday: number;
  };
  readonly packages: readonly PackageView[];
}

export interface CompanionStateView {
  readonly visible: boolean;
  readonly paused: boolean;
  readonly questionDisplayed: boolean;
  readonly moving: boolean;
}

export interface CardView {
  readonly type: CardType;
  readonly question: string;
  readonly answer: string;
  readonly explanation: string | null;
  readonly choices: readonly { readonly text: string; readonly correct: boolean }[];
  readonly imageDataUrl: string | null;
  readonly answerImageDataUrl: string | null;
}

export type BubbleView =
  | {
    readonly kind: 'card';
    readonly packageName: string;
    readonly card: CardView;
    readonly series: { readonly index: number; readonly target: number } | null;
  }
  | { readonly kind: 'message'; readonly text: string };

export type ImportResult =
  | { readonly status: 'imported'; readonly name: string; readonly cardCount: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string };

export interface SettingsPatch {
  readonly intervalMinutes?: number;
  readonly questionsPerSeries?: number;
  readonly companionWanderingEnabled?: boolean;
}

/** API exposed to every renderer as `window.certifBuddy` through the preload. */
export interface CertifBuddyApi {
  getState(): Promise<AppStateView>;
  onStateChanged(listener: (state: AppStateView) => void): void;
  listLibrary(): Promise<LibraryEntryView[]>;
  downloadLibraryPackage(id: string): Promise<void>;
  importPackageFile(): Promise<ImportResult>;
  deletePackage(id: string): Promise<void>;
  setPackageSelected(id: string, selected: boolean): Promise<void>;
  setAssistantActive(active: boolean): Promise<void>;
  reviewNow(): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<void>;
  setCompanionVisible(visible: boolean): Promise<void>;

  onCompanionState(listener: (state: CompanionStateView) => void): void;
  onCompanionReaction(listener: (reaction: CompanionReaction) => void): void;
  companionClick(): void;
  companionContextMenu(): void;
  companionDragStart(): void;
  companionDragMove(): void;
  companionDragEnd(): void;
  companionHidden(): void;
  /** Transparent pixels let clicks through to the desktop; only the avatar itself captures the mouse. */
  companionSetInteractive(interactive: boolean): void;

  onBubbleView(listener: (view: BubbleView) => void): void;
  bubbleAnswer(outcome: ReviewOutcome): void;
  bubbleClose(): void;
  bubbleResize(height: number): void;
}
