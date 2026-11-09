// Review history: a presentation is recorded when the card is shown and completed once (v1
// LocalStore.Reviews).
import { randomUUID } from 'node:crypto';
import { LocalizedError } from '../../core/errors';
import type { CardReviewState, ReviewEvent, ReviewOutcome } from '../../core/model';
import { calculateNextState } from '../../core/review/reviewScheduler';
import type { DataStore } from '../data/dataStore';

export class ReviewService {
  constructor(private readonly store: DataStore, private readonly now: () => number = Date.now) {}

  stateOf(cardId: string): CardReviewState {
    const state = this.store.reviews.states[cardId];
    if (!state) {
      throw new LocalizedError('CardMissing');
    }

    return state;
  }

  /** Records that a card is shown; returns the id of the presentation to complete later. */
  beginPresentation(cardId: string): string {
    const state = this.stateOf(cardId);
    const event: ReviewEvent = {
      id: randomUUID(),
      cardId,
      shownAt: this.now(),
      answeredAt: null,
      outcome: null,
      levelBefore: state.level,
      levelAfter: null,
      dueAtBefore: state.dueAt,
      dueAtAfter: null,
    };
    this.store.transact(['reviews'], () => {
      this.store.reviews.events = [...this.store.reviews.events, event];
    });
    return event.id;
  }

  /**
   * Completes a presentation with its outcome and updates the card state. Returns null when the card
   * was deleted in the meantime.
   */
  completePresentation(eventId: string, outcome: ReviewOutcome): CardReviewState | null {
    const event = this.store.reviews.events.find((candidate) => candidate.id === eventId);
    if (!event || event.outcome !== null) {
      return null;
    }

    const state = this.store.reviews.states[event.cardId];
    if (!state) {
      return null;
    }

    const now = this.now();
    const next = calculateNextState(state, outcome, now);
    return this.store.transact(['reviews'], () => {
      this.store.reviews.states[event.cardId] = next;
      this.store.reviews.events = this.store.reviews.events.map((candidate) => (candidate.id === eventId
        ? { ...candidate, answeredAt: now, outcome, levelAfter: next.level, dueAtAfter: next.dueAt }
        : candidate));
      return next;
    });
  }

  /** At startup, a presentation left open by a previous session is closed without result. */
  closeOpenPresentations(): void {
    if (!this.store.reviews.events.some((event) => event.outcome === null)) {
      return;
    }

    const now = this.now();
    this.store.transact(['reviews'], () => {
      this.store.reviews.events = this.store.reviews.events.map((event) => (event.outcome === null
        ? { ...event, answeredAt: now, outcome: 'noResult', levelAfter: event.levelBefore, dueAtAfter: event.dueAtBefore }
        : event));
    });
  }
}
