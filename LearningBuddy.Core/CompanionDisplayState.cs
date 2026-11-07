namespace LearningBuddy.Core;

public enum CompanionDisplayState
{
    Visible,
    Hidden,
    Invitation,
    Question,
    Paused
}

public sealed class CompanionDisplayStateMachine
{
    private bool _isInvitationDisplayed;

    public CompanionDisplayState State { get; private set; } = CompanionDisplayState.Visible;

    public bool IsHidden { get; private set; }

    public bool IsPaused { get; private set; }

    public bool IsQuestionDisplayed { get; private set; }

    public bool IsInvitationDisplayed => _isInvitationDisplayed;

    public event Action<CompanionDisplayState>? StateChanged;

    public bool TryHide()
    {
        if (IsHidden)
        {
            return false;
        }

        IsHidden = true;
        _isInvitationDisplayed = false;
        UpdateState();
        return true;
    }

    public void Show()
    {
        IsHidden = false;
        _isInvitationDisplayed = false;
        UpdateState();
    }

    public bool TryShowInvitation()
    {
        if (!IsHidden || IsPaused || IsQuestionDisplayed)
        {
            return false;
        }

        if (_isInvitationDisplayed)
        {
            return true;
        }

        _isInvitationDisplayed = true;
        UpdateState();
        return true;
    }

    public void DismissInvitation()
    {
        if (!_isInvitationDisplayed)
        {
            return;
        }

        _isInvitationDisplayed = false;
        UpdateState();
    }

    public void BeginQuestion()
    {
        if (IsQuestionDisplayed)
        {
            throw new InvalidOperationException("Une question est déjà affichée.");
        }

        IsHidden = false;
        _isInvitationDisplayed = false;
        IsQuestionDisplayed = true;
        UpdateState();
    }

    public void CompleteQuestion()
    {
        if (!IsQuestionDisplayed)
        {
            return;
        }

        IsQuestionDisplayed = false;
        UpdateState();
    }

    public void SetPaused(bool isPaused)
    {
        IsPaused = isPaused;
        if (isPaused)
        {
            _isInvitationDisplayed = false;
        }

        UpdateState();
    }

    private void UpdateState()
    {
        var newState = IsHidden && !_isInvitationDisplayed
            ? CompanionDisplayState.Hidden
            : IsQuestionDisplayed
            ? CompanionDisplayState.Question
            : _isInvitationDisplayed
                ? CompanionDisplayState.Invitation
                : IsHidden
                    ? CompanionDisplayState.Hidden
                    : IsPaused
                        ? CompanionDisplayState.Paused
                        : CompanionDisplayState.Visible;
        if (State == newState)
        {
            return;
        }

        State = newState;
        StateChanged?.Invoke(newState);
    }
}
