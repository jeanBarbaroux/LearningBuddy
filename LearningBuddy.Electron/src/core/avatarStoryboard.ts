// Animation identifiers and timings of the approved storyboard (LearningBuddy.Core/AvatarStoryboard.cs).
// The 3D avatar keeps the same identifiers and one-shot durations so the behaviour stays identical.
import type { ReviewOutcome } from './types';

export const AvatarAnimation = {
  Idle: 'idle',
  Move: 'move',
  Appear: 'appear',
  Disappear: 'disappear',
  Request: 'request',
  Think: 'think',
  Celebrate: 'celebrate',
  Sleep: 'sleep',
} as const;

export type AvatarAnimationId = (typeof AvatarAnimation)[keyof typeof AvatarAnimation];

export interface AvatarAnimationSpec {
  readonly id: AvatarAnimationId;
  readonly loop: boolean;
  readonly frameDurationsMs: readonly number[];
}

export const AVATAR_ANIMATIONS: readonly AvatarAnimationSpec[] = [
  { id: 'idle', loop: true, frameDurationsMs: [400, 200, 400, 150] },
  { id: 'move', loop: true, frameDurationsMs: [100, 100, 100, 100] },
  { id: 'appear', loop: false, frameDurationsMs: [60, 60, 80, 120] },
  { id: 'disappear', loop: false, frameDurationsMs: [120, 80, 60, 40] },
  { id: 'request', loop: false, frameDurationsMs: [100, 100, 180, 300] },
  { id: 'think', loop: false, frameDurationsMs: [150, 250, 150, 350] },
  { id: 'celebrate', loop: false, frameDurationsMs: [80, 100, 100, 160, 280] },
  { id: 'sleep', loop: true, frameDurationsMs: [500, 500, 800, 1200] },
];

export function findAnimation(id: AvatarAnimationId): AvatarAnimationSpec {
  const spec = AVATAR_ANIMATIONS.find((animation) => animation.id === id);
  if (!spec) {
    throw new Error(`Animation inconnue : ${id}`);
  }

  return spec;
}

/** Total length of one cycle of the animation, in milliseconds. */
export function animationDurationMs(id: AvatarAnimationId): number {
  return findAnimation(id).frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
}

export type CompanionReaction = typeof AvatarAnimation.Think | typeof AvatarAnimation.Celebrate;

/** Reaction played once a persisted outcome is known (CompanionCharacterStateMachine + storyboard mapping). */
export function reactionForOutcome(outcome: ReviewOutcome): CompanionReaction | null {
  switch (outcome) {
    case 'again':
    case 'hard':
      return AvatarAnimation.Think;
    case 'good':
    case 'easy':
      return AvatarAnimation.Celebrate;
    case 'passed':
    case 'noResult':
      return null;
  }
}
