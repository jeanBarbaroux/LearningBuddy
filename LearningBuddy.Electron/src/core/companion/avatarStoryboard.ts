// Animation identifiers, their durations and the reaction chosen for each review outcome.
// One-shot animations report their completion to the state machine after `durationMs`.
import type { ReviewOutcome } from '../model';

export const AvatarAnimation = {
  Idle: 'idle',
  Move: 'move',
  Drag: 'drag',
  Appear: 'appear',
  Disappear: 'disappear',
  Request: 'request',
  Wait: 'wait',
  Think: 'think',
  Sad: 'sad',
  Happy: 'happy',
  Celebrate: 'celebrate',
  Sleep: 'sleep',
} as const;

export type AvatarAnimationId = (typeof AvatarAnimation)[keyof typeof AvatarAnimation];

export interface AvatarAnimationSpec {
  readonly id: AvatarAnimationId;
  readonly loop: boolean;
  /** Length of a one-shot animation, or of one cycle of a looping one. */
  readonly durationMs: number;
}

export const AVATAR_ANIMATIONS: readonly AvatarAnimationSpec[] = [
  { id: 'idle', loop: true, durationMs: 3200 },
  { id: 'move', loop: true, durationMs: 450 },
  { id: 'drag', loop: true, durationMs: 1000 },
  { id: 'appear', loop: false, durationMs: 900 },
  { id: 'disappear', loop: false, durationMs: 650 },
  { id: 'request', loop: false, durationMs: 1000 },
  { id: 'wait', loop: true, durationMs: 4000 },
  { id: 'think', loop: false, durationMs: 2000 },
  { id: 'sad', loop: false, durationMs: 2600 },
  { id: 'happy', loop: false, durationMs: 1600 },
  { id: 'celebrate', loop: false, durationMs: 2600 },
  { id: 'sleep', loop: true, durationMs: 4000 },
];

export function findAnimation(id: AvatarAnimationId): AvatarAnimationSpec {
  const spec = AVATAR_ANIMATIONS.find((animation) => animation.id === id);
  if (!spec) {
    throw new Error(`Animation inconnue : ${id}`);
  }

  return spec;
}

export function animationDurationMs(id: AvatarAnimationId): number {
  return findAnimation(id).durationMs;
}

export const COMPANION_REACTIONS = [
  AvatarAnimation.Sad,
  AvatarAnimation.Think,
  AvatarAnimation.Happy,
  AvatarAnimation.Celebrate,
] as const;

export type CompanionReaction = (typeof COMPANION_REACTIONS)[number];

export function isCompanionReaction(value: unknown): value is CompanionReaction {
  return typeof value === 'string' && (COMPANION_REACTIONS as readonly string[]).includes(value);
}

/** Reaction played once a persisted outcome is known: one distinct emotion per self-assessment. */
export function reactionForOutcome(outcome: ReviewOutcome): CompanionReaction | null {
  switch (outcome) {
    case 'again':
      return AvatarAnimation.Sad;
    case 'hard':
      return AvatarAnimation.Think;
    case 'good':
      return AvatarAnimation.Happy;
    case 'easy':
      return AvatarAnimation.Celebrate;
    case 'passed':
    case 'noResult':
      return null;
  }
}
