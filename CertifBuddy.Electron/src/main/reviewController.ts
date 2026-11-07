// Orchestrates review presentations: card selection, series, outcomes and companion reactions.
// It is independent from Electron so that it can be unit tested.
import { AssistantSession } from '../core/assistantSession';
import { reactionForOutcome, type CompanionReaction } from '../core/avatarStoryboard';
import { imageMimeType } from '../core/packageParser';
import { selectNextCard } from '../core/reviewScheduler';
import type { CardRecord, ReviewOutcome } from '../core/types';
import type { BubbleView, CardView } from '../shared/ipc';
import type { LocalStore } from './store';

export interface ReviewControllerHost {
  showBubble(view: BubbleView): void;
  closeBubble(): void;
  /** A question is displayed or closed: the companion must be visible and switch to "request". */
  setQuestionDisplayed(displayed: boolean): void;
  playReaction(reaction: CompanionReaction): void;
  stateChanged(): void;
  schedule(callback: () => void, delayMs: number): void;
}

/** Pause between two questions of the same series, so the reaction has time to play. */
export const SERIES_NEXT_QUESTION_DELAY_MS = 1200;

interface Presentation {
  readonly cardId: string;
  readonly shownAt: number;
}

export class ReviewController {
  private presentation: Presentation | null = null;
  private messageDisplayed = false;
  private lastCardId: string | null = null;
  private readonly seriesCardIds = new Set<string>();

  constructor(
    private readonly store: LocalStore,
    readonly session: AssistantSession,
    private readonly host: ReviewControllerHost,
    private readonly now: () => number = Date.now,
  ) {}

  get isPresenting(): boolean {
    return this.presentation !== null;
  }

  /** Called periodically: presents the next card of the series when the assistant is due. */
  tick(): void {
    if (!this.presentation && !this.messageDisplayed && this.session.isDue()) {
      this.presentNext(false);
    }
  }

  presentNext(manual: boolean): void {
    if (this.presentation) {
      return;
    }

    const { reviewPackageIds } = this.store.getSettings();
    const candidates = this.store.getReviewCandidates(reviewPackageIds);
    const state = selectNextCard(candidates.states, {
      lastCardId: this.lastCardId,
      excludedCardIds: this.seriesCardIds,
      packageIdsByCardId: candidates.packageIdsByCardId,
    });
    const card = state ? this.store.getCard(state.cardId) : null;
    if (!card) {
      if (!manual) {
        this.session.noCardAvailable();
        this.seriesCardIds.clear();
      }

      this.showMessage(candidates.states.length === 0
        ? 'Aucune carte à réviser. Ajoutez un paquet depuis la bibliothèque ou sélectionnez des paquets.'
        : 'Toutes les cartes de cette série ont été présentées.');
      return;
    }

    this.session.beginPresentation(manual);
    this.presentation = { cardId: card.id, shownAt: this.now() };
    this.host.setQuestionDisplayed(true);
    const series = this.session.seriesProgress;
    this.host.showBubble({
      kind: 'card',
      packageName: this.store.getPackage(card.packageId)?.name ?? '',
      card: toCardView(card),
      series: manual || !series ? null : { index: series.presented + 1, target: series.target },
    });
    this.host.stateChanged();
  }

  answer(outcome: ReviewOutcome): void {
    const presentation = this.presentation;
    if (!presentation) {
      this.dismissMessage();
      return;
    }

    this.presentation = null;
    this.store.recordOutcome(presentation.cardId, presentation.shownAt, outcome, this.now());
    this.lastCardId = presentation.cardId;
    this.host.closeBubble();
    this.host.setQuestionDisplayed(false);
    const reaction = reactionForOutcome(outcome);
    if (reaction) {
      this.host.playReaction(reaction);
    }

    const continueSeries = this.session.completePresentation();
    if (continueSeries) {
      this.seriesCardIds.add(presentation.cardId);
      this.host.schedule(() => this.tick(), SERIES_NEXT_QUESTION_DELAY_MS);
    } else {
      this.seriesCardIds.clear();
    }

    this.host.stateChanged();
  }

  /** Closing the bubble without assessing the card records "no result" and keeps the card level. */
  close(): void {
    if (this.presentation) {
      this.answer('noResult');
    } else {
      this.dismissMessage();
    }
  }

  setAssistantActive(active: boolean): void {
    if (active) {
      this.session.start();
    } else {
      this.session.pause();
      this.seriesCardIds.clear();
    }

    this.host.stateChanged();
  }

  private showMessage(text: string): void {
    this.messageDisplayed = true;
    this.host.showBubble({ kind: 'message', text });
    this.host.stateChanged();
  }

  private dismissMessage(): void {
    if (!this.messageDisplayed) {
      return;
    }

    this.messageDisplayed = false;
    this.host.closeBubble();
  }
}

export function toCardView(card: CardRecord): CardView {
  return {
    type: card.type,
    question: card.question,
    answer: card.answer,
    explanation: card.explanation,
    choices: card.choices.map((choice) => ({ text: choice.text, correct: choice.correct })),
    imageDataUrl: toDataUrl(card.image),
    answerImageDataUrl: toDataUrl(card.answerImage),
  };
}

function toDataUrl(base64: string | null): string | null {
  const mime = base64 ? imageMimeType(base64) : null;
  return base64 && mime ? `data:${mime};base64,${base64}` : null;
}
