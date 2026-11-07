import { describe, expect, it } from 'vitest';
import { calculateNextLevel, calculateNextState, getNextReviewDelayMs, selectNextCard } from './reviewScheduler';
import type { CardReviewState } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function state(cardId: string, level: number, dueAt = 0): CardReviewState {
  return { cardId, level, dueAt, lastReviewedAt: null };
}

describe('calculateNextLevel', () => {
  it.each([
    [3, 'again', 0],
    [3, 'hard', 3],
    [3, 'good', 4],
    [3, 'easy', 5],
    [3, 'passed', 3],
    [3, 'noResult', 3],
  ] as const)('level %i with %s gives %i', (level, outcome, expected) => {
    expect(calculateNextLevel(level, outcome)).toBe(expected);
  });

  it('rejects negative levels', () => {
    expect(() => calculateNextLevel(-1, 'good')).toThrow(RangeError);
  });
});

describe('getNextReviewDelayMs', () => {
  it.each([
    [0, 'again', 2 * MINUTE],
    [0, 'hard', 8 * MINUTE],
    [0, 'good', HOUR],
    [1, 'good', 4 * HOUR],
    [2, 'good', 24 * HOUR],
    [3, 'good', 72 * HOUR],
    [4, 'good', 168 * HOUR],
    [9, 'easy', 168 * HOUR],
  ] as const)('level %i with %s waits %i ms', (level, outcome, expected) => {
    expect(getNextReviewDelayMs(level, outcome)).toBe(expected);
  });

  it('has no delay for passed or closed presentations', () => {
    expect(() => getNextReviewDelayMs(1, 'passed')).toThrow(RangeError);
    expect(() => getNextReviewDelayMs(1, 'noResult')).toThrow(RangeError);
  });
});

describe('calculateNextState', () => {
  it('updates level, deadline and review date', () => {
    expect(calculateNextState(state('a', 1), 'good', 1000)).toEqual({
      cardId: 'a',
      level: 2,
      dueAt: 1000 + 4 * HOUR,
      lastReviewedAt: 1000,
    });
  });

  it('keeps the state unchanged when the card is passed', () => {
    const current = state('a', 2, 50);
    expect(calculateNextState(current, 'passed', 1000)).toBe(current);
  });
});

describe('selectNextCard', () => {
  it('returns null without eligible cards', () => {
    expect(selectNextCard([])).toBeNull();
    expect(selectNextCard([state('a', 0)], { excludedCardIds: new Set(['a']) })).toBeNull();
  });

  it('selects the lowest level, then the earliest deadline, ignoring deadlines in the future', () => {
    const selected = selectNextCard([state('a', 2, 0), state('b', 0, 9_999_999), state('c', 0, 10_000_000)]);
    expect(selected?.cardId).toBe('b');
  });

  it('avoids repeating the last card when another one is available', () => {
    expect(selectNextCard([state('a', 0), state('b', 0)], { lastCardId: 'a' })?.cardId).toBe('b');
    expect(selectNextCard([state('a', 0)], { lastCardId: 'a' })?.cardId).toBe('a');
  });

  it('rotates packages after the package of the last card', () => {
    const packageIdsByCardId = new Map([['a1', 'p1'], ['a2', 'p1'], ['b1', 'p2']]);
    const states = [state('a1', 0), state('a2', 0), state('b1', 0)];
    expect(selectNextCard(states, { packageIdsByCardId, lastCardId: 'a1' })?.cardId).toBe('b1');
    expect(selectNextCard(states, { packageIdsByCardId, lastCardId: 'b1' })?.cardId).toBe('a1');
  });
});
