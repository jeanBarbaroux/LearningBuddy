import { describe, expect, it } from 'vitest';
import { AssistantSession } from './assistantSession';

const MINUTE = 60_000;

function createSession(active: boolean, questionsPerSeries = 1) {
  const clock = { now: 0 };
  const session = new AssistantSession(() => clock.now, { active, intervalMs: 10 * MINUTE, questionsPerSeries });
  return { clock, session };
}

describe('AssistantSession', () => {
  it('waits a full interval when created active', () => {
    const { clock, session } = createSession(true);
    expect(session.isDue()).toBe(false);
    clock.now = 10 * MINUTE;
    expect(session.isDue()).toBe(true);
  });

  it('presents immediately on the first start, then waits after a restart', () => {
    const { clock, session } = createSession(false);
    expect(session.isDue()).toBe(false);
    session.start();
    expect(session.isDue()).toBe(true);
    session.pause();
    clock.now = MINUTE;
    session.start();
    expect(session.nextPresentationAt).toBe(11 * MINUTE);
  });

  it('chains the questions of a series then waits for the interval', () => {
    const { clock, session } = createSession(false, 2);
    session.start();
    session.beginPresentation(false);
    expect(session.seriesProgress).toEqual({ presented: 0, target: 2 });
    expect(session.completePresentation()).toBe(true);
    expect(session.isDue()).toBe(true);
    session.beginPresentation(false);
    expect(session.completePresentation()).toBe(false);
    expect(session.seriesProgress).toBeNull();
    expect(session.nextPresentationAt).toBe(clock.now + 10 * MINUTE);
  });

  it('does not count manual presentations in a series', () => {
    const { session } = createSession(true, 3);
    session.beginPresentation(true);
    expect(session.completePresentation()).toBe(false);
    expect(session.seriesProgress).toBeNull();
  });

  it('is never due while a presentation is in progress or paused', () => {
    const { session } = createSession(false);
    session.start();
    session.beginPresentation(false);
    expect(session.isDue()).toBe(false);
    expect(() => session.beginPresentation(false)).toThrow();
    session.pause();
    expect(session.isDue()).toBe(false);
  });

  it('ends the series when no card is available', () => {
    const { clock, session } = createSession(false, 3);
    session.start();
    session.noCardAvailable();
    expect(session.isDue()).toBe(false);
    expect(session.nextPresentationAt).toBe(clock.now + 10 * MINUTE);
  });

  it('validates its settings', () => {
    const { session } = createSession(false);
    expect(() => session.updateSettings(1000, 1)).toThrow(RangeError);
    expect(() => session.updateSettings(MINUTE, 0)).toThrow(RangeError);
  });
});
