import { beforeEach, describe, expect, it } from 'vitest';
import type { AvatarAnimationId } from './avatarStoryboard';
import { CompanionAnimationStateMachine } from './companionAnimationStateMachine';

describe('CompanionAnimationStateMachine', () => {
  let requested: AvatarAnimationId[];
  let hidden: number;
  let machine: CompanionAnimationStateMachine;

  beforeEach(() => {
    requested = [];
    hidden = 0;
    machine = new CompanionAnimationStateMachine((id) => requested.push(id), () => { hidden += 1; });
  });

  function showAndSettle(): void {
    machine.setVisible(true);
    machine.animationCompleted('appear');
  }

  it('does not animate while hidden', () => {
    machine.setQuestionDisplayed(true);
    expect(requested).toEqual([]);
  });

  it('appears then idles', () => {
    showAndSettle();
    expect(requested).toEqual(['appear', 'idle']);
  });

  it('sleeps while paused and drops pending reactions', () => {
    showAndSettle();
    machine.setReaction('celebrate');
    machine.setPaused(true);
    expect(machine.currentAnimationId).toBe('sleep');
    machine.setPaused(false);
    expect(machine.currentAnimationId).toBe('idle');
  });

  it('plays request once when a question is displayed, then moves or idles', () => {
    showAndSettle();
    machine.setMoving(true);
    machine.setQuestionDisplayed(true);
    expect(machine.currentAnimationId).toBe('request');
    machine.animationCompleted('request');
    expect(machine.currentAnimationId).toBe('move');
  });

  it('gives reactions priority over request and returns afterwards', () => {
    showAndSettle();
    machine.setQuestionDisplayed(true);
    machine.setReaction('think');
    expect(machine.currentAnimationId).toBe('think');
    machine.animationCompleted('think');
    expect(machine.currentAnimationId).toBe('request');
  });

  it('ignores stale completions', () => {
    showAndSettle();
    machine.setReaction('celebrate');
    machine.animationCompleted('think');
    expect(machine.currentAnimationId).toBe('celebrate');
  });

  it('disappears with top priority and reports when hidden', () => {
    showAndSettle();
    machine.setVisible(false);
    machine.setReaction('celebrate');
    expect(machine.currentAnimationId).toBe('disappear');
    machine.animationCompleted('disappear');
    expect(hidden).toBe(1);
    expect(machine.isVisible).toBe(false);
    expect(machine.currentAnimationId).toBeNull();
  });

  it('restarts appear when shown again during disappear', () => {
    showAndSettle();
    machine.setVisible(false);
    machine.setVisible(true);
    expect(machine.currentAnimationId).toBe('appear');
    machine.animationCompleted('disappear');
    expect(hidden).toBe(0);
  });
});
