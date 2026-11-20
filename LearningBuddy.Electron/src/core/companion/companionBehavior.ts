// Pure rules behind the companion's personality: night-time fatigue, mood built from the answer streak,
// spontaneous idle behaviours, patience while a question waits and the reading of mouse gestures.
import type { CompanionReaction } from './avatarStoryboard';

// Fatigue -------------------------------------------------------------------------------------------

/** 0 during the day, rising in the evening up to 1 late at night, fading again in the morning. */
export function fatigueAt(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 8 && hour < 21) {
    return 0;
  }

  if (hour >= 21 && hour < 23) {
    return (hour - 21) / 2;
  }

  if (hour >= 5 && hour < 8) {
    return 1 - (hour - 5) / 3;
  }

  return 1;
}

// Mood ----------------------------------------------------------------------------------------------

export type MoodLevel = 'down' | 'neutral' | 'content' | 'proud' | 'elated';

/** Mood of the companion, driven by consecutive good answers and consecutive misses. */
export class CompanionMood {
  private successes = 0;
  private misses = 0;

  get streak(): number {
    return this.successes;
  }

  record(reaction: CompanionReaction): void {
    switch (reaction) {
      case 'happy':
      case 'celebrate':
        this.successes += 1;
        this.misses = 0;
        break;
      case 'think':
        // Recalled with difficulty: the streak holds, but a previous slump is forgotten.
        this.misses = 0;
        break;
      case 'sad':
        this.successes = 0;
        this.misses += 1;
        break;
    }
  }

  /** -1 (discouraged) … 1 (elated). */
  get cheer(): number {
    if (this.misses > 0) {
      return -Math.min(1, this.misses * 0.35);
    }

    return Math.min(1, this.successes * 0.2);
  }

  get level(): MoodLevel {
    if (this.misses >= 2) return 'down';
    if (this.successes >= 5) return 'elated';
    if (this.successes >= 3) return 'proud';
    if (this.successes >= 1) return 'content';
    return 'neutral';
  }
}

// Spontaneous idle behaviours -----------------------------------------------------------------------

export const MICRO_BEHAVIORS = ['lookAround', 'yawn', 'stretch', 'groom', 'hop', 'hum', 'nodOff', 'wave'] as const;

export type MicroBehavior = (typeof MICRO_BEHAVIORS)[number];

export const MICRO_BEHAVIOR_DURATION_MS: Readonly<Record<MicroBehavior, number>> = {
  lookAround: 2800,
  yawn: 2400,
  stretch: 2200,
  groom: 2800,
  hop: 1300,
  hum: 3200,
  nodOff: 3400,
  wave: 1600,
};

export interface BehaviorContext {
  /** 0 … 1, see fatigueAt. */
  readonly fatigue: number;
  /** -1 … 1, see CompanionMood.cheer. */
  readonly cheer: number;
}

/** Chooses what the companion does on its own while idle, and when. */
export class MicroBehaviorScheduler {
  private previous: MicroBehavior | null = null;

  constructor(private readonly random: () => number = Math.random) { }

  /** Pause before the next spontaneous behaviour: tired companions fidget a little more. */
  nextDelayMs(context: BehaviorContext): number {
    const base = 7000 - context.fatigue * 2000;
    return Math.round(base + this.random() * 7000);
  }

  pick(context: BehaviorContext): MicroBehavior {
    const weights = this.weights(context);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let draw = this.random() * total;
    for (const [behavior, weight] of weights) {
      draw -= weight;
      if (draw < 0) {
        this.previous = behavior;
        return behavior;
      }
    }

    const fallback = weights[weights.length - 1]![0];
    this.previous = fallback;
    return fallback;
  }

  private weights({ fatigue, cheer }: BehaviorContext): [MicroBehavior, number][] {
    const candidates: [MicroBehavior, number][] = [
      ['lookAround', 3],
      ['groom', 2],
      ['stretch', 1.4],
      ['yawn', 0.5 + fatigue * 4],
      ['nodOff', fatigue > 0.4 ? fatigue * 3 : 0],
      ['hop', cheer > 0.3 ? cheer * 3 : 0],
      ['hum', cheer > 0 ? 0.8 + cheer * 2 : 0.4],
    ];
    // Never repeat the same behaviour twice in a row (waving is only triggered explicitly).
    return candidates.filter(([behavior, weight]) => weight > 0 && behavior !== this.previous);
  }
}

// Waiting for an answer -----------------------------------------------------------------------------

export type WaitingMood = 'curious' | 'patient' | 'impatient';

export function waitingMood(elapsedMs: number): WaitingMood {
  if (elapsedMs < 15_000) return 'curious';
  if (elapsedMs < 60_000) return 'patient';
  return 'impatient';
}

// Mouse gestures on the companion -------------------------------------------------------------------

export type TouchReaction = 'poke' | 'pet' | 'tickle' | 'annoyed';

/** Speeds and distances are expressed in canvas widths (per second), so they do not depend on the size. */
const PET_MAX_SPEED = 2.5;
const TICKLE_MIN_SPEED = 3.5;
const PET_THRESHOLD = 0.3;
const TICKLE_THRESHOLD = 1.1;
const ENERGY_HALF_LIFE_MS = 700;
const TICKLE_TOLERANCE_MS = 3500;
const POKE_DISPLAY_MS = 450;
const POKES_BEFORE_ANNOYED = 4;
const POKE_WINDOW_MS = 2500;
const ANNOYED_MS = 2800;

/** Reads strokes, jiggles and repeated clicks of the mouse over the companion. */
export class TouchGestureDetector {
  private last: { x: number; y: number; time: number } | null = null;
  private petEnergy = 0;
  private tickleEnergy = 0;
  private energyTime = 0;
  private tickleSince: number | null = null;
  private pokes: number[] = [];
  private annoyedUntil = 0;

  /** Pointer position over the companion, in canvas widths. */
  move(x: number, y: number, time: number): void {
    this.decay(time);
    if (this.last && time > this.last.time) {
      const distance = Math.hypot(x - this.last.x, y - this.last.y);
      const speed = distance / ((time - this.last.time) / 1000);
      if (speed > 0.05 && speed <= PET_MAX_SPEED) {
        this.petEnergy += distance;
      } else if (speed >= TICKLE_MIN_SPEED) {
        this.tickleEnergy += distance;
      }
    }

    this.last = { x, y, time };
    if (this.tickleEnergy > TICKLE_THRESHOLD) {
      this.tickleSince ??= time;
      if (time - this.tickleSince > TICKLE_TOLERANCE_MS) {
        this.becomeAnnoyed(time);
      }
    } else if (this.tickleEnergy < TICKLE_THRESHOLD * 0.4) {
      // Hysteresis: an irregular jiggle keeps counting as one long tickle.
      this.tickleSince = null;
    }
  }

  /** The pointer left the companion (energy decays on its own, so a vigorous tickle may cross its edge). */
  leave(): void {
    this.last = null;
  }

  poke(time: number): void {
    this.pokes = [...this.pokes.filter((poked) => time - poked < POKE_WINDOW_MS), time];
    if (this.pokes.length >= POKES_BEFORE_ANNOYED) {
      this.becomeAnnoyed(time);
    }
  }

  reactionAt(time: number): TouchReaction | null {
    this.decay(time);
    if (time < this.annoyedUntil) return 'annoyed';
    if (this.tickleEnergy > TICKLE_THRESHOLD) return 'tickle';
    if (this.petEnergy > PET_THRESHOLD) return 'pet';
    const lastPoke = this.pokes[this.pokes.length - 1];
    if (lastPoke !== undefined && time - lastPoke < POKE_DISPLAY_MS) return 'poke';
    return null;
  }

  private becomeAnnoyed(time: number): void {
    this.annoyedUntil = time + ANNOYED_MS;
    this.pokes = [];
    this.petEnergy = 0;
    this.tickleEnergy = 0;
    this.tickleSince = null;
  }

  private decay(time: number): void {
    if (time > this.energyTime) {
      const factor = 0.5 ** ((time - this.energyTime) / ENERGY_HALF_LIFE_MS);
      this.petEnergy *= factor;
      this.tickleEnergy *= factor;
      this.energyTime = time;
    }
  }
}
