namespace CertifBuddy.Core;

/// <summary>Resolves companion animation requests according to the approved storyboard priorities.</summary>
public sealed class CompanionAnimationStateMachine
{
    private bool _isVisible;
    private bool _isAppearing;
    private bool _isDisappearing;
    private bool _isPaused;
    private bool _isQuestionDisplayed;
    private bool _isInvitationDisplayed;
    private bool _isMoving;
    private bool _requestPending;
    private string? _reactionAnimation;

    public event Action<string>? AnimationRequested;

    public event Action? CompanionHidden;

    public string? CurrentAnimationId { get; private set; }

    public bool IsVisible => _isVisible;

    public void SetVisible(bool isVisible)
    {
        if (isVisible)
        {
            if (_isVisible && !_isDisappearing)
            {
                return;
            }

            _isVisible = true;
            _isAppearing = true;
            _isDisappearing = false;
            Resolve(forceRestart: true);
            return;
        }

        if (!_isVisible || _isDisappearing)
        {
            return;
        }

        _isAppearing = false;
        _isDisappearing = true;
        Resolve(forceRestart: true);
    }

    public void SetPaused(bool isPaused)
    {
        if (_isPaused == isPaused)
        {
            return;
        }

        _isPaused = isPaused;
        if (isPaused)
        {
            _reactionAnimation = null;
        }

        Resolve();
    }

    public void SetQuestionDisplayed(bool isDisplayed)
    {
        if (_isQuestionDisplayed == isDisplayed)
        {
            return;
        }

        _isQuestionDisplayed = isDisplayed;
        _requestPending = isDisplayed || _isInvitationDisplayed;
        Resolve(forceRestart: isDisplayed);
    }

    public void SetInvitationDisplayed(bool isDisplayed)
    {
        if (_isInvitationDisplayed == isDisplayed)
        {
            return;
        }

        _isInvitationDisplayed = isDisplayed;
        _requestPending = isDisplayed || _isQuestionDisplayed;
        Resolve(forceRestart: isDisplayed);
    }

    public void SetMoving(bool isMoving)
    {
        _isMoving = isMoving;
        Resolve();
    }

    /// <summary>Uses only the final review-state notification to select a persisted-outcome reaction.</summary>
    public void SetReviewState(CompanionCharacterState state)
    {
        _reactionAnimation = state switch
        {
            CompanionCharacterState.NeedsReview or CompanionCharacterState.Difficult => AvatarStoryboard.Think,
            CompanionCharacterState.Correct or CompanionCharacterState.Easy => AvatarStoryboard.Celebrate,
            CompanionCharacterState.Idle or CompanionCharacterState.Question => null,
            _ => throw new ArgumentOutOfRangeException(nameof(state), state, "État du personnage non pris en charge.")
        };
        Resolve();
    }

    /// <summary>Advances one-shot animations; stale completions cannot replace a newer request.</summary>
    public void AnimationCompleted(string animationId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(animationId);
        if (!string.Equals(CurrentAnimationId, animationId, StringComparison.Ordinal))
        {
            return;
        }

        switch (animationId)
        {
            case AvatarStoryboard.Appear:
                _isAppearing = false;
                break;
            case AvatarStoryboard.Disappear:
                _isDisappearing = false;
                _isVisible = false;
                CurrentAnimationId = null;
                CompanionHidden?.Invoke();
                return;
            case AvatarStoryboard.Request:
                _requestPending = false;
                break;
            case AvatarStoryboard.Think:
            case AvatarStoryboard.Celebrate:
                if (_reactionAnimation == animationId)
                {
                    _reactionAnimation = null;
                }

                break;
            default:
                return;
        }

        Resolve();
    }

    private void Resolve(bool forceRestart = false)
    {
        if (!_isVisible)
        {
            return;
        }

        var animationId = _isDisappearing
            ? AvatarStoryboard.Disappear
            : _isAppearing
                ? AvatarStoryboard.Appear
                : _isPaused
                    ? AvatarStoryboard.Sleep
                    : _reactionAnimation
                        ?? (_requestPending
                            ? AvatarStoryboard.Request
                            : _isMoving
                                ? AvatarStoryboard.Move
                                : AvatarStoryboard.Idle);
        if (!forceRestart && string.Equals(CurrentAnimationId, animationId, StringComparison.Ordinal))
        {
            return;
        }

        CurrentAnimationId = animationId;
        AnimationRequested?.Invoke(animationId);
    }
}
