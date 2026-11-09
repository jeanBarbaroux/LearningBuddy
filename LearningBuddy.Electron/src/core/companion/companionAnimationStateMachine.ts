// Port of LearningBuddy.Core/CompanionAnimationStateMachine.cs: resolves animation requests by priority
// disappear > appear > sleep > reaction > request > move > idle.
import { AvatarAnimation, type AvatarAnimationId, type CompanionReaction } from './avatarStoryboard';

export class CompanionAnimationStateMachine {
  private visible = false;
  private appearing = false;
  private disappearing = false;
  private paused = false;
  private questionDisplayed = false;
  private invitationDisplayed = false;
  private moving = false;
  private requestPending = false;
  private reaction: CompanionReaction | null = null;

  currentAnimationId: AvatarAnimationId | null = null;

  constructor(
    private readonly onAnimationRequested: (id: AvatarAnimationId) => void,
    private readonly onHidden: () => void = () => { },
  ) { }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(isVisible: boolean): void {
    if (isVisible) {
      if (this.visible && !this.disappearing) {
        return;
      }

      this.visible = true;
      this.appearing = true;
      this.disappearing = false;
      this.resolve(true);
      return;
    }

    if (!this.visible || this.disappearing) {
      return;
    }

    this.appearing = false;
    this.disappearing = true;
    this.resolve(true);
  }

  setPaused(isPaused: boolean): void {
    if (this.paused === isPaused) {
      return;
    }

    this.paused = isPaused;
    if (isPaused) {
      this.reaction = null;
    }

    this.resolve();
  }

  setQuestionDisplayed(isDisplayed: boolean): void {
    if (this.questionDisplayed === isDisplayed) {
      return;
    }

    this.questionDisplayed = isDisplayed;
    this.requestPending = isDisplayed || this.invitationDisplayed;
    this.resolve(isDisplayed);
  }

  setInvitationDisplayed(isDisplayed: boolean): void {
    if (this.invitationDisplayed === isDisplayed) {
      return;
    }

    this.invitationDisplayed = isDisplayed;
    this.requestPending = isDisplayed || this.questionDisplayed;
    this.resolve(isDisplayed);
  }

  setMoving(isMoving: boolean): void {
    this.moving = isMoving;
    this.resolve();
  }

  /** Plays the reaction selected from the final, persisted review outcome. */
  setReaction(reaction: CompanionReaction | null): void {
    this.reaction = reaction;
    this.resolve();
  }

  /** Advances one-shot animations; stale completions cannot replace a newer request. */
  animationCompleted(id: AvatarAnimationId): void {
    if (this.currentAnimationId !== id) {
      return;
    }

    switch (id) {
      case AvatarAnimation.Appear:
        this.appearing = false;
        break;
      case AvatarAnimation.Disappear:
        this.disappearing = false;
        this.visible = false;
        this.currentAnimationId = null;
        this.onHidden();
        return;
      case AvatarAnimation.Request:
        this.requestPending = false;
        break;
      case AvatarAnimation.Think:
      case AvatarAnimation.Celebrate:
        if (this.reaction === id) {
          this.reaction = null;
        }

        break;
      default:
        return;
    }

    this.resolve();
  }

  private resolve(forceRestart = false): void {
    if (!this.visible) {
      return;
    }

    const id: AvatarAnimationId = this.disappearing
      ? AvatarAnimation.Disappear
      : this.appearing
        ? AvatarAnimation.Appear
        : this.paused
          ? AvatarAnimation.Sleep
          : this.reaction
          ?? (this.requestPending
            ? AvatarAnimation.Request
            : this.moving
              ? AvatarAnimation.Move
              : AvatarAnimation.Idle);
    if (!forceRestart && this.currentAnimationId === id) {
      return;
    }

    this.currentAnimationId = id;
    this.onAnimationRequested(id);
  }
}
