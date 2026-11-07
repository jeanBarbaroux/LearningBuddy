import { describe, expect, it } from 'vitest';
import { canWander, clampToWorkArea, CompanionWanderer, defaultCompanionPosition, placeBubble } from './companionLayout';

const workArea = { x: 0, y: 0, width: 1000, height: 800 };
const size = { width: 100, height: 100 };

describe('clampToWorkArea', () => {
  it('keeps the element entirely inside the work area', () => {
    expect(clampToWorkArea(workArea, size, { x: -50, y: 950 })).toEqual({ x: 0, y: 700 });
  });

  it('rejects non-finite coordinates', () => {
    expect(() => clampToWorkArea(workArea, size, { x: Number.NaN, y: 0 })).toThrow(RangeError);
  });
});

describe('defaultCompanionPosition', () => {
  it('uses the bottom-right corner', () => {
    expect(defaultCompanionPosition(workArea, size, 20)).toEqual({ x: 880, y: 680 });
  });
});

describe('placeBubble', () => {
  it('prefers the right side when it fits', () => {
    const bubble = placeBubble(workArea, { x: 100, y: 300, width: 100, height: 100 }, { width: 300, height: 200 }, 8);
    expect(bubble).toEqual({ x: 208, y: 250, width: 300, height: 200 });
  });

  it('falls back to the left side near the right edge', () => {
    const bubble = placeBubble(workArea, { x: 880, y: 650, width: 100, height: 100 }, { width: 300, height: 200 }, 8);
    expect(bubble).toEqual({ x: 572, y: 600, width: 300, height: 200 });
  });
});

describe('CompanionWanderer', () => {
  it('walks toward a random target at the configured speed, then rests', () => {
    const wanderer = new CompanionWanderer(() => 1, 100, 1000, 1000);
    const start = { x: 0, y: 700 };
    const step = wanderer.advance(start, workArea, size, 500);
    expect(wanderer.target).toEqual({ x: 900, y: 700 });
    expect(step).toEqual({ x: 50, y: 700 });

    let position = step;
    for (let index = 0; index < 20; index += 1) {
      position = wanderer.advance(position, workArea, size, 1000);
    }

    expect(position).toEqual({ x: 900, y: 700 });
    expect(wanderer.target).toBeNull();
    expect(wanderer.advance(position, workArea, size, 500)).toEqual(position);
  });

  it('caps long steps to one second', () => {
    const wanderer = new CompanionWanderer(() => 1, 10);
    expect(wanderer.advance({ x: 0, y: 700 }, workArea, size, 60_000)).toEqual({ x: 10, y: 700 });
  });

  it('forgets its target after a reset', () => {
    const wanderer = new CompanionWanderer(() => 0.5);
    wanderer.advance({ x: 0, y: 0 }, workArea, size, 100);
    wanderer.reset();
    expect(wanderer.target).toBeNull();
  });
});

describe('canWander', () => {
  it('only wanders when active, enabled, without question and not dragged', () => {
    expect(canWander(true, false, false, true)).toBe(true);
    expect(canWander(false, false, false, true)).toBe(false);
    expect(canWander(true, true, false, true)).toBe(false);
    expect(canWander(true, false, true, true)).toBe(false);
    expect(canWander(true, false, false, false)).toBe(false);
  });
});
