// Statistics of the Statistics page for every package or a single one.
import type { CardReviewState } from '../../core/model';
import {
  activityHeatmap,
  cardLevelDistribution,
  currentIndicators,
  levelTimeline,
  outcomeDistribution,
  presentationTimeline,
  timelineGranularity,
  type StatisticsSource,
} from '../../core/statistics/statistics';
import type { StatisticsQuery, StatisticsView } from '../../shared/ipc';
import type { DataStore } from '../data/dataStore';

export class StatisticsService {
  constructor(private readonly store: DataStore, private readonly now: () => number = Date.now) {}

  build(query: StatisticsQuery): StatisticsView {
    const source = this.source(query.packageId);
    const range = { start: query.start, end: query.end };
    const now = this.now();
    return {
      indicators: currentIndicators(source),
      levels: cardLevelDistribution(source),
      activity: activityHeatmap(source.events, now),
      outcomes: outcomeDistribution(source.events, range),
      granularity: timelineGranularity(range),
      presentations: presentationTimeline(source.events, range),
      levelTimeline: levelTimeline(source, range, now),
    };
  }

  private source(packageId: string | null): StatisticsSource {
    const cards = this.store.catalog.cards.filter((card) => packageId === null || card.packageId === packageId);
    const cardIds = new Set(cards.map((card) => card.id));
    const states = new Map<string, CardReviewState>();
    for (const card of cards) {
      const state = this.store.reviews.states[card.id];
      if (state) {
        states.set(card.id, state);
      }
    }

    return {
      cards: cards.map((card) => ({ id: card.id, createdAt: card.createdAt })),
      states,
      events: this.store.reviews.events.filter((event) => cardIds.has(event.cardId)),
    };
  }
}
