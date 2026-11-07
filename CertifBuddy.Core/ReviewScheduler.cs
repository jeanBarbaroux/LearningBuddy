namespace CertifBuddy.Core;

public static class ReviewScheduler
{
    private static readonly TimeSpan AgainDelay = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan HardDelay = TimeSpan.FromMinutes(8);

    public static CardReviewState CalculateNextState(
        CardReviewState currentState,
        ReviewOutcome outcome,
        DateTimeOffset finalizedAt)
    {
        ArgumentNullException.ThrowIfNull(currentState);
        var level = CalculateNextLevel(currentState.Level, outcome);
        if (outcome is ReviewOutcome.Passed or ReviewOutcome.NoResult)
        {
            return currentState;
        }

        return currentState with
        {
            Level = level,
            DueAt = finalizedAt + GetNextReviewDelay(currentState.Level, outcome),
            LastReviewedAt = finalizedAt
        };
    }

    /// <summary>Calculates the review level after an assessment, bounded below by zero.</summary>
    /// <param name="currentLevel">The level before the assessment.</param>
    /// <param name="outcome">The assessment result.</param>
    /// <returns>The resulting level; passing or closing without a result preserves the level.</returns>
    public static int CalculateNextLevel(int currentLevel, ReviewOutcome outcome)
    {
        if (currentLevel < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(currentLevel));
        }

        if (!Enum.IsDefined(outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(outcome));
        }

        return outcome switch
        {
            ReviewOutcome.Again => 0,
            ReviewOutcome.Hard => currentLevel,
            ReviewOutcome.Good => checked(currentLevel + 1),
            ReviewOutcome.Easy => checked(currentLevel + 2),
            ReviewOutcome.Passed or ReviewOutcome.NoResult => currentLevel,
            _ => throw new ArgumentOutOfRangeException(nameof(outcome))
        };
    }

    public static TimeSpan GetNextReviewDelay(int currentLevel, ReviewOutcome outcome)
    {
        var nextLevel = CalculateNextLevel(currentLevel, outcome);

        return outcome switch
        {
            ReviewOutcome.Again => AgainDelay,
            ReviewOutcome.Hard => HardDelay,
            ReviewOutcome.Passed or ReviewOutcome.NoResult => throw new ArgumentOutOfRangeException(nameof(outcome)),
            _ => IntervalForLevel(nextLevel)
        };
    }

    /// <summary>Selects the lowest-level card, rotating packages without filtering by review deadline.</summary>
    /// <param name="reviewStates">The review states in the selected packages.</param>
    /// <param name="now">The caller's current time, retained for API compatibility; deadlines no longer block selection.</param>
    /// <param name="lastCardId">The last presented card, used to rotate packages and avoid immediate repetition.</param>
    /// <param name="excludedCardIds">Cards already presented in the current series.</param>
    /// <param name="packageIdsByCardId">Optional package identifiers for every supplied card, including excluded cards.</param>
    /// <returns>The next card, or null when no unexcluded cards remain.</returns>
    public static CardReviewState? SelectNextCard(
        IEnumerable<CardReviewState> reviewStates,
        DateTimeOffset now,
        string? lastCardId = null,
        IReadOnlySet<string>? excludedCardIds = null,
        IReadOnlyDictionary<string, string>? packageIdsByCardId = null)
    {
        ArgumentNullException.ThrowIfNull(reviewStates);

        var eligible = reviewStates
            .Where(state => excludedCardIds is null || !excludedCardIds.Contains(state.CardId))
            .OrderBy(state => state.Level)
            .ThenBy(state => state.DueAt)
            .ThenBy(state => state.CardId, StringComparer.Ordinal)
            .ToArray();
        var firstEligible = eligible.FirstOrDefault();
        if (firstEligible is null)
        {
            return null;
        }

        var lowestLevel = eligible.Where(state => state.Level == firstEligible.Level);
        if (packageIdsByCardId is not null)
        {
            var lastPackageId = lastCardId is not null
                && packageIdsByCardId.TryGetValue(lastCardId, out var packageId)
                    ? packageId
                    : null;
            var packages = lowestLevel
                .GroupBy(state => packageIdsByCardId[state.CardId])
                .OrderBy(group => group.Key, StringComparer.Ordinal)
                .ToArray();
            var nextPackage = packages.FirstOrDefault(group =>
                lastPackageId is null || StringComparer.Ordinal.Compare(group.Key, lastPackageId) > 0)
                ?? packages[0];
            lowestLevel = nextPackage;
        }

        return lowestLevel.FirstOrDefault(state =>
            !string.Equals(state.CardId, lastCardId, StringComparison.Ordinal))
            ?? lowestLevel.First();
    }

    /// <summary>Chooses a package by frequency, then its lowest-level unexcluded card.</summary>
    /// <param name="reviewStates">States of cards in the selected packages.</param>
    /// <param name="now">The caller's current time; deadlines do not block selection.</param>
    /// <param name="packageIdsByCardId">The package of every supplied card.</param>
    /// <param name="percentages">Positive package percentages totaling 100.</param>
    /// <param name="sample">A uniformly distributed sample in [0, 1).</param>
    /// <param name="lastCardId">The last presented card to avoid when possible.</param>
    /// <param name="excludedCardIds">Cards already shown in this series.</param>
    /// <returns>The next card, or null if no cards remain.</returns>
    public static CardReviewState? SelectNextCardByPackageFrequency(
        IEnumerable<CardReviewState> reviewStates,
        DateTimeOffset now,
        IReadOnlyDictionary<string, string> packageIdsByCardId,
        IReadOnlyDictionary<string, int> percentages,
        double sample,
        string? lastCardId = null,
        IReadOnlySet<string>? excludedCardIds = null)
    {
        ArgumentNullException.ThrowIfNull(reviewStates);
        ArgumentNullException.ThrowIfNull(packageIdsByCardId);
        ArgumentNullException.ThrowIfNull(percentages);
        PackageReviewFrequency.Validate(percentages.Keys.ToArray(), percentages);
        if (!double.IsFinite(sample) || sample is < 0 or >= 1)
        {
            throw new ArgumentOutOfRangeException(nameof(sample));
        }

        var packages = reviewStates
            .Where(state => excludedCardIds is null || !excludedCardIds.Contains(state.CardId))
            .GroupBy(state => packageIdsByCardId[state.CardId])
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .ToArray();
        if (packages.Length == 0)
        {
            return null;
        }

        var threshold = sample * packages.Sum(group => percentages[group.Key]);
        var cumulative = 0;
        foreach (var package in packages)
        {
            cumulative += percentages[package.Key];
            if (threshold < cumulative)
            {
                return SelectNextCard(package, now, lastCardId);
            }
        }

        throw new InvalidOperationException("The frequency sample did not select a package.");
    }

    private static TimeSpan IntervalForLevel(int level)
    {
        return level switch
        {
            1 => TimeSpan.FromHours(1),
            2 => TimeSpan.FromHours(4),
            3 => TimeSpan.FromHours(24),
            4 => TimeSpan.FromHours(72),
            >= 5 => TimeSpan.FromHours(168),
            _ => throw new ArgumentOutOfRangeException(nameof(level))
        };
    }
}
