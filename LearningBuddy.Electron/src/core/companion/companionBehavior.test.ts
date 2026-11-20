import { describe, expect, it } from 'vitest';
import { reactionForOutcome } from './avatarStoryboard';
import {
  CompanionMood,
  fatigueAt,
  MicroBehaviorScheduler,
  TouchGestureDetector,
  waitingMood,
} from './companionBehavior';

const at = (hours: number, minutes = 0): Date => new Date(2026, 10, 20, hours, minutes);

describe('reactionForOutcome', () => {
  it('gives each self-assessment its own emotion', () => {
    expect(['again', 'hard', 'good', 'easy', 'passed', 'noResult'].map((outcome) => reactionForOutcome(outcome as never)))
      .toEqual(['sad', 'think', 'happy', 'celebrate', null, null]);
  });
});

describe('fatigueAt', () => {
  it('is rested during the day, sleepy at night and wakes up in the morning', () => {
    expect(fatigueAt(at(14))).toBe(0);
    expect(fatigueAt(at(22))).toBeCloseTo(0.5);
    expect(fatigueAt(at(2))).toBe(1);
    expect(fatigueAt(at(6, 30))).toBeCloseTo(0.5);
    expect(fatigueAt(at(8))).toBe(0);
  });
});

describe('CompanionMood', () => {
  it('grows proud with a streak, keeps it on hard answers and gets down after repeated misses', () => {
    const mood = new CompanionMood();
    ['happy', 'celebrate', 'think', 'happy'].forEach((reaction) => mood.record(reaction as never));
    expect(mood.streak).toBe(3);
    expect(mood.level).toBe('proud');
    expect(mood.cheer).toBeCloseTo(0.6);

    mood.record('sad');
    expect(mood.level).toBe('neutral');
    mood.record('sad');
    expect(mood.level).toBe('down');
    expect(mood.cheer).toBeCloseTo(-0.7);
  });
});

describe('MicroBehaviorScheduler', () => {
  it('only nods off when tired and never repeats a behaviour twice in a row', () => {
    const draws = [0.99, 0.99];
    const scheduler = new MicroBehaviorScheduler(() => draws.shift() ?? 0);
    const rested = { fatigue: 0, cheer: 0 };
    const tired = { fatigue: 1, cheer: 0 };
    expect(scheduler.pick(rested)).toBe('hum');
    expect(scheduler.pick(tired)).toBe('nodOff');
    expect(scheduler.pick(tired)).not.toBe('nodOff');
  });
});

describe('waitingMood', () => {
  it('goes from curious to impatient', () => {
    expect([0, 20_000, 90_000].map(waitingMood)).toEqual(['curious', 'patient', 'impatient']);
  });
});

describe('TouchGestureDetector', () => {
  function stroke(detector: TouchGestureDetector, speed: number, durationMs: number, start = 0): number {
    let time = start;
    let x = 0;
    for (; time < start + durationMs; time += 20) {
      x = x > 0.5 ? 0 : x + speed * 0.02;
      detector.move(x, 0.5, time);
    }

    return time;
  }

  it('recognises slow strokes as petting and fast jiggles as tickling', () => {
    const petting = new TouchGestureDetector();
    expect(petting.reactionAt(stroke(petting, 1, 800))).toBe('pet');

    const tickling = new TouchGestureDetector();
    expect(tickling.reactionAt(stroke(tickling, 8, 500))).toBe('tickle');
  });

  it('gets annoyed by endless tickling or repeated pokes, then calms down', () => {
    const tickling = new TouchGestureDetector();
    const end = stroke(tickling, 8, 4500);
    expect(tickling.reactionAt(end)).toBe('annoyed');
    expect(tickling.reactionAt(end + 5000)).toBeNull();

    const irregular = new TouchGestureDetector();
    let time = 0;
    let x = 0.1;
    for (; time < 6000; time += 40) {
      // Short bursts of jiggling separated by pauses: the energy keeps crossing the threshold.
      if (time % 800 < 160) {
        x = x > 0.2 ? 0.1 : 0.35;
        irregular.move(x, 0.5, time);
      }
    }
    expect(irregular.reactionAt(time)).toBe('annoyed');

    const poked = new TouchGestureDetector();
    poked.poke(0);
    expect(poked.reactionAt(100)).toBe('poke');
    [300, 600, 900].forEach((time) => poked.poke(time));
    expect(poked.reactionAt(1000)).toBe('annoyed');
  });
});
