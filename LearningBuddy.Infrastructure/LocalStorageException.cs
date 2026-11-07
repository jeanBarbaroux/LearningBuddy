using Microsoft.Data.Sqlite;

namespace LearningBuddy.Infrastructure;

public sealed class LocalStorageException : Exception
{
    private const int SqlitePermissionDenied = 3;
    private const int SqliteBusy = 5;
    private const int SqliteLocked = 6;
    private const int SqliteReadOnly = 8;
    private const int SqliteIoError = 10;
    private const int SqliteCorrupt = 11;
    private const int SqliteFull = 13;
    private const int SqliteCannotOpen = 14;
    private const int SqliteAuthorization = 23;
    private const int SqliteFormat = 24;
    private const int SqliteNotADatabase = 26;
    private const int SqliteIoErrorRead = 266;
    private const int SqliteIoErrorShortRead = 522;
    private const int SqliteIoErrorWrite = 778;
    private const int SqliteIoErrorFsync = 1034;
    private const int SqliteIoErrorDirFsync = 1290;
    private const int SqliteIoErrorTruncate = 1546;
    private const int SqliteIoErrorFstat = 1802;
    private const int SqliteIoErrorUnlock = 2058;
    private const int SqliteIoErrorReadLock = 2314;
    private const int SqliteIoErrorDelete = 2570;
    private const int SqliteIoErrorAccess = 3338;
    private const int SqliteIoErrorCheckReservedLock = 3594;
    private const int SqliteIoErrorLock = 3850;
    private const int SqliteIoErrorDeleteNoEnt = 5898;
    private const int SqliteIoErrorCommitAtomic = 7690;

    public LocalStorageException(string message, Exception innerException)
        : this(message, innerException, Classify(innerException))
    {
    }

    public LocalStorageException(
        string message,
        Exception innerException,
        LocalStorageErrorKind kind)
        : base(message, innerException)
    {
        Kind = kind;
    }

    public LocalStorageErrorKind Kind { get; }

    public static LocalStorageErrorKind Classify(Exception? exception) => exception switch
    {
        LocalStorageException storageException => storageException.Kind,
        SqliteException sqliteException => ClassifySqliteError(
            sqliteException.SqliteErrorCode,
            sqliteException.SqliteExtendedErrorCode),
        UnauthorizedAccessException or IOException => LocalStorageErrorKind.Inaccessible,
        FormatException or InvalidCastException or OverflowException => LocalStorageErrorKind.Corrupted,
        _ => LocalStorageErrorKind.OperationFailed
    };

    private static LocalStorageErrorKind ClassifySqliteError(int errorCode, int extendedErrorCode) =>
        (errorCode & 0xFF) switch
        {
            SqlitePermissionDenied or SqliteBusy or SqliteLocked
                or SqliteCannotOpen or SqliteAuthorization => LocalStorageErrorKind.Inaccessible,
            SqliteReadOnly or SqliteFull => LocalStorageErrorKind.WriteFailed,
            SqliteIoError => ClassifyIoError(extendedErrorCode),
            SqliteCorrupt or SqliteFormat or SqliteNotADatabase => LocalStorageErrorKind.Corrupted,
            _ => LocalStorageErrorKind.OperationFailed
        };

    // SQLITE_IOERR also covers read and lock failures; only write-side codes may claim
    // that a write failed.
    private static LocalStorageErrorKind ClassifyIoError(int extendedErrorCode) =>
        extendedErrorCode switch
        {
            SqliteIoErrorWrite or SqliteIoErrorFsync or SqliteIoErrorDirFsync
                or SqliteIoErrorTruncate or SqliteIoErrorDelete or SqliteIoErrorDeleteNoEnt
                or SqliteIoErrorCommitAtomic => LocalStorageErrorKind.WriteFailed,
            SqliteIoErrorRead or SqliteIoErrorShortRead or SqliteIoErrorFstat
                or SqliteIoErrorUnlock or SqliteIoErrorReadLock or SqliteIoErrorAccess
                or SqliteIoErrorCheckReservedLock or SqliteIoErrorLock => LocalStorageErrorKind.Inaccessible,
            _ => LocalStorageErrorKind.OperationFailed
        };
}
