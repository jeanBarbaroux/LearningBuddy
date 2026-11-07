namespace CertifBuddy.Core;

/// <summary>Describes a surviving card and its current review state for historical reconstruction.</summary>
public sealed record CardLevelTimelineCard(string Id, DateTimeOffset CreatedAt, int Level, bool Seen);

/// <summary>Contains the card distribution at the end of one local calendar period.</summary>
public sealed record CardLevelTimelinePeriod(
    DateOnly StartDate, DateOnly EndDate, PackageCardReviewDistribution Distribution)
{
    /// <summary>Gets stacked curve heights, ordered from unseen cards through level five and above.</summary>
    public IReadOnlyList<int> CumulativeCounts
    {
        get
        {
            int[] counts = [Distribution.Unseen, Distribution.Level0, Distribution.Level1,
                Distribution.Level2, Distribution.Level3, Distribution.Level4, Distribution.Level5OrAbove];
            for (var index = 1; index < counts.Length; index++)
            {
                counts[index] += counts[index - 1];
            }

            return counts;
        }
    }
}

/// <summary>Reconstructs distributions from surviving cards and recorded review events.</summary>
public static class CardLevelTimeline
{
    /// <summary>Builds end-of-period snapshots, carrying previous levels across periods without reviews.</summary>
    /// <param name="cards">Cards that still exist in the selected scope.</param>
    /// <param name="events">Recorded presentations and assessments for those cards.</param>
    /// <param name="startDate">First included local date.</param>
    /// <param name="endDate">Last included local date.</param>
    /// <param name="timeZone">Time zone used to assign transitions to dates.</param>
    /// <param name="now">Current instant, at which current levels reconcile unrecorded manual changes.</param>
    /// <returns>Snapshots with the same period boundaries as the presentations chart.</returns>
    public static IReadOnlyList<CardLevelTimelinePeriod> Aggregate(
        IReadOnlyList<CardLevelTimelineCard> cards, IReadOnlyList<ReviewEvent> events,
        DateOnly startDate, DateOnly endDate, TimeZoneInfo timeZone, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(cards);
        ArgumentNullException.ThrowIfNull(events);
        ArgumentNullException.ThrowIfNull(timeZone);
        var periods = ReviewTimelineAggregator.Aggregate([], startDate, endDate, timeZone).Periods;
        var eventsByCard = events.ToLookup(item => item.CardId, StringComparer.Ordinal);
        var transitions = new List<(DateTimeOffset At, string CardId, int Category, int Order)>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var card in cards)
        {
            if (!ids.Add(card.Id) || card.Level < 0)
            {
                throw new InvalidDataException("La source des niveaux contient une carte invalide ou dupliquée.");
            }

            var history = eventsByCard[card.Id].OrderBy(item => item.ShownAt).ToArray();
            var initialLevel = history.FirstOrDefault()?.LevelBefore ?? 0;
            transitions.Add((card.CreatedAt, card.Id, initialLevel == 0 ? 0 : CategoryForLevel(initialLevel), 0));
            foreach (var review in history)
            {
                if (review.LevelBefore < 0 || review.LevelAfter is < 0)
                {
                    throw new InvalidDataException("L’historique contient un niveau invalide.");
                }

                transitions.Add((review.ShownAt, card.Id, CategoryForLevel(review.LevelBefore), 1));
                if (review.AnsweredAt is { } answeredAt && review.LevelAfter is { } levelAfter)
                {
                    transitions.Add((answeredAt, card.Id, CategoryForLevel(levelAfter), 2));
                }
            }

            if (card.CreatedAt <= now)
            {
                transitions.Add((now, card.Id, !card.Seen && card.Level == 0 ? 0 : CategoryForLevel(card.Level), 3));
            }
        }

        var ordered = transitions.Where(item => item.At <= now)
            .OrderBy(item => item.At).ThenBy(item => item.Order).ToArray();
        var categories = new Dictionary<string, int>(StringComparer.Ordinal);
        var counts = new int[7];
        var cursor = 0;
        var result = new List<CardLevelTimelinePeriod>();
        foreach (var period in periods)
        {
            while (cursor < ordered.Length && DateOnly.FromDateTime(
                       TimeZoneInfo.ConvertTime(ordered[cursor].At, timeZone).DateTime) <= period.EndDate)
            {
                var transition = ordered[cursor++];
                if (categories.TryGetValue(transition.CardId, out var previous))
                {
                    counts[previous]--;
                }

                categories[transition.CardId] = transition.Category;
                counts[transition.Category]++;
            }

            result.Add(new CardLevelTimelinePeriod(period.StartDate, period.EndDate,
                new PackageCardReviewDistribution(counts[0], counts[1], counts[2], counts[3],
                    counts[4], counts[5], counts[6])));
        }

        return result;
    }

    private static int CategoryForLevel(int level) =>
        level == 0 ? 1 : level >= 5 ? 6 : level + 1;
}
