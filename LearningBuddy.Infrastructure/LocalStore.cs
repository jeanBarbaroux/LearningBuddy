using System.Globalization;
using Microsoft.Data.Sqlite;

namespace LearningBuddy.Infrastructure;

public sealed partial class LocalStore
{
    private const int MaximumCardsPerPackage = 5000;
    private const int MinimumAssistantIntervalSeconds =
        LearningBuddy.Core.AssistantSession.MinimumIntervalMinutes * 60;
    private const int MaximumAssistantIntervalSeconds =
        LearningBuddy.Core.AssistantSession.MaximumIntervalMinutes * 60;
    private const long MinimumQuestionsPerSeries = 1;
    private readonly LocalDatabase _database;

    public LocalStore(LocalDatabase database)
    {
        _database = database ?? throw new ArgumentNullException(nameof(database));
    }

    private T InConnection<T>(Func<SqliteConnection, T> operation)
    {
        try
        {
            using var connection = _database.OpenConnection();
            return operation(connection);
        }
        catch (LocalStorageException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is SqliteException
                or IOException
                or UnauthorizedAccessException
                or InvalidOperationException
                or FormatException
                or InvalidCastException
                or OverflowException)
        {
            throw new LocalStorageException(
                "Une opération sur la base locale a échoué.",
                exception);
        }
    }

    private static int Execute(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql,
        params (string Name, object? Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return command.ExecuteNonQuery();
    }

    private static string FormatDate(DateTimeOffset value)
    {
        return value.UtcDateTime.ToString(
            "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
            CultureInfo.InvariantCulture);
    }

    private static DateTimeOffset ParseDate(string value)
    {
        return DateTimeOffset.Parse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
    }

    private static void ValidateUuidV4(string value, string parameterName)
    {
        if (!Guid.TryParseExact(value, "D", out var parsed))
        {
            throw new ArgumentException("L’identifiant doit être un UUID v4 au format texte.", parameterName);
        }

        var canonical = parsed.ToString("D");
        if (canonical[14] != '4' || canonical[19] is not ('8' or '9' or 'a' or 'b'))
        {
            throw new ArgumentException("L’identifiant doit être un UUID v4 au format texte.", parameterName);
        }
    }
}
