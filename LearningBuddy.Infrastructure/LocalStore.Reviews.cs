using LearningBuddy.Core;
using Microsoft.Data.Sqlite;

namespace LearningBuddy.Infrastructure;

public sealed partial class LocalStore
{
    public CardReviewState? GetReviewState(string cardId)
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT card_id, level, due_at, last_reviewed_at
                FROM card_review_state
                WHERE card_id = $card_id;
                """;
            command.Parameters.AddWithValue("$card_id", cardId);
            using var reader = command.ExecuteReader();
            return reader.Read()
                ? ReadReviewState(reader)
                : null;
        });
    }

    public string? GetNextReviewCardId(
        string packageId,
        DateTimeOffset now,
        string? lastCardId = null,
        IReadOnlySet<string>? excludedCardIds = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        return GetNextReviewCardId([packageId], now, lastCardId, excludedCardIds);
    }

    public string? GetNextReviewCardId(
        IReadOnlyCollection<string> packageIds,
        DateTimeOffset now,
        string? lastCardId = null,
        IReadOnlySet<string>? excludedCardIds = null)
    {
        ArgumentNullException.ThrowIfNull(packageIds);
        if (packageIds.Any(string.IsNullOrWhiteSpace))
        {
            throw new ArgumentException(
                "Les identifiants de paquets ne peuvent pas être vides.",
                nameof(packageIds));
        }

        var ids = packageIds.Distinct(StringComparer.Ordinal).ToArray();
        if (ids.Length == 0)
        {
            return null;
        }

        var percentages = GetSettings().ReviewPackagePercentages;
        // Other callers may inspect packages outside the configured review selection.
        return InConnection(connection =>
        {
            var reviewStates = new List<CardReviewState>();
            var packageIdsByCardId = new Dictionary<string, string>(StringComparer.Ordinal);
            using (var command = connection.CreateCommand())
            {
                var packageParameters = ids
                    .Select((_, index) => $"$package_id_{index}")
                    .ToArray();
                command.CommandText = """
                    SELECT state.card_id, state.level, state.due_at, state.last_reviewed_at, cards.package_id
                    FROM card_review_state AS state
                    INNER JOIN cards ON cards.id = state.card_id
                    WHERE cards.package_id IN (
                    """ + string.Join(", ", packageParameters) + """
                    );
                    """;
                for (var index = 0; index < ids.Length; index++)
                {
                    command.Parameters.AddWithValue(packageParameters[index], ids[index]);
                }

                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    reviewStates.Add(ReadReviewState(reader));
                    packageIdsByCardId.Add(reader.GetString(0), reader.GetString(4));
                }
            }

            if (percentages is not null && ids.All(percentages.ContainsKey))
            {
                return ReviewScheduler.SelectNextCardByPackageFrequency(
                    reviewStates,
                    now,
                    packageIdsByCardId,
                    percentages,
                    Random.Shared.NextDouble(),
                    lastCardId,
                    excludedCardIds)?.CardId;
            }

            return ReviewScheduler.SelectNextCard(
                reviewStates,
                now,
                lastCardId,
                excludedCardIds,
                packageIdsByCardId)?.CardId;
        });
    }

    public ReviewEvent StartReview(string cardId, DateTimeOffset shownAt)
    {
        ValidateUuidV4(cardId, nameof(cardId));
        var eventId = Guid.NewGuid().ToString("D");
        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                CardReviewState state;
                using (var command = connection.CreateCommand())
                {
                    command.Transaction = transaction;
                    command.CommandText = """
                        SELECT card_id, level, due_at, last_reviewed_at
                        FROM card_review_state
                        WHERE card_id = $card_id;
                        """;
                    command.Parameters.AddWithValue("$card_id", cardId);
                    using var reader = command.ExecuteReader();
                    if (!reader.Read())
                    {
                        throw new InvalidOperationException(
                            $"La carte « {cardId} » n’a pas d’état de révision.");
                    }

                    state = ReadReviewState(reader);
                }

                Execute(connection, transaction, """
                    INSERT INTO review_events (
                        id, card_id, shown_at, answered_at, outcome,
                        level_before, level_after, due_at_before, due_at_after
                    ) VALUES (
                        $id, $card_id, $shown_at, NULL, NULL,
                        $level_before, NULL, $due_at_before, NULL
                    );
                    """,
                    ("$id", eventId),
                    ("$card_id", cardId),
                    ("$shown_at", FormatDate(shownAt)),
                    ("$level_before", state.Level),
                    ("$due_at_before", FormatDate(state.DueAt)));

                transaction.Commit();
                return new ReviewEvent(
                    eventId,
                    cardId,
                    shownAt,
                    null,
                    null,
                    state.Level,
                    null,
                    state.DueAt,
                    null);
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    public ReviewEvent CompleteReview(
        string eventId,
        DateTimeOffset answeredAt,
        ReviewOutcome outcome)
    {
        ValidateUuidV4(eventId, nameof(eventId));
        if (!Enum.IsDefined(outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(outcome));
        }

        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                ReviewEvent reviewEvent;
                CardReviewState currentState;
                using (var command = connection.CreateCommand())
                {
                    command.Transaction = transaction;
                    command.CommandText = """
                        SELECT events.id, events.card_id, events.shown_at, events.answered_at,
                               events.outcome, events.level_before, events.level_after,
                               events.due_at_before, events.due_at_after,
                               state.card_id, state.level, state.due_at, state.last_reviewed_at
                        FROM review_events AS events
                        INNER JOIN card_review_state AS state ON state.card_id = events.card_id
                        WHERE events.id = $id;
                        """;
                    command.Parameters.AddWithValue("$id", eventId);
                    using var reader = command.ExecuteReader();
                    if (!reader.Read())
                    {
                        throw new InvalidOperationException(
                            $"La sollicitation « {eventId} » est introuvable.");
                    }

                    reviewEvent = ReadReviewEvent(reader);
                    currentState = ReadReviewState(reader, 9);
                }

                if (reviewEvent.Outcome is not null || reviewEvent.AnsweredAt is not null)
                {
                    throw new InvalidOperationException(
                        $"La sollicitation « {eventId} » a déjà été finalisée.");
                }

                var nextState = ReviewScheduler.CalculateNextState(currentState, outcome, answeredAt);
                var changesReviewState = nextState != currentState;
                var levelAfter = nextState.Level;
                var dueAtAfter = nextState.DueAt;

                if (changesReviewState)
                {
                    var updated = Execute(connection, transaction, """
                        UPDATE card_review_state
                        SET level = $level, due_at = $due_at, last_reviewed_at = $reviewed_at
                        WHERE card_id = $card_id;
                        """,
                        ("$level", nextState.Level),
                        ("$due_at", FormatDate(nextState.DueAt)),
                        ("$reviewed_at", FormatDate(answeredAt)),
                        ("$card_id", reviewEvent.CardId));
                    if (updated != 1)
                    {
                        throw new InvalidOperationException(
                            $"L’état de révision de la carte « {reviewEvent.CardId} » n’existe plus.");
                    }
                }

                var finalized = Execute(connection, transaction, """
                    UPDATE review_events
                    SET answered_at = $answered_at, outcome = $outcome,
                        level_after = $level_after, due_at_after = $due_at_after
                    WHERE id = $id AND outcome IS NULL AND answered_at IS NULL;
                    """,
                    ("$answered_at", FormatDate(answeredAt)),
                    ("$outcome", ToDatabaseOutcome(outcome)),
                    ("$level_after", levelAfter),
                    ("$due_at_after", FormatDate(dueAtAfter)),
                    ("$id", eventId));
                if (finalized != 1)
                {
                    throw new InvalidOperationException(
                        $"La sollicitation « {eventId} » ne peut pas être finalisée deux fois.");
                }

                transaction.Commit();
                return reviewEvent with
                {
                    AnsweredAt = answeredAt,
                    Outcome = outcome,
                    LevelAfter = levelAfter,
                    DueAtAfter = dueAtAfter
                };
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    public int RecoverOpenReviews(DateTimeOffset recoveredAt)
    {
        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                var recovered = Execute(connection, transaction, """
                    UPDATE review_events
                    SET answered_at = $recovered_at,
                        outcome = 'no_result',
                        level_after = level_before,
                        due_at_after = due_at_before
                    WHERE outcome IS NULL AND answered_at IS NULL;
                    """,
                    ("$recovered_at", FormatDate(recoveredAt)));
                transaction.Commit();
                return recovered;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    public IReadOnlyList<ReviewEvent> GetReviewEvents(string? packageId)
    {
        if (packageId is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        }

        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT events.id, events.card_id, events.shown_at, events.answered_at,
                       events.outcome, events.level_before, events.level_after,
                       events.due_at_before, events.due_at_after
                FROM review_events AS events
                INNER JOIN cards ON cards.id = events.card_id
                WHERE ($package_id IS NULL OR cards.package_id = $package_id)
                ORDER BY events.shown_at, events.id;
                """;
            command.Parameters.AddWithValue(
                "$package_id",
                packageId is null ? DBNull.Value : packageId);
            using var reader = command.ExecuteReader();
            var events = new List<ReviewEvent>();
            while (reader.Read())
            {
                events.Add(ReadReviewEvent(reader));
            }

            return (IReadOnlyList<ReviewEvent>)events;
        });
    }

    private static CardReviewState ReadReviewState(
        SqliteDataReader reader,
        int startIndex = 0)
    {
        return new CardReviewState(
            reader.GetString(startIndex),
            reader.GetInt32(startIndex + 1),
            ParseDate(reader.GetString(startIndex + 2)),
            reader.IsDBNull(startIndex + 3)
                ? null
                : ParseDate(reader.GetString(startIndex + 3)));
    }

    private static ReviewEvent ReadReviewEvent(SqliteDataReader reader)
    {
        return new ReviewEvent(
            reader.GetString(0),
            reader.GetString(1),
            ParseDate(reader.GetString(2)),
            reader.IsDBNull(3) ? null : ParseDate(reader.GetString(3)),
            reader.IsDBNull(4) ? null : ParseOutcome(reader.GetString(4)),
            reader.GetInt32(5),
            reader.IsDBNull(6) ? null : reader.GetInt32(6),
            ParseDate(reader.GetString(7)),
            reader.IsDBNull(8) ? null : ParseDate(reader.GetString(8)));
    }

    private static string ToDatabaseOutcome(ReviewOutcome outcome)
    {
        return outcome switch
        {
            ReviewOutcome.Again => "again",
            ReviewOutcome.Hard => "hard",
            ReviewOutcome.Good => "good",
            ReviewOutcome.Easy => "easy",
            ReviewOutcome.Passed => "passed",
            ReviewOutcome.NoResult => "no_result",
            _ => throw new ArgumentOutOfRangeException(nameof(outcome))
        };
    }

    private static ReviewOutcome ParseOutcome(string outcome)
    {
        return outcome switch
        {
            "again" => ReviewOutcome.Again,
            "hard" => ReviewOutcome.Hard,
            "good" => ReviewOutcome.Good,
            "easy" => ReviewOutcome.Easy,
            "passed" => ReviewOutcome.Passed,
            "no_result" => ReviewOutcome.NoResult,
            _ => throw new FormatException(
                $"L’issue de révision « {outcome} » n’est pas reconnue.")
        };
    }
}
