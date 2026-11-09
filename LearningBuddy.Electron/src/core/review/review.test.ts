import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardReviewState } from '../model';
import { AssistantSession, type AssistantSchedule } from './assistantSession';
import { nextDailySlot, validateDailySlots } from './dailySchedule';
import { calculateNextState, nextReviewDelayMs, selectNextCard, type CardSelectionContext } from './reviewScheduler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function state(cardId: string, level: number, dueAt = 0): CardReviewState {
  return { cardId, level, dueAt, lastReviewedAt: null };
}

function context(packages: Record<string, string>, overrides: Partial<CardSelectionContext> = {}): CardSelectionContext {
  return {
    packageIdsByCardId: new Map(Object.entries(packages)),
    lastCardId: null,
    excludedCardIds: new Set(),
    percentages: null,
    random: () => 0,
    ...overrides,
  };
}

describe('review scheduler', () => {
  it('changes levels and delays according to the outcome', () => {
    const current = state('c', 2);
    expect(calculateNextState(current, 'again', 0)).toMatchObject({ level: 0, dueAt: 2 * MINUTE, lastReviewedAt: 0 });
    expect(calculateNextState(current, 'hard', 0)).toMatchObject({ level: 2, dueAt: 8 * MINUTE });
    expect(calculateNextState(current, 'good', 0)).toMatchObject({ level: 3, dueAt: 24 * HOUR });
    expect(calculateNextState(current, 'easy', 0)).toMatchObject({ level: 4, dueAt: 72 * HOUR });
    expect(calculateNextState(current, 'passed', 0)).toBe(current);
    expect(nextReviewDelayMs(4, 'good')).toBe(168 * HOUR);
  });

  it('prefers the lowest level and rotates packages', () => {
    const states = [state('a1', 1), state('a2', 0), state('b1', 0), state('b2', 3)];
    const packages = { a1: 'A', a2: 'A', b1: 'B', b2: 'B' };
    expect(selectNextCard(states, context(packages))?.cardId).toBe('a2');
    expect(selectNextCard(states, context(packages, { lastCardId: 'a2' }))?.cardId).toBe('b1');
    expect(selectNextCard(states, context(packages, { excludedCardIds: new Set(['a2', 'b1']) }))?.cardId).toBe('a1');
    expect(selectNextCard([], context(packages))).toBeNull();
  });

  it('draws a package according to its percentage', () => {
    const states = [state('a1', 0), state('b1', 0)];
    const packages = { a1: 'A', b1: 'B' };
    const percentages = { A: 20, B: 80 };
    expect(selectNextCard(states, context(packages, { percentages, random: () => 0.1 }))?.cardId).toBe('a1');
    expect(selectNextCard(states, context(packages, { percentages, random: () => 0.5 }))?.cardId).toBe('b1');
  });
});

describe('daily schedule', () => {
  it('validates and sorts the slots', () => {
    expect(validateDailySlots([{ time: '18:00', questions: 2 }, { time: '09:00', questions: 1 }], true).map((slot) => slot.time))
      .toEqual(['09:00', '18:00']);
    expect(() => validateDailySlots([], true)).toThrow();
    expect(() => validateDailySlots([{ time: '9:00', questions: 1 }], false)).toThrow();
    expect(() => validateDailySlots([{ time: '09:00', questions: 1 }, { time: '09:00', questions: 2 }], false)).toThrow();
  });

  it('finds the next local time without replaying missed ones', () => {
    const now = new Date(2026, 10, 9, 12, 0).getTime();
    const slots = [{ time: '09:00', questions: 1 }, { time: '18:30', questions: 3 }];
    expect(nextDailySlot(slots, now)).toEqual({ at: new Date(2026, 10, 9, 18, 30).getTime(), questions: 3 });
    expect(nextDailySlot(slots, new Date(2026, 10, 9, 19, 0).getTime()).at).toBe(new Date(2026, 10, 10, 9, 0).getTime());
  });
});

describe('assistant session', () => {
  let now = 0;
  const schedule: AssistantSchedule = { intervalMinutes: 10, questionsPerSeries: 2, useFixedSchedule: false, dailySlots: [] };

  beforeEach(() => {
    now = 1_000_000;
  });

  afterEach(() => vi.useRealTimers());

  it('presents immediately when started, then runs series separated by the pause', () => {
    const session = new AssistantSession(() => now, false, schedule);
    expect(session.canPresent()).toBe(false);
    session.start();
    expect(session.beginPresentation()).toBe(true);
    expect(session.seriesProgress).toEqual({ presented: 0, target: 2 });
    expect(session.completePresentation(true)).toBe(false);
    expect(session.canPresent()).toBe(true);
    session.beginPresentation();
    expect(session.completePresentation(true)).toBe(true);
    expect(session.isSeriesActive).toBe(false);
    expect(session.nextPresentationAt).toBe(now + 10 * MINUTE);
    now += 10 * MINUTE;
    expect(session.canPresent()).toBe(true);
  });

  it('ends the series when no other card is eligible', () => {
    const session = new AssistantSession(() => now, true, schedule);
    now += 10 * MINUTE;
    session.beginPresentation();
    expect(session.completePresentation(false)).toBe(true);
  });

  it('keeps manual questions outside of series and waits a full pause after a restart', () => {
    const session = new AssistantSession(() => now, true, schedule);
    expect(session.canPresent()).toBe(false);
    expect(session.beginManualPresentation()).toBe(true);
    expect(session.completePresentation(true)).toBe(false);
    expect(session.seriesProgress).toBeNull();
  });

  it('stops presenting while suspended and restarts the pause on resume', () => {
    const session = new AssistantSession(() => now, true, schedule);
    now += 10 * MINUTE;
    session.suspend();
    expect(session.canPresent()).toBe(false);
    session.resume();
    expect(session.nextPresentationAt).toBe(now + 10 * MINUTE);
  });

  it('uses the question count of the fixed time slot and skips missed slots', () => {
    now = new Date(2026, 10, 9, 8, 0).getTime();
    const session = new AssistantSession(() => now, false, {
      ...schedule, useFixedSchedule: true, dailySlots: [{ time: '09:00', questions: 3 }],
    });
    session.start();
    expect(session.nextPresentationAt).toBe(new Date(2026, 10, 9, 9, 0).getTime());
    now = new Date(2026, 10, 9, 9, 0, 30).getTime();
    expect(session.beginPresentation()).toBe(true);
    expect(session.seriesProgress?.target).toBe(3);
    session.completePresentation(false);
    now = new Date(2026, 10, 10, 9, 5).getTime();
    expect(session.canPresent()).toBe(false);
    expect(session.nextPresentationAt).toBe(new Date(2026, 10, 11, 9, 0).getTime());
  });
});
