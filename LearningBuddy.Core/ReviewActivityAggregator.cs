namespace LearningBuddy.Core;

public sealed record DailyReviewActivity(DateOnly Date, int Reviews);

public static class ReviewActivityAggregator
{
    public static IReadOnlyList<DailyReviewActivity> Aggregate(
        IEnumerable<ReviewEvent> events,
        DateOnly startDate,
        DateOnly endDate,
        TimeZoneInfo localTimeZone)
    {
        ArgumentNullException.ThrowIfNull(events);
        ArgumentNullException.ThrowIfNull(localTimeZone);
        if (startDate > endDate)
        {
            throw new ArgumentException(
                "La date de début doit être antérieure ou égale à la date de fin.",
                nameof(startDate));
        }

        var counts = new Dictionary<DateOnly, int>();
        var eventIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var reviewEvent in events)
        {
            if (reviewEvent is null)
            {
                throw new InvalidDataException("L’historique contient un événement absent.");
            }

            var localDate = DateOnly.FromDateTime(
                TimeZoneInfo.ConvertTime(reviewEvent.ShownAt, localTimeZone).DateTime);
            if (localDate < startDate || localDate > endDate)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(reviewEvent.Id))
            {
                throw new InvalidDataException("Un événement de révision n’a pas d’identifiant.");
            }

            if (!eventIds.Add(reviewEvent.Id))
            {
                throw new InvalidDataException(
                    $"L’événement de révision « {reviewEvent.Id} » est présent plusieurs fois.");
            }

            counts[localDate] = counts.GetValueOrDefault(localDate) + 1;
        }

        var days = new List<DailyReviewActivity>();
        for (var date = startDate; date <= endDate; date = date.AddDays(1))
        {
            days.Add(new DailyReviewActivity(date, counts.GetValueOrDefault(date)));
        }

        return days;
    }
}
