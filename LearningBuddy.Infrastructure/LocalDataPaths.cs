namespace LearningBuddy.Infrastructure;

public static class LocalDataPaths
{
    public static string GetDatabaseFilePath()
    {
        var localApplicationData = Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localApplicationData))
        {
            throw new InvalidOperationException(
                "Le dossier de données local de l’utilisateur est introuvable.");
        }

        return Path.Combine(localApplicationData, "LearningBuddy", "learning-buddy.db");
    }

    public static string EnsureDataDirectoryExists()
    {
        var directoryPath = Path.GetDirectoryName(GetDatabaseFilePath())
            ?? throw new InvalidOperationException(
                "Le dossier de données local de Learning Buddy est introuvable.");
        Directory.CreateDirectory(directoryPath);
        return directoryPath;
    }
}
