namespace LearningBuddy.Infrastructure;

/// <summary>
/// Catégorie d’erreur de stockage local présentée à l’utilisateur.
/// </summary>
public enum LocalStorageErrorKind
{
    OperationFailed,
    Inaccessible,
    WriteFailed,
    Corrupted,
    IncompatibleVersion
}
