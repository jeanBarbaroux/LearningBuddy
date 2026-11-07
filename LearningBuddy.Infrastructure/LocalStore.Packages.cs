using System.Text.Json;
using LearningBuddy.Core;
using Microsoft.Data.Sqlite;

namespace LearningBuddy.Infrastructure;

public sealed partial class LocalStore
{
    public void CreatePackage(
        PackageRecord package,
        IReadOnlyCollection<CardRecord> cards,
        DateTimeOffset importedAt,
        string? librarySource = null)
    {
        ArgumentNullException.ThrowIfNull(package);
        ArgumentNullException.ThrowIfNull(cards);
        if (librarySource is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(librarySource);
        }

        var records = new PackageImportRecords(package, cards.ToArray(), importedAt);
        ValidatePackage(package, records.Cards, nameof(package), nameof(cards));
        CreatePackagesCore([records], librarySource);
    }

    public void CreatePackages(IReadOnlyCollection<PackageImportRecords> packages)
    {
        ArgumentNullException.ThrowIfNull(packages);
        if (packages.Count == 0)
        {
            throw new ArgumentException("Au moins un paquet est requis.", nameof(packages));
        }

        foreach (var records in packages)
        {
            ArgumentNullException.ThrowIfNull(records);
            ArgumentNullException.ThrowIfNull(records.Package);
            ArgumentNullException.ThrowIfNull(records.Cards);
            ValidatePackage(records.Package, records.Cards, nameof(packages), nameof(packages));
        }

        CreatePackagesCore(packages);
    }

    private static void ValidatePackage(
        PackageRecord package,
        IReadOnlyCollection<CardRecord> cards,
        string packageParameterName,
        string cardsParameterName)
    {
        ValidateUuidV4(package.Id, packageParameterName);
        if (cards.Count is < 1 or > MaximumCardsPerPackage)
        {
            throw new ArgumentOutOfRangeException(
                cardsParameterName,
                $"Un paquet doit contenir entre 1 et {MaximumCardsPerPackage} cartes.");
        }

        foreach (var card in cards)
        {
            ArgumentNullException.ThrowIfNull(card);
            ValidateUuidV4(card.Id, cardsParameterName);
            if (!string.Equals(card.PackageId, package.Id, StringComparison.Ordinal))
            {
                throw new ArgumentException(
                    "Toutes les cartes doivent appartenir au paquet créé.",
                    cardsParameterName);
            }

            ArgumentNullException.ThrowIfNull(card.Tags);
            if (string.IsNullOrWhiteSpace(card.Question) && card.ImageData is null)
            {
                throw new ArgumentException(
                    "A card requires question text or an image.",
                    cardsParameterName);
            }

            if (card.ImageData is not null
                && CardImageValidator.GetValidationError(card.ImageData) is not null)
            {
                throw new ArgumentException("The card image is invalid.", cardsParameterName);
            }

            if (card.AnswerImageData is not null
                && CardImageValidator.GetValidationError(card.AnswerImageData) is not null)
            {
                throw new ArgumentException("The answer image is invalid.", cardsParameterName);
            }
        }
    }

    private void CreatePackagesCore(
        IReadOnlyCollection<PackageImportRecords> packages,
        string? librarySource = null)
    {
        InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                foreach (var records in packages)
                {
                    InsertPackage(connection, transaction, records, librarySource);
                }

                transaction.Commit();
            }
            catch
            {
                transaction.Rollback();
                throw;
            }

            return true;
        });
    }

    private static void InsertPackage(
        SqliteConnection connection,
        SqliteTransaction transaction,
        PackageImportRecords records,
        string? librarySource)
    {
        var package = records.Package;
        Execute(connection, transaction, """
            INSERT INTO packages (id, name, created_at, updated_at, library_source)
            VALUES ($id, $name, $created_at, $updated_at, $library_source);
            """,
            ("$id", package.Id),
            ("$name", package.Name),
            ("$created_at", FormatDate(package.CreatedAt)),
            ("$updated_at", FormatDate(package.UpdatedAt)),
            ("$library_source", librarySource));

        foreach (var card in records.Cards)
        {
            Execute(connection, transaction, """
                INSERT INTO cards (
                    id, package_id, position, question, answer,
                    explanation, language, created_at, type, image_data, answer_image_data
                ) VALUES (
                    $id, $package_id, $position, $question, $answer,
                    $explanation, $language, $created_at, $type, $image_data, $answer_image_data
                );
                """,
                ("$id", card.Id),
                ("$package_id", card.PackageId),
                ("$position", card.Position),
                ("$question", card.Question),
                ("$answer", card.Answer),
                ("$explanation", card.Explanation),
                ("$language", card.Language),
                ("$created_at", FormatDate(card.CreatedAt)),
                ("$type", FormatCardType(card.Type)),
                ("$image_data", card.ImageData),
                ("$answer_image_data", card.AnswerImageData));
            InsertCardChoices(connection, transaction, card.Id, card.Choices);

            Execute(connection, transaction, """
                INSERT INTO card_review_state (card_id, level, due_at, last_reviewed_at)
                VALUES ($card_id, 0, $due_at, NULL);
                """,
                ("$card_id", card.Id),
                ("$due_at", FormatDate(records.ImportedAt)));

            for (var position = 0; position < card.Tags.Count; position++)
            {
                Execute(connection, transaction, """
                    INSERT INTO card_tags (card_id, tag, position)
                    VALUES ($card_id, $tag, $position);
                    """,
                    ("$card_id", card.Id),
                    ("$tag", card.Tags[position]),
                    ("$position", position));
            }
        }
    }

    public IReadOnlyList<PackageRecord> GetPackages()
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT id, name, created_at, updated_at
                FROM packages
                ORDER BY created_at, id;
                """;
            using var reader = command.ExecuteReader();
            var packages = new List<PackageRecord>();
            while (reader.Read())
            {
                packages.Add(new PackageRecord(
                    reader.GetString(0),
                    reader.GetString(1),
                    ParseDate(reader.GetString(2)),
                    ParseDate(reader.GetString(3))));
            }

            return packages
                .OrderBy(package => package.Name, StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(package => package.Id, StringComparer.Ordinal)
                .ToArray();
        });
    }

    public IReadOnlyList<PackageSummary> GetPackageSummaries()
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT packages.id, packages.name, packages.created_at, packages.updated_at,
                       COUNT(cards.id)
                FROM packages
                LEFT JOIN cards ON cards.package_id = packages.id
                GROUP BY packages.id, packages.name, packages.created_at, packages.updated_at
                ORDER BY packages.created_at, packages.id;
                """;
            using var reader = command.ExecuteReader();
            var summaries = new List<PackageSummary>();
            while (reader.Read())
            {
                summaries.Add(new PackageSummary(
                    new PackageRecord(
                        reader.GetString(0),
                        reader.GetString(1),
                        ParseDate(reader.GetString(2)),
                        ParseDate(reader.GetString(3))),
                    reader.GetInt32(4)));
            }

            return summaries
                .OrderBy(summary => summary.Package.Name, StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(summary => summary.Package.Id, StringComparer.Ordinal)
                .ToArray();
        });
    }

    public PackageRecord? GetPackage(string packageId)
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT id, name, created_at, updated_at
                FROM packages
                WHERE id = $id;
                """;
            command.Parameters.AddWithValue("$id", packageId);
            using var reader = command.ExecuteReader();
            return reader.Read()
                ? new PackageRecord(
                    reader.GetString(0),
                    reader.GetString(1),
                    ParseDate(reader.GetString(2)),
                    ParseDate(reader.GetString(3)))
                : null;
        });
    }

    public bool RenamePackage(string packageId, string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        ArgumentNullException.ThrowIfNull(name);
        var normalizedName = name.Trim();
        var characterCount = normalizedName.EnumerateRunes().Count();
        if (characterCount is < 1 or > 100)
        {
            throw new ArgumentException(
                "Le nom du paquet doit contenir entre 1 et 100 caractères après suppression des espaces superflus.",
                nameof(name));
        }

        return InConnection(connection =>
            Execute(
                connection,
                null,
                """
                UPDATE packages
                SET name = $name, updated_at = $updated_at
                WHERE id = $id;
                """,
                ("$name", normalizedName),
                ("$updated_at", FormatDate(DateTimeOffset.UtcNow)),
                ("$id", packageId)) > 0);
    }

    public bool DeletePackage(string packageId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageId);
        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                string? activePackageId;
                bool assistantEnabled;
                bool hasPercentages;
                string[]? storedReviewPackageIds;
                using (var command = connection.CreateCommand())
                {
                    command.Transaction = transaction;
                    command.CommandText = """
                        SELECT active_package_id, assistant_enabled, review_package_ids,
                               EXISTS (SELECT 1 FROM packages WHERE id = $id),
                               review_package_percentages IS NOT NULL
                        FROM app_settings
                        WHERE id = 1;
                        """;
                    command.Parameters.AddWithValue("$id", packageId);
                    using var reader = command.ExecuteReader();
                    if (!reader.Read() || reader.GetInt32(3) != 1)
                    {
                        transaction.Commit();
                        return false;
                    }

                    activePackageId = reader.IsDBNull(0) ? null : reader.GetString(0);
                    assistantEnabled = reader.GetInt32(1) == 1;
                    hasPercentages = reader.GetInt32(4) == 1;
                    try
                    {
                        storedReviewPackageIds = reader.IsDBNull(2)
                            ? null
                            : JsonSerializer.Deserialize<string[]>(reader.GetString(2))
                                ?? throw new JsonException("La liste des paquets est nulle.");
                    }
                    catch (JsonException exception)
                    {
                        throw new LocalStorageException(
                            "La sélection des paquets à réviser est invalide.",
                            exception,
                            LocalStorageErrorKind.Corrupted);
                    }

                    if (storedReviewPackageIds is not null
                        && (storedReviewPackageIds.Any(string.IsNullOrWhiteSpace)
                            || storedReviewPackageIds.Distinct(StringComparer.Ordinal).Count()
                                != storedReviewPackageIds.Length))
                    {
                        throw new LocalStorageException(
                            "La sélection des paquets à réviser est invalide.",
                            new JsonException("La liste des paquets contient des identifiants invalides."),
                            LocalStorageErrorKind.Corrupted);
                    }
                }

                var previousReviewPackageIds = storedReviewPackageIds
                    ?? (activePackageId is { } id ? [id] : []);
                var wasSelected = previousReviewPackageIds.Contains(packageId, StringComparer.Ordinal);
                var reviewPackageIds = previousReviewPackageIds
                    .Where(id => id != packageId)
                    .ToArray();
                if (activePackageId == packageId)
                {
                    activePackageId = reviewPackageIds.FirstOrDefault();
                }

                var hasCardsInReviewPackages = false;
                foreach (var reviewPackageId in reviewPackageIds)
                {
                    using var command = connection.CreateCommand();
                    command.Transaction = transaction;
                    command.CommandText = """
                        SELECT EXISTS (
                            SELECT 1 FROM cards WHERE package_id = $package_id
                        );
                        """;
                    command.Parameters.AddWithValue("$package_id", reviewPackageId);
                    hasCardsInReviewPackages |= Convert.ToInt32(command.ExecuteScalar()) == 1;
                }

                Execute(connection, transaction, """
                    UPDATE app_settings
                    SET active_package_id = $active_package_id,
                        assistant_enabled = $assistant_enabled,
                        review_package_ids = $review_package_ids,
                        review_package_percentages = CASE
                            WHEN review_package_percentages IS NOT NULL
                                AND $was_selected = 1 THEN $review_package_percentages
                            ELSE review_package_percentages END
                    WHERE id = 1;
                    """,
                    ("$active_package_id", activePackageId),
                    ("$was_selected", wasSelected ? 1 : 0),
                    ("$review_package_percentages", !hasPercentages || !wasSelected || reviewPackageIds.Length == 0
                        ? null : JsonSerializer.Serialize(PackageReviewFrequency.CreateEqual(reviewPackageIds))),
                    ("$assistant_enabled", assistantEnabled && hasCardsInReviewPackages ? 1 : 0),
                    ("$review_package_ids", reviewPackageIds.Length == 0
                        ? null
                        : JsonSerializer.Serialize(reviewPackageIds)));
                var deleted = Execute(
                    connection,
                    transaction,
                    "DELETE FROM packages WHERE id = $id;",
                    ("$id", packageId)) > 0;
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
}
