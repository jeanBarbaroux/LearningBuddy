namespace CertifBuddy.Core;

/// <summary>Describes the expression displayed by the companion character.</summary>
public enum CompanionCharacterState
{
    Idle,
    Question,
    NeedsReview,
    Difficult,
    Correct,
    Easy
}

/// <summary>Tracks the character state for a single active review solicitation.</summary>
public sealed class CompanionCharacterStateMachine
{
    private readonly HashSet<string> _completedSolicitations = new(StringComparer.Ordinal);
    private string? _activeSolicitationId;

    /// <summary>Gets the state currently displayed by the character.</summary>
    public CompanionCharacterState State { get; private set; } = CompanionCharacterState.Idle;

    /// <summary>Occurs when the displayed character state changes.</summary>
    public event Action<CompanionCharacterState>? StateChanged;

    /// <summary>Begins displaying a question for a solicitation that has not already completed.</summary>
    /// <param name="solicitationId">The stable identifier of the solicitation.</param>
    /// <returns><see langword="true"/> if the question became active; otherwise, <see langword="false"/>.</returns>
    public bool BeginQuestion(string solicitationId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(solicitationId);

        if (_activeSolicitationId is not null || _completedSolicitations.Contains(solicitationId))
        {
            return false;
        }

        _activeSolicitationId = solicitationId;
        SetState(CompanionCharacterState.Question);
        return true;
    }

    /// <summary>Confirms that the answer was revealed without changing the question expression.</summary>
    /// <param name="solicitationId">The stable identifier of the active solicitation.</param>
    /// <returns><see langword="true"/> if the solicitation is active; otherwise, <see langword="false"/>.</returns>
    public bool RevealAnswer(string solicitationId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(solicitationId);
        return string.Equals(_activeSolicitationId, solicitationId, StringComparison.Ordinal);
    }

    /// <summary>
    /// Displays the reaction for a successfully recorded outcome, or returns to idle when there is no result.
    /// </summary>
    /// <param name="solicitationId">The stable identifier of the active solicitation.</param>
    /// <param name="recordedOutcome">The persisted outcome, or <see langword="null"/> when none was recorded.</param>
    /// <returns><see langword="true"/> if this solicitation was completed; otherwise, <see langword="false"/>.</returns>
    public bool CompleteSolicitation(string solicitationId, ReviewOutcome? recordedOutcome)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(solicitationId);

        if (!string.Equals(_activeSolicitationId, solicitationId, StringComparison.Ordinal)
            || _completedSolicitations.Contains(solicitationId))
        {
            return false;
        }

        var newState = recordedOutcome switch
        {
            ReviewOutcome.Again => CompanionCharacterState.NeedsReview,
            ReviewOutcome.Hard => CompanionCharacterState.Difficult,
            ReviewOutcome.Good => CompanionCharacterState.Correct,
            ReviewOutcome.Easy => CompanionCharacterState.Easy,
            ReviewOutcome.Passed or ReviewOutcome.NoResult or null => CompanionCharacterState.Idle,
            _ => throw new ArgumentOutOfRangeException(nameof(recordedOutcome), recordedOutcome, "Résultat de révision non pris en charge.")
        };

        _completedSolicitations.Add(solicitationId);
        _activeSolicitationId = null;
        SetState(newState);
        return true;
    }

    private void SetState(CompanionCharacterState state)
    {
        if (State == state)
        {
            return;
        }

        State = state;
        StateChanged?.Invoke(state);
    }
}
