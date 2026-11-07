namespace LearningBuddy.Core;

public sealed record ReviewTimelineFilter(
    string? PackageId,
    DateOnly StartDate,
    DateOnly EndDate)
{
    public static ReviewTimelineFilter ForLastThirtyDays(DateOnly today) =>
        new(null, today.AddDays(-29), today);

    public void Validate()
    {
        if (PackageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(PackageId);
        }

        if (StartDate > EndDate)
        {
            throw new ArgumentException(
                "La date de début doit être antérieure ou égale à la date de fin.",
                nameof(StartDate));
        }
    }
}
