// Statistics of the Statistics page (v1 ReviewActivityAggregator, ReviewOutcomeDistribution,
// ReviewTimelineAggregator and CardLevelTimeline). Every function works on an already scoped data set.
import type { CardReviewState, RatingOutcome, ReviewEvent } from '../model';
import {
  addDays,
  addMonths,
  daysBetweenInclusive,
  endOfDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './calendar';

export interface StatisticsSource {
  readonly cards: readonly { readonly id: string; readonly createdAt: number }[];
  readonly states: ReadonlyMap<string, CardReviewState>;
  readonly events: readonly ReviewEvent[];
}

// ---------------------------------------------------------------------------------------------------
// Activity heatmap: 52 weeks, Monday to Sunday, the last column being the current week.

export const HEATMAP_WEEKS = 52;

export interface ActivityDay {
  readonly day: number;
  readonly count: number;
  /** Colour level 0–4. */
  readonly level: number;
}

export function activityHeatmap(events: readonly ReviewEvent[], now: number): ActivityDay[][] {
  const firstDay = addDays(startOfWeek(now), -7 * (HEATMAP_WEEKS - 1));
  const counts = new Map<number, number>();
  for (const event of events) {
    const day = startOfDay(event.shownAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days: number[] = [];
  for (let index = 0; index < HEATMAP_WEEKS * 7; index += 1) {
    days.push(addDays(firstDay, index));
  }

  const maximum = Math.max(0, ...days.map((day) => counts.get(day) ?? 0));
  const weeks: ActivityDay[][] = [];
  days.forEach((day, index) => {
    const count = counts.get(day) ?? 0;
    const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / maximum) * 4)));
    if (index % 7 === 0) {
      weeks.push([]);
    }

    weeks.at(-1)!.push({ day, count, level });
  });
  return weeks;
}

// ---------------------------------------------------------------------------------------------------
// Current indicators, over all dates.

export interface CurrentIndicators {
  readonly presentations: number;
  /** Null when the scope has no card. */
  readonly averageLevel: number | null;
}

export function currentIndicators(source: StatisticsSource): CurrentIndicators {
  const levels = source.cards.map((card) => source.states.get(card.id)?.level ?? 0);
  return {
    presentations: source.events.length,
    averageLevel: levels.length === 0 ? null : levels.reduce((sum, level) => sum + level, 0) / levels.length,
  };
}

// ---------------------------------------------------------------------------------------------------
// Card levels: unseen cards, then levels 0 to 4, then 5 and more.

export const LEVEL_CATEGORIES = ['unseen', 'level0', 'level1', 'level2', 'level3', 'level4', 'level5Plus'] as const;
export type LevelCategory = (typeof LEVEL_CATEGORIES)[number];
export type LevelCounts = Readonly<Record<LevelCategory, number>>;

export function levelCategory(level: number): LevelCategory {
  return level >= 5 ? 'level5Plus' : (`level${level}` as LevelCategory);
}

/** A card never presented and still at level 0 is "unseen". */
export function cardLevelDistribution(source: StatisticsSource): LevelCounts {
  const seen = new Set(source.events.map((event) => event.cardId));
  const counts = emptyLevelCounts();
  for (const card of source.cards) {
    const level = source.states.get(card.id)?.level ?? 0;
    counts[!seen.has(card.id) && level === 0 ? 'unseen' : levelCategory(level)] += 1;
  }

  return counts;
}

function emptyLevelCounts(): Record<LevelCategory, number> {
  return { unseen: 0, level0: 0, level1: 0, level2: 0, level3: 0, level4: 0, level5Plus: 0 };
}

// ---------------------------------------------------------------------------------------------------
// Self-assessments of a period ("Passer" and closing without result are excluded).

export type OutcomeCounts = Readonly<Record<RatingOutcome, number>>;

export function outcomeDistribution(events: readonly ReviewEvent[], range: DayRange): OutcomeCounts {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const event of eventsInRange(events, range)) {
    if (event.outcome === 'again' || event.outcome === 'hard' || event.outcome === 'good' || event.outcome === 'easy') {
      counts[event.outcome] += 1;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------------------------------
// Timelines: the period is cut by day (≤ 30 days), by week (≤ 180 days) or by month.

export interface DayRange {
  /** Local midnight of the first day. */
  readonly start: number;
  /** Local midnight of the last day (included). */
  readonly end: number;
}

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface TimelinePeriod {
  /** First and last local days of the period, clipped to the range. */
  readonly start: number;
  readonly end: number;
}

export function timelineGranularity(range: DayRange): Granularity {
  const days = daysBetweenInclusive(range.start, range.end);
  return days <= 30 ? 'daily' : days <= 180 ? 'weekly' : 'monthly';
}

export function timelinePeriods(range: DayRange, granularity: Granularity = timelineGranularity(range)): TimelinePeriod[] {
  const periods: TimelinePeriod[] = [];
  let cursor = startOfDay(range.start);
  const last = startOfDay(range.end);
  while (cursor <= last) {
    const next = granularity === 'daily'
      ? addDays(cursor, 1)
      : granularity === 'weekly'
        ? addDays(startOfWeek(cursor), 7)
        : addMonths(startOfMonth(cursor), 1);
    periods.push({ start: cursor, end: Math.min(addDays(next, -1), last) });
    cursor = next;
  }

  return periods;
}

export interface PresentationPoint {
  readonly period: TimelinePeriod;
  readonly presented: number;
}

/** Number of questions presented in each period, by local date of presentation. */
export function presentationTimeline(events: readonly ReviewEvent[], range: DayRange): PresentationPoint[] {
  const periods = timelinePeriods(range);
  const points = periods.map((period) => ({ period, presented: 0 }));
  for (const event of eventsInRange(events, range)) {
    const day = startOfDay(event.shownAt);
    const point = points.find(({ period }) => day >= period.start && day <= period.end);
    if (point) {
      point.presented += 1;
    }
  }

  return points;
}

export interface LevelTimelinePoint {
  readonly period: TimelinePeriod;
  readonly counts: LevelCounts;
}

/**
 * Number of cards in each level category at the end of every period, rebuilt from the review history of
 * the cards that still exist. The last point that includes today uses the current levels.
 */
export function levelTimeline(source: StatisticsSource, range: DayRange, now: number): LevelTimelinePoint[] {
  const eventsByCard = new Map<string, ReviewEvent[]>();
  for (const event of source.events) {
    const list = eventsByCard.get(event.cardId);
    if (list) {
      list.push(event);
    } else {
      eventsByCard.set(event.cardId, [event]);
    }
  }

  const histories = source.cards.map((card) =>
    cardCategoryHistory(card, eventsByCard.get(card.id) ?? [], source.states.get(card.id), now));
  return timelinePeriods(range).map((period) => {
    const instant = Math.min(endOfDay(period.end), now);
    const counts = emptyLevelCounts();
    for (const history of histories) {
      const category = categoryAt(history, instant);
      if (category) {
        counts[category] += 1;
      }
    }

    return { period, counts };
  });
}

type CategoryChange = readonly [at: number, category: LevelCategory];

function cardCategoryHistory(
  card: { readonly createdAt: number },
  events: readonly ReviewEvent[],
  state: CardReviewState | undefined,
  now: number,
): CategoryChange[] {
  const sorted = events.filter((event) => event.shownAt <= now).sort((a, b) => a.shownAt - b.shownAt);
  const first = sorted[0];
  const changes: CategoryChange[] = [
    [card.createdAt, first && first.levelBefore > 0 ? levelCategory(first.levelBefore) : 'unseen'],
  ];
  for (const event of sorted) {
    changes.push([event.shownAt, levelCategory(event.levelBefore)]);
    if (event.answeredAt !== null && event.answeredAt <= now && event.levelAfter !== null) {
      changes.push([event.answeredAt, levelCategory(event.levelAfter)]);
    }
  }

  const level = state?.level ?? 0;
  changes.push([now, sorted.length === 0 && level === 0 ? 'unseen' : levelCategory(level)]);
  return changes.sort((a, b) => a[0] - b[0]);
}

function categoryAt(history: readonly CategoryChange[], instant: number): LevelCategory | null {
  let category: LevelCategory | null = null;
  for (const [at, value] of history) {
    if (at > instant) {
      break;
    }

    category = value;
  }

  return category;
}

function eventsInRange(events: readonly ReviewEvent[], range: DayRange): ReviewEvent[] {
  const first = startOfDay(range.start);
  const last = endOfDay(range.end);
  return events.filter((event) => event.shownAt >= first && event.shownAt <= last);
}
