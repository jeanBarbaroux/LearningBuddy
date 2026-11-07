namespace LearningBuddy.Core;

public sealed record PackageRecord(
    string Id,
    string Name,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record PackageSummary(PackageRecord Package, int CardCount);

public sealed record CardRecord(
    string Id,
    string PackageId,
    int Position,
    string Question,
    string Answer,
    string? Explanation,
    string? Language,
    DateTimeOffset CreatedAt,
    IReadOnlyList<string> Tags)
{
    /// <summary>Gets the current review level, which is zero or greater.</summary>
    public int ReviewLevel { get; init; }

    public CardType Type { get; init; } = CardType.Card;

    /// <summary>Gets the QCM choices, in display order; empty for a <see cref="CardType.Card"/>.</summary>
    public IReadOnlyList<CardChoice> Choices { get; init; } = Array.Empty<CardChoice>();

    /// <summary>Gets the optional PNG or JPEG image shown with the question.</summary>
    public byte[]? ImageData { get; init; }

    /// <summary>Gets the optional PNG or JPEG image shown with the answer.</summary>
    public byte[]? AnswerImageData { get; init; }
}

public sealed record CardContent(
    string Question,
    string Answer,
    string? Explanation,
    string? Language,
    IReadOnlyList<string> Tags)
{
    public CardType Type { get; init; } = CardType.Card;

    /// <summary>Gets the QCM choices, in display order; empty for a <see cref="CardType.Card"/>.</summary>
    public IReadOnlyList<CardChoice> Choices { get; init; } = Array.Empty<CardChoice>();

    /// <summary>Gets the optional PNG or JPEG image shown with the question.</summary>
    public byte[]? ImageData { get; init; }

    /// <summary>Gets the optional PNG or JPEG image shown with the answer.</summary>
    public byte[]? AnswerImageData { get; init; }
}

public sealed record CardReviewState(
    string CardId,
    int Level,
    DateTimeOffset DueAt,
    DateTimeOffset? LastReviewedAt);

public enum ReviewOutcome
{
    Again,
    Hard,
    Good,
    Easy,
    Passed,
    NoResult
}

public sealed record ReviewEvent(
    string Id,
    string CardId,
    DateTimeOffset ShownAt,
    DateTimeOffset? AnsweredAt,
    ReviewOutcome? Outcome,
    int LevelBefore,
    int? LevelAfter,
    DateTimeOffset DueAtBefore,
    DateTimeOffset? DueAtAfter);

public sealed record ReviewStatistics(
    int Presented,
    int Again,
    int Hard,
    int Good,
    int Easy,
    int Passed,
    int NoResult,
    int CardsDue,
    DateTimeOffset? NextDueAt,
    decimal? AverageReviewLevel);

/// <summary>Counts unseen cards separately, with levels five and above grouped together.</summary>
public sealed record PackageCardReviewDistribution(
    int Unseen, int Level0, int Level1, int Level2, int Level3, int Level4, int Level5OrAbove)
{
    /// <summary>Gets the total number of cards, with each card counted once.</summary>
    public int Total => Unseen + Level0 + Level1 + Level2 + Level3 + Level4 + Level5OrAbove;
}

public sealed record AppSettings(
    string? ActivePackageId,
    int IntervalSeconds,
    bool AssistantEnabled,
    string UiLanguage,
    string? MonitorDeviceId,
    double? PositionX,
    double? PositionY,
    long QuestionsPerSeries = 1,
    string AvatarPresetId = AvatarStoryboard.OwlPresetId,
    bool CompanionWanderingEnabled = false,
    bool UseFixedSchedule = false,
    IReadOnlyList<DailyReviewSlot>? DailyReviewSlots = null,
    bool PauseDuringTeamsMeetings = true,
    int ReviewSnoozeMinutes = 5,
    IReadOnlyList<string>? ReviewPackageIds = null,
    bool LaunchAtStartup = true,
    string UiTheme = ThemePreference.System,
    IReadOnlyDictionary<string, int>? ReviewPackagePercentages = null,
    int AvatarSizePercent = 100,
    int BubbleSizePercent = 100,
    bool AutoHideCompanionAfterSeries = false)
{
    /// <summary>Gets the smallest supported avatar or review bubble size, as a percentage.</summary>
    public const int MinimumDisplaySizePercent = 50;

    /// <summary>Gets the largest supported avatar or review bubble size, as a percentage.</summary>
    public const int MaximumDisplaySizePercent = 200;

    public static AppSettings Default { get; } =
        new(
            null,
            600,
            false,
            "fr",
            null,
            null,
            null,
            AvatarPresetId: AvatarStoryboard.OwlPresetId,
            CompanionWanderingEnabled: false);
}
