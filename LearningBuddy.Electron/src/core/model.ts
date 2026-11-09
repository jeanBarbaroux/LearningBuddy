// Domain model shared by the main process and the renderers. Dates are epoch milliseconds (UTC).

export type CardType = 'card' | 'qcm';

export interface CardChoice {
  readonly text: string;
  readonly correct: boolean;
}

/** Editable content of a card, as imported, exported or saved by the card editor. */
export interface CardContent {
  readonly type: CardType;
  /** May be empty only when the question has an image. */
  readonly question: string;
  readonly answer: string;
  readonly explanation: string | null;
  /** BCP 47 language tag. */
  readonly language: string | null;
  readonly tags: readonly string[];
  /** Answer choices of a QCM; always empty for a classic card. */
  readonly choices: readonly CardChoice[];
  /** Base64 PNG or JPEG shown with the question. */
  readonly image: string | null;
  /** Base64 PNG or JPEG shown with the answer. */
  readonly answerImage: string | null;
}

export interface Card extends CardContent {
  readonly id: string;
  readonly packageId: string;
  /** Order of the card in its package; never compacted after a deletion. */
  readonly position: number;
  readonly createdAt: number;
}

export interface Package {
  readonly id: string;
  readonly name: string;
  /** Library entry (file name without extension) this package was downloaded from. */
  readonly librarySource: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A package parsed from a JSON file, before it is stored. */
export interface PackageContent {
  readonly title: string;
  readonly cards: readonly CardContent[];
}

export interface CardReviewState {
  readonly cardId: string;
  /** 0 or more, without upper bound. */
  readonly level: number;
  readonly dueAt: number;
  readonly lastReviewedAt: number | null;
}

export type ReviewOutcome = 'again' | 'hard' | 'good' | 'easy' | 'passed' | 'noResult';

export const REVIEW_OUTCOMES: readonly ReviewOutcome[] = ['again', 'hard', 'good', 'easy', 'passed', 'noResult'];

/** Self-assessments that change the review state of a card. */
export const RATING_OUTCOMES = ['again', 'hard', 'good', 'easy'] as const;
export type RatingOutcome = (typeof RATING_OUTCOMES)[number];

/** One presentation of a card. It is created when the card is shown and completed once answered. */
export interface ReviewEvent {
  readonly id: string;
  readonly cardId: string;
  readonly shownAt: number;
  readonly answeredAt: number | null;
  readonly outcome: ReviewOutcome | null;
  readonly levelBefore: number;
  readonly levelAfter: number | null;
  readonly dueAtBefore: number;
  readonly dueAtAfter: number | null;
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
