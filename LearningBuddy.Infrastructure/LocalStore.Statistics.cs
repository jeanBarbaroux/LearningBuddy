using LearningBuddy.Core;

namespace LearningBuddy.Infrastructure;

public sealed partial class LocalStore
{
    /// <summary>Reconstructs historical card levels for the selected package or all packages.</summary>
    public IReadOnlyList<CardLevelTimelinePeriod> GetCardLevelTimeline(
        string? packageId, DateOnly startDate, DateOnly endDate, TimeZoneInfo timeZone, DateTimeOffset now)
    {
        if (packageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        }

        var cards = InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT cards.id, cards.created_at, state.level,
                       (state.last_reviewed_at IS NOT NULL OR EXISTS (
                           SELECT 1 FROM review_events WHERE card_id = cards.id
                       ))
                FROM cards
                INNER JOIN card_review_state AS state ON state.card_id = cards.id
                WHERE ($package_id IS NULL OR cards.package_id = $package_id);
                """;
            command.Parameters.AddWithValue("$package_id", packageId is null ? DBNull.Value : packageId);
            using var reader = command.ExecuteReader();
            var result = new List<CardLevelTimelineCard>();
            while (reader.Read())
            {
                result.Add(new CardLevelTimelineCard(reader.GetString(0), ParseDate(reader.GetString(1)),
                    reader.GetInt32(2), reader.GetInt32(3) != 0));
            }

            return result;
        });
        return CardLevelTimeline.Aggregate(cards, GetReviewEvents(packageId), startDate, endDate, timeZone, now);
    }

    /// <summary>
    /// Counts unseen level-zero cards separately, then groups all remaining cards by current level.
    /// </summary>
    public PackageCardReviewDistribution GetPackageCardReviewDistribution(
        string? packageId,
        DateTimeOffset now)
    {
        if (packageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        }

        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                WITH selected_cards AS (
                    SELECT cards.id, state.level,
                           (state.last_reviewed_at IS NOT NULL OR EXISTS (
                               SELECT 1 FROM review_events WHERE card_id = cards.id
                           )) AS has_been_seen
                    FROM cards
                    INNER JOIN card_review_state AS state ON state.card_id = cards.id
                    WHERE ($package_id IS NULL OR cards.package_id = $package_id)
                )
                SELECT
                    COALESCE(SUM(CASE
                        WHEN level = 0 AND NOT has_been_seen
                        THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE
                        WHEN level = 0 AND has_been_seen
                        THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN level = 2 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN level = 4 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN level >= 5 THEN 1 ELSE 0 END), 0)
                FROM selected_cards;
                """;
            command.Parameters.AddWithValue(
                "$package_id",
                packageId is null ? DBNull.Value : packageId);
            using var reader = command.ExecuteReader();
            if (!reader.Read())
            {
                throw new InvalidOperationException(
                    "La répartition des cartes n’a pas pu être calculée.");
            }

            return new PackageCardReviewDistribution(
                reader.GetInt32(0),
                reader.GetInt32(1),
                reader.GetInt32(2),
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6));
        });
    }

    public ReviewTimelineStatistics GetReviewTimelineStatistics(
        string? packageId,
        DateOnly startDate,
        DateOnly endDate,
        TimeZoneInfo localTimeZone)
    {
        if (packageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        }

        ArgumentNullException.ThrowIfNull(localTimeZone);
        return ReviewTimelineAggregator.Aggregate(
            GetReviewEvents(packageId),
            startDate,
            endDate,
            localTimeZone);
    }

    public ReviewStatistics GetReviewStatistics(string? packageId, DateTimeOffset now)
    {
        if (packageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        }

        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                WITH selected_cards AS (
                    SELECT cards.id, state.level, state.due_at, state.last_reviewed_at
                    FROM cards
                    INNER JOIN card_review_state AS state ON state.card_id = cards.id
                    WHERE ($package_id IS NULL OR cards.package_id = $package_id)
                ),
                selected_events AS (
                    SELECT events.outcome
                    FROM review_events AS events
                    INNER JOIN selected_cards ON selected_cards.id = events.card_id
                )
                SELECT
                    (SELECT COUNT(*) FROM selected_events),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'again'),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'hard'),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'good'),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'easy'),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'passed'),
                    (SELECT COUNT(*) FROM selected_events WHERE outcome = 'no_result'),
                    (SELECT COUNT(*)
                     FROM selected_cards
                     WHERE last_reviewed_at IS NULL OR due_at <= $now),
                    (SELECT MIN(due_at) FROM selected_cards WHERE due_at > $now),
                    (SELECT SUM(level) FROM selected_cards),
                    (SELECT COUNT(*) FROM selected_cards);
                """;
            command.Parameters.AddWithValue(
                "$package_id",
                packageId is null ? DBNull.Value : packageId);
            command.Parameters.AddWithValue("$now", FormatDate(now));

            using var reader = command.ExecuteReader();
            if (!reader.Read())
            {
                throw new InvalidOperationException(
                    "Les statistiques locales n’ont pas pu être calculées.");
            }

            var levelSum = reader.IsDBNull(9) ? (long?)null : reader.GetInt64(9);
            var cardCount = reader.GetInt64(10);
            decimal? averageReviewLevel = levelSum is null
                ? null
                : (decimal)levelSum.Value / cardCount;

            return new ReviewStatistics(
                reader.GetInt32(0),
                reader.GetInt32(1),
                reader.GetInt32(2),
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6),
                reader.GetInt32(7),
                reader.IsDBNull(8) ? null : ParseDate(reader.GetString(8)),
                averageReviewLevel);
        });
    }
}
