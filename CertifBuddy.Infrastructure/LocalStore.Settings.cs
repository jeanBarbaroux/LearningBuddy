using System.Text.Json;
using CertifBuddy.Core;

namespace CertifBuddy.Infrastructure;

public sealed partial class LocalStore
{
    public AppSettings GetSettings()
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT active_package_id, interval_seconds, assistant_enabled,
                       ui_language, monitor_device_id, position_x, position_y,
                       questions_per_series, avatar_preset_id, companion_wandering_enabled,
                       use_fixed_schedule, daily_review_slots, pause_during_teams_meetings,
                       review_snooze_minutes, review_package_ids, launch_at_startup, ui_theme,
                       review_package_percentages, avatar_size_percent, bubble_size_percent,
                       auto_hide_companion_after_series
                FROM app_settings
                WHERE id = 1;
                """;
            using var reader = command.ExecuteReader();
            if (!reader.Read())
            {
                throw new LocalStorageException(
                    "La ligne de configuration locale est absente.",
                    new InvalidOperationException("La ligne app_settings id = 1 est absente."),
                    LocalStorageErrorKind.Corrupted);
            }

            var useFixedSchedule = reader.GetInt32(10) == 1;
            DailyReviewSlot[]? slots;
            try
            {
                slots = reader.IsDBNull(11)
                    ? null
                    : JsonSerializer.Deserialize<DailyReviewSlot[]>(reader.GetString(11))
                        ?? throw new JsonException("La liste des horaires est nulle.");
                DailyReviewSchedule.Validate(slots ?? [], useFixedSchedule);
            }
            catch (Exception exception) when (exception is JsonException or ArgumentException)
            {
                throw new LocalStorageException(
                    "Les horaires de révision enregistrés sont invalides.",
                    exception,
                    LocalStorageErrorKind.Corrupted);
            }

            string[]? reviewPackageIds;
            try
            {
                reviewPackageIds = reader.IsDBNull(14)
                    ? null
                    : JsonSerializer.Deserialize<string[]>(reader.GetString(14))
                        ?? throw new JsonException("La liste des paquets est nulle.");
                if (reviewPackageIds is not null
                    && (reviewPackageIds.Any(string.IsNullOrWhiteSpace)
                        || reviewPackageIds.Distinct(StringComparer.Ordinal).Count()
                            != reviewPackageIds.Length))
                {
                    throw new JsonException("La liste des paquets contient des identifiants invalides.");
                }

                if (reviewPackageIds is { Length: 1 }
                    && !reader.IsDBNull(0)
                    && string.Equals(reader.GetString(0), reviewPackageIds[0], StringComparison.Ordinal))
                {
                    reviewPackageIds = null;
                }
            }
            catch (JsonException exception)
            {
                throw new LocalStorageException(
                    "La sélection des paquets à réviser est invalide.",
                    exception,
                    LocalStorageErrorKind.Corrupted);
            }

            Dictionary<string, int>? percentages;
            try
            {
                percentages = reader.IsDBNull(17)
                    ? null
                    : JsonSerializer.Deserialize<Dictionary<string, int>>(reader.GetString(17))
                        ?? throw new JsonException("The package distribution is null.");
                PackageReviewFrequency.Validate(
                    reviewPackageIds ?? (reader.IsDBNull(0) ? [] : [reader.GetString(0)]),
                    percentages);
            }
            catch (Exception exception) when (exception is JsonException or ArgumentException)
            {
                throw new LocalStorageException(
                    "La répartition des paquets enregistrée est invalide.",
                    exception,
                    LocalStorageErrorKind.Corrupted);
            }

            return new AppSettings(
                reader.IsDBNull(0) ? null : reader.GetString(0),
                reader.GetInt32(1),
                reader.GetInt32(2) == 1,
                reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetDouble(5),
                reader.IsDBNull(6) ? null : reader.GetDouble(6),
                reader.GetInt64(7),
                reader.GetString(8),
                reader.GetInt32(9) == 1,
                useFixedSchedule,
                slots,
                reader.GetInt32(12) == 1,
                reader.GetInt32(13),
                reviewPackageIds,
                reader.GetInt32(15) == 1,
                reader.GetString(16),
                percentages,
                reader.GetInt32(18),
                reader.GetInt32(19),
                reader.GetInt32(20) == 1);
        });
    }

    public void SaveSettings(AppSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        if (settings.AvatarSizePercent is < AppSettings.MinimumDisplaySizePercent or > AppSettings.MaximumDisplaySizePercent
            || settings.BubbleSizePercent is < AppSettings.MinimumDisplaySizePercent or > AppSettings.MaximumDisplaySizePercent)
        {
            throw new LocalStorageException(
                "La taille de l'avatar et de la bulle doit être comprise entre 50 % et 200 %.",
                new ArgumentOutOfRangeException(nameof(settings)));
        }

        try
        {
            DailyReviewSchedule.Validate(settings.DailyReviewSlots ?? [], settings.UseFixedSchedule);
        }
        catch (ArgumentException exception)
        {
            throw new LocalStorageException("Les horaires de révision sont invalides.", exception);
        }

        if (settings.IntervalSeconds is < MinimumAssistantIntervalSeconds
            or > MaximumAssistantIntervalSeconds
            || settings.IntervalSeconds % 60 != 0)
        {
            throw new LocalStorageException(
                "L’intervalle de sollicitation doit être un nombre entier de minutes supérieur ou égal à 1.",
                new ArgumentOutOfRangeException(nameof(settings), settings.IntervalSeconds, null));
        }

        if (settings.QuestionsPerSeries < MinimumQuestionsPerSeries)
        {
            throw new LocalStorageException(
                "Le nombre de questions par série doit être un entier positif.",
                new ArgumentOutOfRangeException(
                    nameof(settings),
                    settings.QuestionsPerSeries,
                    null));
        }

        if (settings.ReviewSnoozeMinutes is < 1 or > 120)
        {
            throw new LocalStorageException(
                "Le délai de rappel doit être un nombre entier de minutes compris entre 1 et 120.",
                new ArgumentOutOfRangeException(
                    nameof(settings),
                    settings.ReviewSnoozeMinutes,
                    null));
        }

        if (!AvatarStoryboard.PresetIds.Contains(settings.AvatarPresetId, StringComparer.Ordinal))
        {
            throw new LocalStorageException(
                $"Le preset avatar « {settings.AvatarPresetId} » n’est pas approuvé.",
                new ArgumentOutOfRangeException(nameof(settings), settings.AvatarPresetId, null));
        }

        if (!ThemePreference.IsValid(settings.UiTheme))
        {
            throw new LocalStorageException(
                $"Le thème « {settings.UiTheme} » n’est pas pris en charge.",
                new ArgumentOutOfRangeException(nameof(settings), settings.UiTheme, null));
        }

        var reviewPackageIds = settings.ReviewPackageIds
            ?? (settings.ActivePackageId is { } activePackageId ? [activePackageId] : []);
        if (reviewPackageIds.Any(string.IsNullOrWhiteSpace)
            || reviewPackageIds.Distinct(StringComparer.Ordinal).Count() != reviewPackageIds.Count)
        {
            throw new LocalStorageException(
                "La sélection des paquets à réviser contient des identifiants invalides.",
                new ArgumentException("Les identifiants doivent être non vides et uniques."));
        }

        var serializedReviewPackageIds = settings.ReviewPackageIds is null
            && settings.ActivePackageId is null
                ? null
                : JsonSerializer.Serialize(reviewPackageIds);

        try
        {
            PackageReviewFrequency.Validate(reviewPackageIds, settings.ReviewPackagePercentages);
        }
        catch (ArgumentException exception)
        {
            throw new LocalStorageException("La répartition des paquets est invalide.", exception);
        }

        InConnection(connection =>
        {
            var hasCardsInReviewPackages = false;
            foreach (var packageId in reviewPackageIds)
            {
                using var command = connection.CreateCommand();
                command.CommandText = """
                    SELECT EXISTS (SELECT 1 FROM packages WHERE id = $package_id),
                           EXISTS (
                        SELECT 1
                        FROM cards
                        WHERE cards.package_id = $package_id
                    );
                    """;
                command.Parameters.AddWithValue("$package_id", packageId);
                using var reader = command.ExecuteReader();
                if (!reader.Read() || reader.GetInt32(0) != 1)
                {
                    throw new LocalStorageException(
                        "Un paquet sélectionné pour les révisions n’existe plus.",
                        new InvalidOperationException($"Le paquet « {packageId} » est introuvable."));
                }

                hasCardsInReviewPackages |= reader.GetInt32(1) == 1;
            }

            if (settings.AssistantEnabled && !hasCardsInReviewPackages)
            {
                throw new LocalStorageException(
                    "Sélectionnez au moins un paquet contenant des cartes avant d’activer l’assistant.",
                    new InvalidOperationException("L’assistant nécessite un paquet de révision non vide."));
            }

            Execute(connection, null, """
                INSERT INTO app_settings (
                    id, active_package_id, interval_seconds, assistant_enabled,
                    ui_language, monitor_device_id, position_x, position_y,
                    questions_per_series, avatar_preset_id, companion_wandering_enabled,
                    use_fixed_schedule, daily_review_slots, pause_during_teams_meetings,
                    review_snooze_minutes, review_package_ids, launch_at_startup, ui_theme,
                    review_package_percentages, avatar_size_percent, bubble_size_percent,
                    auto_hide_companion_after_series
                ) VALUES (
                    1, $active_package_id, $interval_seconds, $assistant_enabled,
                    $ui_language, $monitor_device_id, $position_x, $position_y,
                    $questions_per_series, $avatar_preset_id, $companion_wandering_enabled,
                    $use_fixed_schedule, $daily_review_slots, $pause_during_teams_meetings,
                    $review_snooze_minutes, $review_package_ids, $launch_at_startup, $ui_theme,
                    $review_package_percentages, $avatar_size_percent, $bubble_size_percent,
                    $auto_hide_companion_after_series
                )
                ON CONFLICT(id) DO UPDATE SET
                    active_package_id = excluded.active_package_id,
                    interval_seconds = excluded.interval_seconds,
                    assistant_enabled = excluded.assistant_enabled,
                    ui_language = excluded.ui_language,
                    monitor_device_id = excluded.monitor_device_id,
                    position_x = excluded.position_x,
                    position_y = excluded.position_y,
                    questions_per_series = excluded.questions_per_series,
                    avatar_preset_id = excluded.avatar_preset_id,
                    companion_wandering_enabled = excluded.companion_wandering_enabled,
                    use_fixed_schedule = excluded.use_fixed_schedule,
                    daily_review_slots = excluded.daily_review_slots,
                    pause_during_teams_meetings = excluded.pause_during_teams_meetings,
                    review_snooze_minutes = excluded.review_snooze_minutes,
                    review_package_ids = excluded.review_package_ids,
                    launch_at_startup = excluded.launch_at_startup,
                    ui_theme = excluded.ui_theme,
                    review_package_percentages = excluded.review_package_percentages,
                    avatar_size_percent = excluded.avatar_size_percent,
                    bubble_size_percent = excluded.bubble_size_percent,
                    auto_hide_companion_after_series = excluded.auto_hide_companion_after_series;
                """,
                ("$active_package_id", settings.ActivePackageId),
                ("$interval_seconds", settings.IntervalSeconds),
                ("$assistant_enabled", settings.AssistantEnabled ? 1 : 0),
                ("$ui_language", settings.UiLanguage),
                ("$monitor_device_id", settings.MonitorDeviceId),
                ("$position_x", settings.PositionX),
                ("$position_y", settings.PositionY),
                ("$questions_per_series", settings.QuestionsPerSeries),
                ("$avatar_preset_id", settings.AvatarPresetId),
                ("$companion_wandering_enabled", settings.CompanionWanderingEnabled ? 1 : 0),
                ("$use_fixed_schedule", settings.UseFixedSchedule ? 1 : 0),
                ("$pause_during_teams_meetings", settings.PauseDuringTeamsMeetings ? 1 : 0),
                ("$review_snooze_minutes", settings.ReviewSnoozeMinutes),
                ("$daily_review_slots", settings.DailyReviewSlots is null
                    ? null : JsonSerializer.Serialize(settings.DailyReviewSlots)),
                ("$review_package_ids", serializedReviewPackageIds),
                ("$launch_at_startup", settings.LaunchAtStartup ? 1 : 0),
                ("$ui_theme", settings.UiTheme),
                ("$avatar_size_percent", settings.AvatarSizePercent),
                ("$bubble_size_percent", settings.BubbleSizePercent),
                ("$auto_hide_companion_after_series", settings.AutoHideCompanionAfterSeries ? 1 : 0),
                ("$review_package_percentages", settings.ReviewPackagePercentages is null
                    ? null : JsonSerializer.Serialize(settings.ReviewPackagePercentages)));
            return true;
        });
    }

    /// <summary>
    /// Persists the companion monitor and its position normalized to that monitor work area,
    /// without touching the other preferences.
    /// </summary>
    public void SaveCompanionPosition(string monitorDeviceId, NormalizedPosition position)
    {
        if (string.IsNullOrWhiteSpace(monitorDeviceId)
            || !double.IsFinite(position.X)
            || !double.IsFinite(position.Y)
            || position.X is < 0 or > 1
            || position.Y is < 0 or > 1)
        {
            throw new LocalStorageException(
                "La position du compagnon doit indiquer un moniteur et des coordonnées normalisées entre 0 et 1.",
                new ArgumentOutOfRangeException(nameof(position), position, null));
        }

        InConnection(connection =>
        {
            Execute(connection, null, """
                UPDATE app_settings
                SET monitor_device_id = $monitor_device_id,
                    position_x = $position_x,
                    position_y = $position_y
                WHERE id = 1;
                """,
                ("$monitor_device_id", monitorDeviceId),
                ("$position_x", position.X),
                ("$position_y", position.Y));
            return true;
        });
    }
}
