using Microsoft.Data.Sqlite;

namespace CertifBuddy.Infrastructure;

public sealed class LocalDatabase
{
    public const int CurrentSchemaVersion = 22;

    private const int MaximumDiagnosticLength = 200;

    private static readonly string[] RequiredTables =
    [
        "app_settings",
        "card_choices",
        "card_review_state",
        "card_tags",
        "cards",
        "packages",
        "review_events"
    ];

    private readonly string _databaseFilePath;
    private readonly string _initializationConnectionString;
    private readonly string _connectionString;

    public LocalDatabase(string? databaseFilePath = null)
    {
        _databaseFilePath = Path.GetFullPath(
            databaseFilePath ?? LocalDataPaths.GetDatabaseFilePath());
        _initializationConnectionString = CreateConnectionString(SqliteOpenMode.ReadWriteCreate);
        // Only initialization may create the file: a database that disappears at runtime
        // must surface as an error instead of being silently recreated empty.
        _connectionString = CreateConnectionString(SqliteOpenMode.ReadWrite);
    }

    public string DatabaseFilePath => _databaseFilePath;

    public void Initialize()
    {
        try
        {
            var directoryPath = Path.GetDirectoryName(_databaseFilePath)
                ?? throw new InvalidOperationException(
                    "Le dossier de la base locale est introuvable.");
            Directory.CreateDirectory(directoryPath);

            using var connection = OpenConnection(_initializationConnectionString);
            VerifyIntegrity(connection);
            Migrate(connection);
            VerifySchema(connection);
        }
        catch (LocalStorageException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is SqliteException
                or IOException
                or UnauthorizedAccessException
                or InvalidOperationException)
        {
            throw new LocalStorageException(
                $"La base locale n’a pas pu être initialisée à « {_databaseFilePath} ».",
                exception);
        }
    }

    internal SqliteConnection OpenConnection() => OpenConnection(_connectionString);

    private string CreateConnectionString(SqliteOpenMode mode) =>
        new SqliteConnectionStringBuilder
        {
            DataSource = _databaseFilePath,
            Mode = mode,
            Cache = SqliteCacheMode.Private,
            Pooling = false
        }.ToString();

    private SqliteConnection OpenConnection(string connectionString)
    {
        var connection = new SqliteConnection(connectionString);
        try
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA foreign_keys = ON;";
            command.ExecuteNonQuery();
            command.CommandText = "PRAGMA foreign_keys;";
            if (Convert.ToInt32(command.ExecuteScalar()) != 1)
            {
                throw new InvalidOperationException(
                    "SQLite n’a pas activé les clés étrangères pour cette connexion.");
            }

            return connection;
        }
        catch (Exception exception) when (
            exception is SqliteException
                or IOException
                or UnauthorizedAccessException
                or InvalidOperationException)
        {
            connection.Dispose();
            throw new LocalStorageException(
                $"La connexion à la base locale « {_databaseFilePath} » a échoué.",
                exception);
        }
    }

    private static void Migrate(SqliteConnection connection)
    {
        var version = ReadSchemaVersion(connection);
        if (version > CurrentSchemaVersion)
        {
            throw new LocalStorageException(
                $"La base utilise une version de schéma plus récente ({version}) que cette version de Certif Buddy ({CurrentSchemaVersion}).",
                new InvalidOperationException("Une migration vers l’arrière est interdite."),
                LocalStorageErrorKind.IncompatibleVersion);
        }

        while (version < CurrentSchemaVersion)
        {
            var migratingFromVersion = version;
            var migrateCardImages = version == 15;
            if (migrateCardImages)
            {
                SetForeignKeyEnforcement(connection, enabled: false);
            }

            using var transaction = connection.BeginTransaction();
            try
            {
                switch (version)
                {
                    case 0:
                        ApplyInitialSchema(connection, transaction);
                        version = 1;
                        break;
                    case 1:
                        ApplySeriesSettingsMigration(connection, transaction);
                        version = 2;
                        break;
                    case 2:
                        ApplyAvatarPresetMigration(connection, transaction);
                        version = 3;
                        break;
                    case 3:
                        ApplyCompanionWanderingMigration(connection, transaction);
                        version = 4;
                        break;
                    case 4:
                        ApplyDailyScheduleMigration(connection, transaction);
                        version = 5;
                        break;
                    case 5:
                        ApplyTeamsMeetingMigration(connection, transaction);
                        version = 6;
                        break;
                    case 6:
                        ApplyReviewSnoozeMigration(connection, transaction);
                        version = 7;
                        break;
                    case 7:
                        ApplyReviewPackagesMigration(connection, transaction);
                        version = 8;
                        break;
                    case 8:
                        ApplyUnboundedIntervalMigration(connection, transaction);
                        version = 9;
                        break;
                    case 9:
                        ApplyLaunchAtStartupMigration(connection, transaction);
                        version = 10;
                        break;
                    case 10:
                        ApplyUiThemeMigration(connection, transaction);
                        version = 11;
                        break;
                    case 11:
                        ApplySunAvatarPresetMigration(connection, transaction);
                        version = 12;
                        break;
                    case 12:
                        ApplyAnimalAvatarPresetsMigration(connection, transaction);
                        version = 13;
                        break;
                    case 13:
                        ApplyGibbonAvatarPresetMigration(connection, transaction);
                        version = 14;
                        break;
                    case 14:
                        ApplyQcmCardsMigration(connection, transaction);
                        version = 15;
                        break;
                    case 15:
                        ApplyCardImagesMigration(connection, transaction);
                        version = 16;
                        break;
                    case 16:
                        ApplyAnswerImagesMigration(connection, transaction);
                        version = 17;
                        break;
                    case 17:
                        using (var frequencyCommand = connection.CreateCommand())
                        {
                            frequencyCommand.Transaction = transaction;
                            frequencyCommand.CommandText =
                                "ALTER TABLE app_settings ADD COLUMN review_package_percentages TEXT;";
                            frequencyCommand.ExecuteNonQuery();
                        }
                        version = 18;
                        break;
                    case 18:
                        ApplyUnboundedReviewLevelsMigration(connection, transaction);
                        version = 19;
                        break;
                    case 19:
                        using (var sizeCommand = connection.CreateCommand())
                        {
                            sizeCommand.Transaction = transaction;
                            sizeCommand.CommandText = """
                                ALTER TABLE app_settings ADD COLUMN avatar_size_percent INTEGER NOT NULL
                                    DEFAULT 100 CHECK (avatar_size_percent BETWEEN 50 AND 200);
                                ALTER TABLE app_settings ADD COLUMN bubble_size_percent INTEGER NOT NULL
                                    DEFAULT 100 CHECK (bubble_size_percent BETWEEN 50 AND 200);
                                """;
                            sizeCommand.ExecuteNonQuery();
                        }
                        version = 20;
                        break;
                    case 20:
                        ApplyLibrarySourceMigration(connection, transaction);
                        version = 21;
                        break;
                    case 21:
                        if (!ColumnExists(connection, "app_settings", "auto_hide_companion_after_series"))
                        {
                            using (var autoHideCommand = connection.CreateCommand())
                            {
                                autoHideCommand.Transaction = transaction;
                                autoHideCommand.CommandText = """
                                    ALTER TABLE app_settings ADD COLUMN auto_hide_companion_after_series INTEGER NOT NULL
                                        DEFAULT 0 CHECK (auto_hide_companion_after_series IN (0, 1));
                                    """;
                                autoHideCommand.ExecuteNonQuery();
                            }
                        }
                        version = 22;
                        break;
                    default:
                        throw new InvalidOperationException(
                            $"Aucune migration n’est définie depuis la version {version}.");
                }

                using var command = connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = $"PRAGMA user_version = {version};";
                command.ExecuteNonQuery();
                transaction.Commit();
            }
            catch (LocalStorageException)
            {
                transaction.Rollback();
                throw;
            }
            catch (Exception exception) when (
                exception is SqliteException or InvalidOperationException)
            {
                transaction.Rollback();
                throw new LocalStorageException(
                    $"La migration de la base locale depuis la version {migratingFromVersion} a échoué.",
                    exception);
            }
            finally
            {
                if (migrateCardImages)
                {
                    SetForeignKeyEnforcement(connection, enabled: true);
                    VerifyForeignKeys(connection);
                }
            }
        }
    }

    private static void SetForeignKeyEnforcement(SqliteConnection connection, bool enabled)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA foreign_keys = {(enabled ? "ON" : "OFF")};";
        command.ExecuteNonQuery();
    }

    private static void VerifyForeignKeys(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_key_check;";
        using var reader = command.ExecuteReader();
        if (reader.Read())
        {
            throw new LocalStorageException(
                "La migration de la base locale a créé une référence invalide.",
                new InvalidOperationException("La vérification des clés étrangères a échoué."),
                LocalStorageErrorKind.Corrupted);
        }
    }

    private static void VerifyIntegrity(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA quick_check(1);";
        var result = Convert.ToString(command.ExecuteScalar());
        if (string.Equals(result, "ok", StringComparison.Ordinal))
        {
            return;
        }

        var diagnostic = result is { Length: > MaximumDiagnosticLength }
            ? result[..MaximumDiagnosticLength]
            : result;
        throw new LocalStorageException(
            "La vérification d’intégrité de la base locale a échoué ; la base n’a pas été modifiée.",
            new InvalidOperationException($"PRAGMA quick_check : {diagnostic}"),
            LocalStorageErrorKind.Corrupted);
    }

    private static void VerifySchema(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%';
            """;
        var existingTables = new HashSet<string>(StringComparer.Ordinal);
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                existingTables.Add(reader.GetString(0));
            }
        }

        var missingTables = RequiredTables
            .Where(table => !existingTables.Contains(table))
            .ToArray();
        if (missingTables.Length > 0)
        {
            throw new LocalStorageException(
                "La structure de la base locale est incomplète ; la base n’a pas été modifiée.",
                new InvalidOperationException(
                    $"Tables absentes : {string.Join(", ", missingTables)}."),
                LocalStorageErrorKind.Corrupted);
        }

        command.CommandText = "SELECT COUNT(*) FROM app_settings WHERE id = 1;";
        if (Convert.ToInt32(command.ExecuteScalar()) != 1)
        {
            throw new LocalStorageException(
                "La ligne de réglages de la base locale est absente ; la base n’a pas été modifiée.",
                new InvalidOperationException("La ligne app_settings id = 1 est absente."),
                LocalStorageErrorKind.Corrupted);
        }
    }

    private static int ReadSchemaVersion(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA user_version;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static bool ColumnExists(
        SqliteConnection connection,
        string tableName,
        string columnName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('{tableName}') WHERE name = '{columnName}';";
        return Convert.ToInt32(command.ExecuteScalar()) > 0;
    }

    // Links a package to the library entry it was downloaded from, so the library can tell
    // which entries are already available even after the package has been renamed.
    private static void ApplyLibrarySourceMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            "SELECT COUNT(*) FROM pragma_table_info('packages') WHERE name = 'library_source';";
        var hasLibrarySourceColumn = Convert.ToInt32(command.ExecuteScalar()) > 0;
        command.CommandText = (hasLibrarySourceColumn
            ? string.Empty
            : "ALTER TABLE packages ADD COLUMN library_source TEXT;") + """

            CREATE UNIQUE INDEX IF NOT EXISTS ix_packages_library_source
                ON packages(library_source)
                WHERE library_source IS NOT NULL;
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyQcmCardsMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('cards') WHERE name = 'type';";
        var hasTypeColumn = Convert.ToInt32(command.ExecuteScalar()) > 0;
        command.CommandText = (hasTypeColumn ? string.Empty : """
            ALTER TABLE cards
            ADD COLUMN type TEXT NOT NULL DEFAULT 'card'
                CHECK (type IN ('card', 'qcm'));
            """) + """

            CREATE TABLE IF NOT EXISTS card_choices (
                card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                position INTEGER NOT NULL CHECK (position >= 0),
                text TEXT NOT NULL CHECK (length(trim(text)) > 0),
                is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
                PRIMARY KEY (card_id, position)
            );
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyCardImagesMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE cards_with_images (
                id TEXT PRIMARY KEY NOT NULL,
                package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
                position INTEGER NOT NULL CHECK (position >= 0),
                question TEXT NOT NULL,
                answer TEXT NOT NULL CHECK (length(trim(answer)) > 0),
                explanation TEXT,
                language TEXT,
                created_at TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'card'
                    CHECK (type IN ('card', 'qcm')),
                image_data BLOB,
                CHECK (length(trim(question)) > 0 OR image_data IS NOT NULL),
                UNIQUE (package_id, position)
            );

            INSERT INTO cards_with_images (
                id, package_id, position, question, answer,
                explanation, language, created_at, type, image_data
            )
            SELECT
                id, package_id, position, question, answer,
                explanation, language, created_at, type, NULL
            FROM cards;

            DROP TABLE cards;
            ALTER TABLE cards_with_images RENAME TO cards;

            CREATE INDEX ix_cards_package_position
                ON cards(package_id, position);
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyAnswerImagesMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "ALTER TABLE cards ADD COLUMN answer_image_data BLOB;";
        command.ExecuteNonQuery();
    }

    private static void ApplyUnboundedReviewLevelsMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE card_review_state RENAME TO card_review_state_before_unbounded_levels;
            CREATE TABLE card_review_state (
                card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                level INTEGER NOT NULL CHECK (level >= 0),
                due_at TEXT NOT NULL,
                last_reviewed_at TEXT
            );
            INSERT INTO card_review_state (card_id, level, due_at, last_reviewed_at)
            SELECT card_id, level, due_at, last_reviewed_at
            FROM card_review_state_before_unbounded_levels;
            DROP TABLE card_review_state_before_unbounded_levels;
            CREATE INDEX ix_card_review_state_due_at ON card_review_state(due_at);

            ALTER TABLE review_events RENAME TO review_events_before_unbounded_levels;
            CREATE TABLE review_events (
                id TEXT PRIMARY KEY NOT NULL,
                card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                shown_at TEXT NOT NULL,
                answered_at TEXT,
                outcome TEXT CHECK (
                    outcome IS NULL OR outcome IN (
                        'again', 'hard', 'good', 'easy', 'passed', 'no_result'
                    )
                ),
                level_before INTEGER NOT NULL CHECK (level_before >= 0),
                level_after INTEGER CHECK (level_after >= 0),
                due_at_before TEXT NOT NULL,
                due_at_after TEXT,
                CHECK (
                    (outcome IS NULL AND answered_at IS NULL
                        AND level_after IS NULL AND due_at_after IS NULL)
                    OR
                    (outcome IS NOT NULL AND answered_at IS NOT NULL
                        AND level_after IS NOT NULL AND due_at_after IS NOT NULL)
                )
            );
            INSERT INTO review_events (
                id, card_id, shown_at, answered_at, outcome, level_before, level_after,
                due_at_before, due_at_after
            )
            SELECT
                id, card_id, shown_at, answered_at, outcome, level_before, level_after,
                due_at_before, due_at_after
            FROM review_events_before_unbounded_levels;
            DROP TABLE review_events_before_unbounded_levels;
            CREATE INDEX ix_review_events_card_shown ON review_events(card_id, shown_at);
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplySeriesSettingsMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN questions_per_series INTEGER NOT NULL DEFAULT 1
                CHECK (questions_per_series >= 1);
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyAvatarPresetMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN avatar_preset_id TEXT NOT NULL DEFAULT 'preset-owl'
                CHECK (avatar_preset_id IN ('preset-owl', 'preset-fox', 'preset-axolotl'));
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyCompanionWanderingMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN companion_wandering_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (companion_wandering_enabled IN (0, 1));
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyDailyScheduleMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN use_fixed_schedule INTEGER NOT NULL DEFAULT 0
                CHECK (use_fixed_schedule IN (0, 1));
            ALTER TABLE app_settings
            ADD COLUMN daily_review_slots TEXT;
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyTeamsMeetingMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN pause_during_teams_meetings INTEGER NOT NULL DEFAULT 1
                CHECK (pause_during_teams_meetings IN (0, 1));
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyReviewSnoozeMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN review_snooze_minutes INTEGER NOT NULL DEFAULT 5
                CHECK (review_snooze_minutes BETWEEN 1 AND 120);
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyReviewPackagesMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN review_package_ids TEXT;

            UPDATE app_settings
            SET review_package_ids = CASE
                WHEN active_package_id IS NULL THEN NULL
                ELSE '["' || active_package_id || '"]'
            END;
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyLaunchAtStartupMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN launch_at_startup INTEGER NOT NULL DEFAULT 1
                CHECK (launch_at_startup IN (0, 1));
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyUiThemeMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ALTER TABLE app_settings
            ADD COLUMN ui_theme TEXT NOT NULL DEFAULT 'system'
                CHECK (ui_theme IN ('system', 'light', 'dark'));
            """;
        command.ExecuteNonQuery();
    }

    // SQLite cannot alter a CHECK constraint, so the singleton settings table is rebuilt
    // to accept new avatar presets without changing any stored value.
    private static void ApplySunAvatarPresetMigration(
        SqliteConnection connection,
        SqliteTransaction transaction) =>
        RebuildSettingsForAvatarPresets(
            connection,
            transaction,
            "'preset-owl', 'preset-fox', 'preset-axolotl', 'preset-sun'");

    private static void ApplyAnimalAvatarPresetsMigration(
        SqliteConnection connection,
        SqliteTransaction transaction) =>
        RebuildSettingsForAvatarPresets(
            connection,
            transaction,
            "'preset-owl', 'preset-fox', 'preset-axolotl', 'preset-sun', 'preset-cat', 'preset-dog', 'preset-panda'");

    private static void ApplyGibbonAvatarPresetMigration(
        SqliteConnection connection,
        SqliteTransaction transaction) =>
        RebuildSettingsForAvatarPresets(
            connection,
            transaction,
            "'preset-owl', 'preset-fox', 'preset-axolotl', 'preset-sun', 'preset-cat', 'preset-dog', 'preset-panda', 'preset-gibbon'");

    private static void RebuildSettingsForAvatarPresets(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string allowedPresetIds)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $$"""
            CREATE TABLE app_settings_rebuilt (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_package_id TEXT REFERENCES packages(id) ON DELETE SET NULL,
                interval_seconds INTEGER NOT NULL DEFAULT 600
                    CHECK (interval_seconds BETWEEN 60 AND 2147483640),
                assistant_enabled INTEGER NOT NULL DEFAULT 0
                    CHECK (assistant_enabled IN (0, 1)),
                ui_language TEXT NOT NULL DEFAULT 'fr'
                    CHECK (ui_language IN ('fr', 'en')),
                monitor_device_id TEXT,
                position_x REAL CHECK (position_x IS NULL OR position_x BETWEEN 0 AND 1),
                position_y REAL CHECK (position_y IS NULL OR position_y BETWEEN 0 AND 1),
                questions_per_series INTEGER NOT NULL DEFAULT 1
                    CHECK (questions_per_series >= 1),
                avatar_preset_id TEXT NOT NULL DEFAULT 'preset-owl'
                    CHECK (avatar_preset_id IN ({{allowedPresetIds}})),
                companion_wandering_enabled INTEGER NOT NULL DEFAULT 0
                    CHECK (companion_wandering_enabled IN (0, 1)),
                use_fixed_schedule INTEGER NOT NULL DEFAULT 0
                    CHECK (use_fixed_schedule IN (0, 1)),
                daily_review_slots TEXT,
                pause_during_teams_meetings INTEGER NOT NULL DEFAULT 1
                    CHECK (pause_during_teams_meetings IN (0, 1)),
                review_snooze_minutes INTEGER NOT NULL DEFAULT 5
                    CHECK (review_snooze_minutes BETWEEN 1 AND 120),
                review_package_ids TEXT,
                launch_at_startup INTEGER NOT NULL DEFAULT 1
                    CHECK (launch_at_startup IN (0, 1)),
                ui_theme TEXT NOT NULL DEFAULT 'system'
                    CHECK (ui_theme IN ('system', 'light', 'dark'))
            );

            INSERT INTO app_settings_rebuilt (
                id, active_package_id, interval_seconds, assistant_enabled, ui_language,
                monitor_device_id, position_x, position_y, questions_per_series,
                avatar_preset_id, companion_wandering_enabled, use_fixed_schedule,
                daily_review_slots, pause_during_teams_meetings, review_snooze_minutes,
                review_package_ids, launch_at_startup, ui_theme
            )
            SELECT
                id, active_package_id, interval_seconds, assistant_enabled, ui_language,
                monitor_device_id, position_x, position_y, questions_per_series,
                avatar_preset_id, companion_wandering_enabled, use_fixed_schedule,
                daily_review_slots, pause_during_teams_meetings, review_snooze_minutes,
                review_package_ids, launch_at_startup, ui_theme
            FROM app_settings;

            DROP TRIGGER prevent_app_settings_deletion;
            DROP TABLE app_settings;
            ALTER TABLE app_settings_rebuilt RENAME TO app_settings;

            CREATE TRIGGER prevent_app_settings_deletion
            BEFORE DELETE ON app_settings
            BEGIN
                SELECT RAISE(ABORT, 'app_settings is a required singleton row');
            END;
            """;
        command.ExecuteNonQuery();
    }

    // SQLite cannot alter a CHECK constraint, so the singleton settings table is rebuilt
    // to drop the former 120-minute cap. The upper bound kept here is the Int32 storage limit.
    private static void ApplyUnboundedIntervalMigration(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE app_settings_v9 (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_package_id TEXT REFERENCES packages(id) ON DELETE SET NULL,
                interval_seconds INTEGER NOT NULL DEFAULT 600
                    CHECK (interval_seconds BETWEEN 60 AND 2147483640),
                assistant_enabled INTEGER NOT NULL DEFAULT 0
                    CHECK (assistant_enabled IN (0, 1)),
                ui_language TEXT NOT NULL DEFAULT 'fr'
                    CHECK (ui_language IN ('fr', 'en')),
                monitor_device_id TEXT,
                position_x REAL CHECK (position_x IS NULL OR position_x BETWEEN 0 AND 1),
                position_y REAL CHECK (position_y IS NULL OR position_y BETWEEN 0 AND 1),
                questions_per_series INTEGER NOT NULL DEFAULT 1
                    CHECK (questions_per_series >= 1),
                avatar_preset_id TEXT NOT NULL DEFAULT 'preset-owl'
                    CHECK (avatar_preset_id IN ('preset-owl', 'preset-fox', 'preset-axolotl')),
                companion_wandering_enabled INTEGER NOT NULL DEFAULT 0
                    CHECK (companion_wandering_enabled IN (0, 1)),
                use_fixed_schedule INTEGER NOT NULL DEFAULT 0
                    CHECK (use_fixed_schedule IN (0, 1)),
                daily_review_slots TEXT,
                pause_during_teams_meetings INTEGER NOT NULL DEFAULT 1
                    CHECK (pause_during_teams_meetings IN (0, 1)),
                review_snooze_minutes INTEGER NOT NULL DEFAULT 5
                    CHECK (review_snooze_minutes BETWEEN 1 AND 120),
                review_package_ids TEXT
            );

            INSERT INTO app_settings_v9 (
                id, active_package_id, interval_seconds, assistant_enabled, ui_language,
                monitor_device_id, position_x, position_y, questions_per_series,
                avatar_preset_id, companion_wandering_enabled, use_fixed_schedule,
                daily_review_slots, pause_during_teams_meetings, review_snooze_minutes,
                review_package_ids
            )
            SELECT
                id, active_package_id, interval_seconds, assistant_enabled, ui_language,
                monitor_device_id, position_x, position_y, questions_per_series,
                avatar_preset_id, companion_wandering_enabled, use_fixed_schedule,
                daily_review_slots, pause_during_teams_meetings, review_snooze_minutes,
                review_package_ids
            FROM app_settings;

            DROP TRIGGER prevent_app_settings_deletion;
            DROP TABLE app_settings;
            ALTER TABLE app_settings_v9 RENAME TO app_settings;

            CREATE TRIGGER prevent_app_settings_deletion
            BEFORE DELETE ON app_settings
            BEGIN
                SELECT RAISE(ABORT, 'app_settings is a required singleton row');
            END;
            """;
        command.ExecuteNonQuery();
    }

    private static void ApplyInitialSchema(
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE packages (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE cards (
                id TEXT PRIMARY KEY NOT NULL,
                package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
                position INTEGER NOT NULL CHECK (position >= 0),
                question TEXT NOT NULL CHECK (length(trim(question)) > 0),
                answer TEXT NOT NULL CHECK (length(trim(answer)) > 0),
                explanation TEXT,
                language TEXT,
                created_at TEXT NOT NULL,
                UNIQUE (package_id, position)
            );

            CREATE INDEX ix_cards_package_position
                ON cards(package_id, position);

            CREATE TABLE card_tags (
                card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                tag TEXT NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 64),
                position INTEGER NOT NULL CHECK (position >= 0),
                PRIMARY KEY (card_id, tag)
            );

            CREATE TABLE card_review_state (
                card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 5),
                due_at TEXT NOT NULL,
                last_reviewed_at TEXT
            );

            CREATE INDEX ix_card_review_state_due_at
                ON card_review_state(due_at);

            CREATE TABLE review_events (
                id TEXT PRIMARY KEY NOT NULL,
                card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                shown_at TEXT NOT NULL,
                answered_at TEXT,
                outcome TEXT CHECK (
                    outcome IS NULL OR outcome IN (
                        'again', 'hard', 'good', 'easy', 'passed', 'no_result'
                    )
                ),
                level_before INTEGER NOT NULL CHECK (level_before BETWEEN 0 AND 5),
                level_after INTEGER CHECK (level_after BETWEEN 0 AND 5),
                due_at_before TEXT NOT NULL,
                due_at_after TEXT,
                CHECK (
                    (outcome IS NULL AND answered_at IS NULL
                        AND level_after IS NULL AND due_at_after IS NULL)
                    OR
                    (outcome IS NOT NULL AND answered_at IS NOT NULL
                        AND level_after IS NOT NULL AND due_at_after IS NOT NULL)
                )
            );

            CREATE INDEX ix_review_events_card_shown
                ON review_events(card_id, shown_at);

            CREATE TABLE app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_package_id TEXT REFERENCES packages(id) ON DELETE SET NULL,
                interval_seconds INTEGER NOT NULL DEFAULT 600
                    CHECK (interval_seconds BETWEEN 60 AND 7200),
                assistant_enabled INTEGER NOT NULL DEFAULT 0
                    CHECK (assistant_enabled IN (0, 1)),
                ui_language TEXT NOT NULL DEFAULT 'fr'
                    CHECK (ui_language IN ('fr', 'en')),
                monitor_device_id TEXT,
                position_x REAL CHECK (position_x IS NULL OR position_x BETWEEN 0 AND 1),
                position_y REAL CHECK (position_y IS NULL OR position_y BETWEEN 0 AND 1)
            );

            INSERT INTO app_settings (
                id, active_package_id, interval_seconds, assistant_enabled, ui_language
            ) VALUES (1, NULL, 600, 0, 'fr');

            CREATE TRIGGER prevent_app_settings_deletion
            BEFORE DELETE ON app_settings
            BEGIN
                SELECT RAISE(ABORT, 'app_settings is a required singleton row');
            END;
            """;
        command.ExecuteNonQuery();
    }
}
