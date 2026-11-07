using CertifBuddy.Core;
using Microsoft.Data.Sqlite;

namespace CertifBuddy.Infrastructure;

public sealed partial class LocalStore
{
    public IReadOnlyList<CardRecord> GetCards(string packageId)
    {
        return InConnection(connection =>
        {
            var cards = new List<CardRecord>();
            using (var command = connection.CreateCommand())
            {
                command.CommandText = """
                    SELECT cards.id, package_id, position, question, answer, explanation, language, created_at, type, image_data, answer_image_data,
                           state.level
                    FROM cards
                    INNER JOIN card_review_state AS state ON state.card_id = cards.id
                    WHERE package_id = $package_id
                    ORDER BY position;
                    """;
                command.Parameters.AddWithValue("$package_id", packageId);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    cards.Add(new CardRecord(
                        reader.GetString(0),
                        reader.GetString(1),
                        reader.GetInt32(2),
                        reader.GetString(3),
                        reader.GetString(4),
                        reader.IsDBNull(5) ? null : reader.GetString(5),
                        reader.IsDBNull(6) ? null : reader.GetString(6),
                        ParseDate(reader.GetString(7)),
                        Array.Empty<string>())
                    {
                        Type = ParseCardType(reader.GetString(8)),
                        ImageData = reader.IsDBNull(9) ? null : (byte[])reader[9],
                        AnswerImageData = reader.IsDBNull(10) ? null : (byte[])reader[10],
                        ReviewLevel = reader.GetInt32(11)
                    });
                }
            }

            if (cards.Count == 0)
            {
                return (IReadOnlyList<CardRecord>)cards;
            }

            var tagsByCard = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            using (var command = connection.CreateCommand())
            {
                command.CommandText = """
                    SELECT tags.card_id, tags.tag
                    FROM card_tags AS tags
                    INNER JOIN cards ON cards.id = tags.card_id
                    WHERE cards.package_id = $package_id
                    ORDER BY cards.position, tags.position;
                    """;
                command.Parameters.AddWithValue("$package_id", packageId);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    var cardId = reader.GetString(0);
                    if (!tagsByCard.TryGetValue(cardId, out var tags))
                    {
                        tags = [];
                        tagsByCard.Add(cardId, tags);
                    }

                    tags.Add(reader.GetString(1));
                }
            }

            var choicesByCard = new Dictionary<string, List<CardChoice>>(StringComparer.Ordinal);
            using (var command = connection.CreateCommand())
            {
                command.CommandText = """
                    SELECT choices.card_id, choices.text, choices.is_correct
                    FROM card_choices AS choices
                    INNER JOIN cards ON cards.id = choices.card_id
                    WHERE cards.package_id = $package_id
                    ORDER BY cards.position, choices.position;
                    """;
                command.Parameters.AddWithValue("$package_id", packageId);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    var cardId = reader.GetString(0);
                    if (!choicesByCard.TryGetValue(cardId, out var choices))
                    {
                        choices = [];
                        choicesByCard.Add(cardId, choices);
                    }

                    choices.Add(new CardChoice(reader.GetString(1), reader.GetInt64(2) == 1));
                }
            }

            return cards
                .Select(card => card with
                {
                    Tags = tagsByCard.TryGetValue(card.Id, out var tags)
                        ? tags
                        : Array.Empty<string>(),
                    Choices = choicesByCard.TryGetValue(card.Id, out var choices)
                        ? choices
                        : Array.Empty<CardChoice>()
                })
                .ToArray();
        });
    }

    public CardRecord CreateCard(
        string packageId,
        CardContent content,
        DateTimeOffset createdAt)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        ValidateUuidV4(packageId, nameof(packageId));
        var normalizedContent = CardContentValidator.ValidateAndNormalize(content);
        var cardId = Guid.NewGuid().ToString("D");

        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                using var positionCommand = connection.CreateCommand();
                positionCommand.Transaction = transaction;
                positionCommand.CommandText = """
                    SELECT COALESCE(MAX(position), -1) + 1
                    FROM cards
                    WHERE package_id = $package_id;
                    """;
                positionCommand.Parameters.AddWithValue("$package_id", packageId);
                var position = Convert.ToInt32(positionCommand.ExecuteScalar());
                if (position >= PackageImportParser.MaximumCards)
                {
                    throw new ArgumentOutOfRangeException(
                        nameof(packageId),
                        $"Un paquet ne peut pas contenir plus de {PackageImportParser.MaximumCards} cartes.");
                }

                Execute(connection, transaction, """
                    INSERT INTO cards (
                        id, package_id, position, question, answer,
                        explanation, language, created_at, type, image_data, answer_image_data
                    ) VALUES (
                        $id, $package_id, $position, $question, $answer,
                        $explanation, $language, $created_at, $type, $image_data, $answer_image_data
                    );
                    """,
                    ("$id", cardId),
                    ("$package_id", packageId),
                    ("$position", position),
                    ("$question", normalizedContent.Question),
                    ("$answer", normalizedContent.Answer),
                    ("$explanation", normalizedContent.Explanation),
                    ("$language", normalizedContent.Language),
                    ("$created_at", FormatDate(createdAt)),
                    ("$type", FormatCardType(normalizedContent.Type)),
                    ("$image_data", normalizedContent.ImageData),
                    ("$answer_image_data", normalizedContent.AnswerImageData));

                Execute(connection, transaction, """
                    INSERT INTO card_review_state (card_id, level, due_at, last_reviewed_at)
                    VALUES ($card_id, 0, $due_at, NULL);
                    """,
                    ("$card_id", cardId),
                    ("$due_at", FormatDate(createdAt)));
                InsertCardTags(connection, transaction, cardId, normalizedContent.Tags);
                InsertCardChoices(connection, transaction, cardId, normalizedContent.Choices);
                Execute(connection, transaction, """
                    UPDATE packages SET updated_at = $updated_at WHERE id = $package_id;
                    """,
                    ("$updated_at", FormatDate(createdAt)),
                    ("$package_id", packageId));
                transaction.Commit();

                return new CardRecord(
                    cardId,
                    packageId,
                    position,
                    normalizedContent.Question,
                    normalizedContent.Answer,
                    normalizedContent.Explanation,
                    normalizedContent.Language,
                    createdAt,
                    normalizedContent.Tags)
                {
                    Type = normalizedContent.Type,
                    Choices = normalizedContent.Choices,
                    ImageData = normalizedContent.ImageData?.ToArray(),
                    AnswerImageData = normalizedContent.AnswerImageData?.ToArray()
                };
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    /// <summary>Updates card content and optionally its review level in one transaction.</summary>
    /// <param name="cardId">The identifier of the card to update.</param>
    /// <param name="content">The new card content.</param>
    /// <param name="reviewLevel">A non-negative level, or null to preserve it. Review dates and history are preserved.</param>
    /// <returns>False if the card no longer exists; otherwise true.</returns>
    public bool UpdateCard(string cardId, CardContent content, int? reviewLevel = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cardId);
        if (reviewLevel < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(reviewLevel));
        }
        var normalizedContent = CardContentValidator.ValidateAndNormalize(content);

        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                var updated = Execute(connection, transaction, """
                    UPDATE cards
                    SET question = $question,
                        answer = $answer,
                        explanation = $explanation,
                        language = $language,
                        type = $type,
                        image_data = $image_data,
                        answer_image_data = $answer_image_data
                    WHERE id = $id;
                    """,
                    ("$question", normalizedContent.Question),
                    ("$answer", normalizedContent.Answer),
                    ("$explanation", normalizedContent.Explanation),
                    ("$language", normalizedContent.Language),
                    ("$type", FormatCardType(normalizedContent.Type)),
                    ("$image_data", normalizedContent.ImageData),
                    ("$answer_image_data", normalizedContent.AnswerImageData),
                    ("$id", cardId));
                if (updated == 0)
                {
                    transaction.Commit();
                    return false;
                }

                if (reviewLevel is { } level)
                {
                    var stateUpdated = Execute(connection, transaction, """
                        UPDATE card_review_state SET level = $level WHERE card_id = $card_id;
                        """,
                        ("$level", level),
                        ("$card_id", cardId));
                    if (stateUpdated != 1)
                    {
                        throw new InvalidOperationException(
                            $"La carte « {cardId} » n’a pas d’état de révision.");
                    }
                }

                Execute(
                    connection,
                    transaction,
                    "DELETE FROM card_tags WHERE card_id = $card_id;",
                    ("$card_id", cardId));
                InsertCardTags(connection, transaction, cardId, normalizedContent.Tags);
                Execute(
                    connection,
                    transaction,
                    "DELETE FROM card_choices WHERE card_id = $card_id;",
                    ("$card_id", cardId));
                InsertCardChoices(connection, transaction, cardId, normalizedContent.Choices);
                Execute(connection, transaction, """
                    UPDATE packages SET updated_at = $updated_at
                    WHERE id = (SELECT package_id FROM cards WHERE id = $card_id);
                    """,
                    ("$updated_at", FormatDate(DateTimeOffset.UtcNow)),
                    ("$card_id", cardId));
                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    public bool DeleteCard(string packageId, string cardId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        ArgumentException.ThrowIfNullOrWhiteSpace(cardId);
        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                var deleted = Execute(
                    connection,
                    transaction,
                    "DELETE FROM cards WHERE id = $card_id AND package_id = $package_id;",
                    ("$card_id", cardId),
                    ("$package_id", packageId)) > 0;
                if (deleted)
                {
                    Execute(connection, transaction, """
                        UPDATE packages SET updated_at = $updated_at WHERE id = $package_id;
                        """,
                        ("$updated_at", FormatDate(DateTimeOffset.UtcNow)),
                        ("$package_id", packageId));
                }
                transaction.Commit();
                return deleted;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }

    private static void InsertCardTags(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string cardId,
        IReadOnlyList<string> tags)
    {
        for (var position = 0; position < tags.Count; position++)
        {
            Execute(
                connection,
                transaction,
                """
                INSERT INTO card_tags (card_id, tag, position)
                VALUES ($card_id, $tag, $position);
                """,
                ("$card_id", cardId),
                ("$tag", tags[position]),
                ("$position", position));
        }
    }

    private static void InsertCardChoices(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string cardId,
        IReadOnlyList<CardChoice> choices)
    {
        for (var position = 0; position < choices.Count; position++)
        {
            Execute(
                connection,
                transaction,
                """
                INSERT INTO card_choices (card_id, position, text, is_correct)
                VALUES ($card_id, $position, $text, $is_correct);
                """,
                ("$card_id", cardId),
                ("$position", position),
                ("$text", choices[position].Text),
                ("$is_correct", choices[position].IsCorrect ? 1 : 0));
        }
    }

    private static string FormatCardType(CardType type) =>
        type == CardType.Qcm ? "qcm" : "card";

    private static CardType ParseCardType(string value) =>
        value == "qcm" ? CardType.Qcm : CardType.Card;
}
