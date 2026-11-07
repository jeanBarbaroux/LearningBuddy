using LearningBuddy.Core;

namespace LearningBuddy.Infrastructure;

/// <summary>
/// Construit les messages utilisateur des erreurs de stockage local à partir du catalogue bilingue.
/// </summary>
public static class LocalStorageErrorText
{
    public static string Format(string operationKey, LocalStorageException exception, string language)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(operationKey);
        ArgumentNullException.ThrowIfNull(exception);
        return string.Join(
            Environment.NewLine,
            UiText.Get(operationKey, language),
            UiText.Get(GetKindKey(exception.Kind), language),
            UiText.Format("StorageDiagnostic", language, GetDiagnostic(exception)));
    }

    public static string FormatStartupFailure(
        LocalStorageException exception,
        string databaseFilePath,
        string language)
    {
        ArgumentNullException.ThrowIfNull(exception);
        ArgumentException.ThrowIfNullOrWhiteSpace(databaseFilePath);
        return string.Join(
            Environment.NewLine,
            UiText.Get("StartupFailure", language),
            UiText.Get(GetKindKey(exception.Kind), language),
            UiText.Format("StorageDatabaseLocation", language, databaseFilePath),
            UiText.Format("StorageDiagnostic", language, GetDiagnostic(exception)));
    }

    public static string GetKindKey(LocalStorageErrorKind kind) => kind switch
    {
        LocalStorageErrorKind.Inaccessible => "StorageErrorInaccessible",
        LocalStorageErrorKind.WriteFailed => "StorageErrorWriteFailed",
        LocalStorageErrorKind.Corrupted => "StorageErrorCorrupted",
        LocalStorageErrorKind.IncompatibleVersion => "StorageErrorIncompatibleVersion",
        _ => "StorageErrorOperationFailed"
    };

    private static string GetDiagnostic(LocalStorageException exception) =>
        exception.InnerException?.Message ?? exception.Message;
}
