import { describe, expect, it } from 'vitest';
import type { ReviewEvent } from '../model';
import { linkify } from '../text';
import { addDays, fromDateInputValue, startOfDay, toDateInputValue } from './calendar';
import {
  activityHeatmap,
  cardLevelDistribution,
  currentIndicators,
  levelTimeline,
  outcomeDistribution,
  presentationTimeline,
  timelineGranularity,
  timelinePeriods,
} from './statistics';

const today = startOfDay(new Date(2026, 10, 11, 15).getTime());
const now = today + 15 * 3_600_000;

function event(cardId: string, shownAt: number, outcome: ReviewEvent['outcome'], levelBefore: number, levelAfter: number | null): ReviewEvent {
  return {
    id: `${cardId}-${shownAt}`, cardId, shownAt, answeredAt: outcome ? shownAt + 1000 : null, outcome,
    levelBefore, levelAfter, dueAtBefore: 0, dueAtAfter: null,
  };
}

const cards = [{ id: 'a', createdAt: addDays(today, -10) }, { id: 'b', createdAt: addDays(today, -10) }, { id: 'c', createdAt: addDays(today, -1) }];
const states = new Map([
  ['a', { cardId: 'a', level: 2, dueAt: 0, lastReviewedAt: 0 }],
  ['b', { cardId: 'b', level: 0, dueAt: 0, lastReviewedAt: null }],
  ['c', { cardId: 'c', level: 0, dueAt: 0, lastReviewedAt: 0 }],
]);
const events = [
  event('a', addDays(today, -5) + 3_600_000, 'good', 0, 1),
  event('a', addDays(today, -2) + 3_600_000, 'easy', 1, 3),
  event('a', today + 3_600_000, 'again', 3, 2),
  event('c', today + 7_200_000, 'passed', 0, 0),
];
const source = { cards, states, events };

describe('statistics', () => {
  it('counts the activity of the last 52 weeks by local day', () => {
    const weeks = activityHeatmap(events, now);
    expect(weeks).toHaveLength(52);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    const todayCell = weeks.flat().find((day) => day.day === today)!;
    expect(todayCell).toMatchObject({ count: 2, level: 4 });
    expect(weeks.flat().find((day) => day.day === addDays(today, -5))).toMatchObject({ count: 1, level: 2 });
  });

  it('computes the current indicators and the level distribution', () => {
    expect(currentIndicators(source)).toEqual({ presentations: 4, averageLevel: 2 / 3 });
    expect(cardLevelDistribution(source)).toMatchObject({ unseen: 1, level0: 1, level2: 1 });
  });

  it('counts self-assessments of the period only', () => {
    expect(outcomeDistribution(events, { start: addDays(today, -3), end: today })).toEqual({ again: 1, hard: 0, good: 0, easy: 1 });
  });

  it('cuts periods by day, week or month', () => {
    expect(timelineGranularity({ start: addDays(today, -29), end: today })).toBe('daily');
    expect(timelineGranularity({ start: addDays(today, -30), end: today })).toBe('weekly');
    expect(timelineGranularity({ start: addDays(today, -200), end: today })).toBe('monthly');
    const weekly = timelinePeriods({ start: addDays(today, -40), end: today });
    expect(weekly[0]!.start).toBe(addDays(today, -40));
    expect(weekly.at(-1)!.end).toBe(today);
    const points = presentationTimeline(events, { start: addDays(today, -6), end: today });
    expect(points).toHaveLength(7);
    expect(points.at(-1)!.presented).toBe(2);
  });

  it('rebuilds the level of every card at the end of each period', () => {
    const points = levelTimeline(source, { start: addDays(today, -6), end: today }, now);
    expect(points[0]!.counts).toMatchObject({ unseen: 2 });
    expect(points.find((point) => point.period.start === addDays(today, -5))!.counts).toMatchObject({ level1: 1, unseen: 1 });
    expect(points.at(-1)!.counts).toMatchObject({ level2: 1, unseen: 1, level0: 1 });
  });

  it('converts date input values', () => {
    expect(fromDateInputValue(toDateInputValue(today))).toBe(today);
    expect(fromDateInputValue('2026-02-30')).toBeNull();
  });
});

describe('linkify', () => {
  it('extracts web links without trailing punctuation', () => {
    expect(linkify('Voir https://learn.microsoft.com/fr-fr/azure). Et www.example.com, fin')).toEqual([
      { text: 'Voir ' },
      { text: 'https://learn.microsoft.com/fr-fr/azure', url: 'https://learn.microsoft.com/fr-fr/azure' },
      { text: '). Et ' },
      { text: 'www.example.com', url: 'https://www.example.com' },
      { text: ', fin' },
    ]);
  });
});
