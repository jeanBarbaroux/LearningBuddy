namespace LearningBuddy.Core;

public enum ReviewTimelineGranularity
{
    Daily,
    Weekly,
    Monthly
}

public sealed record ReviewTimelinePeriod(
    DateOnly StartDate,
    DateOnly EndDate,
    int Presented,
    int Again,
    int Hard,
    int Good,
    int Easy,
    int Passed,
    int NoResult,
    int InProgress);

public sealed record ReviewTimelineStatistics(
    ReviewTimelineGranularity Granularity,
    IReadOnlyList<ReviewTimelinePeriod> Periods);

public static class ReviewTimelineAggregator
{
    private const int DailyMaximumDays = 30;
    private const int WeeklyMaximumDays = 180;

    public static ReviewTimelineStatistics Aggregate(
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

        var dayCount = endDate.DayNumber - startDate.DayNumber + 1;
        var granularity = dayCount <= DailyMaximumDays
            ? ReviewTimelineGranularity.Daily
            : dayCount <= WeeklyMaximumDays
                ? ReviewTimelineGranularity.Weekly
                : ReviewTimelineGranularity.Monthly;

        var accumulators = CreatePeriods(startDate, endDate, granularity);
        var periodIndexes = accumulators
            .Select((period, index) => (period.NaturalStart, index))
            .ToDictionary(item => item.NaturalStart, item => item.index);
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

            var periodStart = GetNaturalPeriodStart(localDate, granularity);
            accumulators[periodIndexes[periodStart]].Add(reviewEvent);
        }

        return new ReviewTimelineStatistics(
            granularity,
            accumulators.Select(period => period.ToStatistics()).ToArray());
    }

    private static List<PeriodAccumulator> CreatePeriods(
        DateOnly startDate,
        DateOnly endDate,
        ReviewTimelineGranularity granularity)
    {
        var periods = new List<PeriodAccumulator>();
        var naturalStart = GetNaturalPeriodStart(startDate, granularity);
        while (naturalStart <= endDate)
        {
            var naturalEndExclusive = GetNextPeriodStart(naturalStart, granularity);
            var periodStart = naturalStart < startDate ? startDate : naturalStart;
            var naturalEnd = naturalEndExclusive.AddDays(-1);
            var periodEnd = naturalEnd > endDate ? endDate : naturalEnd;
            periods.Add(new PeriodAccumulator(naturalStart, periodStart, periodEnd));
            naturalStart = naturalEndExclusive;
        }

        return periods;
    }

    private static DateOnly GetNaturalPeriodStart(
        DateOnly date,
        ReviewTimelineGranularity granularity)
    {
        return granularity switch
        {
            ReviewTimelineGranularity.Daily => date,
            ReviewTimelineGranularity.Weekly =>
                date.AddDays(-(((int)date.DayOfWeek + 6) % 7)),
            ReviewTimelineGranularity.Monthly => new DateOnly(date.Year, date.Month, 1),
            _ => throw new ArgumentOutOfRangeException(nameof(granularity))
        };
    }

    private static DateOnly GetNextPeriodStart(
        DateOnly periodStart,
        ReviewTimelineGranularity granularity)
    {
        return granularity switch
        {
            ReviewTimelineGranularity.Daily => periodStart.AddDays(1),
            ReviewTimelineGranularity.Weekly => periodStart.AddDays(7),
            ReviewTimelineGranularity.Monthly => periodStart.AddMonths(1),
            _ => throw new ArgumentOutOfRangeException(nameof(granularity))
        };
    }

    private sealed class PeriodAccumulator(
        DateOnly naturalStart,
        DateOnly startDate,
        DateOnly endDate)
    {
        public DateOnly NaturalStart { get; } = naturalStart;

        public int Presented { get; private set; }

        public int Again { get; private set; }

        public int Hard { get; private set; }

        public int Good { get; private set; }

        public int Easy { get; private set; }

        public int Passed { get; private set; }

        public int NoResult { get; private set; }

        public int InProgress { get; private set; }

        public void Add(ReviewEvent reviewEvent)
        {
            Presented++;
            switch (reviewEvent.Outcome)
            {
                case ReviewOutcome.Again:
                    Again++;
                    break;
                case ReviewOutcome.Hard:
                    Hard++;
                    break;
                case ReviewOutcome.Good:
                    Good++;
                    break;
                case ReviewOutcome.Easy:
                    Easy++;
                    break;
                case ReviewOutcome.Passed:
                    Passed++;
                    break;
                case ReviewOutcome.NoResult:
                    NoResult++;
                    break;
                case null:
                    InProgress++;
                    break;
                default:
                    throw new InvalidDataException(
                        $"L’issue de révision de l’événement « {reviewEvent.Id} » n’est pas reconnue.");
            }
        }

        public ReviewTimelinePeriod ToStatistics()
        {
            return new ReviewTimelinePeriod(
                startDate,
                endDate,
                Presented,
                Again,
                Hard,
                Good,
                Easy,
                Passed,
                NoResult,
                InProgress);
        }
    }
}
