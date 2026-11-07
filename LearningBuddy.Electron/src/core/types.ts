// Domain types shared by the main process and the renderers. Dates are epoch milliseconds.

export type CardType = 'card' | 'qcm';

export interface CardChoice {
  readonly text: string;
  readonly correct: boolean;
}

export interface ImportedCard {
  readonly type: CardType;
  readonly question: string;
  readonly answer: string;
  readonly explanation: string | null;
  readonly language: string | null;
  readonly tags: readonly string[];
  readonly choices: readonly CardChoice[];
  /** Base64 PNG or JPEG shown with the question. */
  readonly image: string | null;
  /** Base64 PNG or JPEG shown with the answer. */
  readonly answerImage: string | null;
}

export interface ImportedPackage {
  readonly title: string;
  readonly cards: readonly ImportedCard[];
}

export interface CardRecord extends ImportedCard {
  readonly id: string;
  readonly packageId: string;
  readonly position: number;
  readonly createdAt: number;
}

export interface PackageRecord {
  readonly id: string;
  readonly name: string;
  /** Identifier of the bundled library package it was downloaded from, if any. */
  readonly libraryId: string | null;
  readonly createdAt: number;
}

export interface CardReviewState {
  readonly cardId: string;
  readonly level: number;
  readonly dueAt: number;
  readonly lastReviewedAt: number | null;
}

export type ReviewOutcome = 'again' | 'hard' | 'good' | 'easy' | 'passed' | 'noResult';

export const REVIEW_OUTCOMES: readonly ReviewOutcome[] = ['again', 'hard', 'good', 'easy', 'passed', 'noResult'];

export interface ReviewEvent {
  readonly id: string;
  readonly cardId: string;
  readonly shownAt: number;
  readonly answeredAt: number;
  readonly outcome: ReviewOutcome;
  readonly levelBefore: number;
  readonly levelAfter: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenRect extends ScreenPoint, ScreenSize {}

export interface AppSettings {
  readonly assistantEnabled: boolean;
  readonly intervalMinutes: number;
  readonly questionsPerSeries: number;
  readonly companionVisible: boolean;
  readonly companionWanderingEnabled: boolean;
  /** Packages reviewed by the assistant; null means every package. */
  readonly reviewPackageIds: readonly string[] | null;
  readonly companionPosition: ScreenPoint | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  assistantEnabled: false,
  intervalMinutes: 10,
  questionsPerSeries: 1,
  companionVisible: true,
  companionWanderingEnabled: false,
  reviewPackageIds: null,
  companionPosition: null,
};

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 24 * 60;
export const MIN_QUESTIONS_PER_SERIES = 1;
export const MAX_QUESTIONS_PER_SERIES = 50;
