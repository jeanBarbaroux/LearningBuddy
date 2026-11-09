// Contract between the main process and the windows: channel names, data exchanged and the bridge
// exposed to every renderer as `window.learningBuddy` by the preload script.
import type { LocalizedMessage } from '../core/errors';
import type { CardChoice, CardContent, CardType, RatingOutcome } from '../core/model';
import type { DailyReviewSlot } from '../core/review/dailySchedule';
import type { AppSettings, Language, ThemePreference } from '../core/settings';
import type {
  ActivityDay,
  CurrentIndicators,
  Granularity,
  LevelCounts,
  LevelTimelinePoint,
  OutcomeCounts,
  PresentationPoint,
} from '../core/statistics/statistics';

/** Request/response channels: the renderer awaits a Result. */
export const Invoke = {
  getState: 'app:get-state',
  getUiPreferences: 'app:get-ui-preferences',
  openExternal: 'app:open-external',
  startAssistant: 'assistant:start',
  pauseAssistant: 'assistant:pause',
  presentNow: 'assistant:present-now',
  setCompanionVisible: 'companion:set-visible',
  setWandering: 'companion:set-wandering',
  updatePreferences: 'settings:update-preferences',
  saveRhythm: 'settings:save-rhythm',
  importPackageFile: 'packages:import-file',
  createImportedPackage: 'packages:create-imported',
  saveTemplate: 'packages:save-template',
  exportPackage: 'packages:export',
  renamePackage: 'packages:rename',
  deletePackage: 'packages:delete',
  setPackageSelected: 'packages:set-selected',
  setPackagePercentages: 'packages:set-percentages',
  listCards: 'cards:list',
  getCard: 'cards:get',
  addCard: 'cards:add',
  updateCard: 'cards:update',
  deleteCard: 'cards:delete',
  chooseCardImage: 'cards:choose-image',
  listLibrary: 'library:list',
  getLibraryCards: 'library:cards',
  downloadLibraryPackage: 'library:download',
  getStatistics: 'statistics:get',
  toggleBubblePreview: 'avatar:toggle-bubble-preview',
} as const;

/** One-way messages from a renderer to the main process. */
export const Send = {
  companionClick: 'companion:click',
  companionContextMenu: 'companion:context-menu',
  companionDragStart: 'companion:drag-start',
  companionDragMove: 'companion:drag-move',
  companionDragEnd: 'companion:drag-end',
  companionHidden: 'companion:hidden',
  companionSetInteractive: 'companion:set-interactive',
  bubbleAnswer: 'bubble:answer',
  bubbleClose: 'bubble:close',
  bubblePause: 'bubble:pause',
  bubbleEditCard: 'bubble:edit-card',
  bubbleResize: 'bubble:resize',
  showImage: 'image:show',
  closeImage: 'image:close',
  invitationShow: 'invitation:show',
  invitationSnooze: 'invitation:snooze',
  invitationPause: 'invitation:pause',
} as const;

/** Messages pushed by the main process to renderers. */
export const Push = {
  stateChanged: 'app:state-changed',
  uiPreferences: 'app:ui-preferences',
  openCardEditor: 'app:open-card-editor',
  companionState: 'companion:state',
  companionReaction: 'companion:reaction',
  bubbleView: 'bubble:view',
  bubblePlacement: 'bubble:placement',
  imageView: 'image:view',
  invitationView: 'invitation:view',
} as const;

export type InvokeChannel = (typeof Invoke)[keyof typeof Invoke];
export type SendChannel = (typeof Send)[keyof typeof Send];
export type PushChannel = (typeof Push)[keyof typeof Push];

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LocalizedMessage };

/** Bridge exposed by the preload; renderer/lib/api.ts wraps it in typed functions. */
export interface LearningBuddyBridge {
  invoke(channel: InvokeChannel, ...args: unknown[]): Promise<Result<unknown>>;
  send(channel: SendChannel, ...args: unknown[]): void;
  on(channel: PushChannel, listener: (value: unknown) => void): void;
}

// ---------------------------------------------------------------------------------------------------
// Main window

export interface UiPreferences {
  readonly language: Language;
  /** Theme actually applied, "system" being resolved with the Windows setting. */
  readonly theme: 'light' | 'dark';
}

export interface AssistantView {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly teamsMeeting: boolean;
  /** The first Teams check has not finished yet: starting and presenting are disabled. */
  readonly teamsCheckPending: boolean;
  readonly teamsDetectionFailed: boolean;
  readonly questionDisplayed: boolean;
  readonly manualInProgress: boolean;
  readonly series: { readonly presented: number; readonly target: number } | null;
  readonly canPresentNow: boolean;
  readonly canPresentManually: boolean;
  readonly nextPresentationAt: number;
}

export interface PackageSummaryView {
  readonly id: string;
  readonly name: string;
  readonly cardCount: number;
  readonly updatedAt: number;
  readonly selected: boolean;
}

export interface AppStateView {
  readonly settings: AppSettings;
  readonly ui: UiPreferences;
  readonly assistant: AssistantView;
  readonly companionVisible: boolean;
  readonly bubblePreviewOpen: boolean;
  /** Packages sorted by name. */
  readonly packages: readonly PackageSummaryView[];
  /** Selected packages, in selection order. */
  readonly reviewPackages: readonly PackageSummaryView[];
  /** At least one selected package contains cards. */
  readonly hasReviewableCards: boolean;
}

export interface CardRow extends CardContent {
  readonly id: string;
  readonly packageId: string;
  readonly level: number;
}

export interface LibraryEntryView {
  readonly id: string;
  readonly title: string;
  readonly cardCount: number;
  readonly downloaded: boolean;
}

export interface ImportPreview {
  readonly fileName: string;
  readonly title: string;
  readonly cards: readonly CardContent[];
}

export type FileActionResult = { readonly status: 'saved'; readonly filePath: string } | { readonly status: 'cancelled' };

export interface StatisticsQuery {
  /** Null for every package. */
  readonly packageId: string | null;
  /** Local midnight of the first and last days of the period. */
  readonly start: number;
  readonly end: number;
}

export interface StatisticsView {
  readonly indicators: CurrentIndicators;
  readonly levels: LevelCounts;
  readonly activity: readonly (readonly ActivityDay[])[];
  readonly outcomes: OutcomeCounts;
  readonly granularity: Granularity;
  readonly presentations: readonly PresentationPoint[];
  readonly levelTimeline: readonly LevelTimelinePoint[];
}

/** Preferences saved as soon as they change (Options and Avatar pages). */
export interface PreferencesPatch {
  readonly language?: Language;
  readonly theme?: ThemePreference;
  readonly launchAtStartup?: boolean;
  readonly autoHideCompanionAfterSeries?: boolean;
  readonly pauseDuringTeamsMeetings?: boolean;
  readonly avatarSizePercent?: number;
  readonly bubbleSizePercent?: number;
}

/** "Votre rythme" form of the home page, saved with its Enregistrer button. */
export interface RhythmSettings {
  readonly useFixedSchedule: boolean;
  readonly intervalMinutes: number;
  readonly questionsPerSeries: number;
  readonly dailySlots: readonly DailyReviewSlot[];
  readonly snoozeMinutes: number;
}

// ---------------------------------------------------------------------------------------------------
// Companion, bubble, invitation and image windows

export interface CompanionStateView {
  readonly visible: boolean;
  readonly paused: boolean;
  readonly questionDisplayed: boolean;
  readonly invitationDisplayed: boolean;
  readonly moving: boolean;
}

export interface BubbleCardView {
  readonly id: string;
  readonly type: CardType;
  readonly question: string;
  readonly answer: string;
  readonly explanation: string | null;
  readonly choices: readonly CardChoice[];
  readonly imageDataUrl: string | null;
  readonly answerImageDataUrl: string | null;
  readonly level: number;
  /** Level after each self-assessment, shown on the rating buttons. */
  readonly nextLevels: Readonly<Record<RatingOutcome, number>>;
}

export type BubbleView =
  | {
    readonly kind: 'card';
    /** A preview only closes the bubble; it never records anything. */
    readonly preview: boolean;
    readonly card: BubbleCardView;
    /** Shown only when several packages are selected. */
    readonly packageName: string | null;
  }
  | { readonly kind: 'message'; readonly title: LocalizedMessage; readonly message: LocalizedMessage };

export interface ImageView {
  readonly dataUrl: string;
}

/** Side of the companion where the bubble is, and vertical position of its tail (CSS pixels). */
export interface BubblePlacementView {
  readonly side: 'left' | 'right';
  readonly tailY: number;
}

export interface InvitationView {
  readonly snoozeMinutes: number;
}
