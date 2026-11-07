using LearningBuddy.Core;

namespace LearningBuddy.Infrastructure;

/// <summary>A learning package bundled with the application and offered in the library.</summary>
/// <param name="Id">Stable identifier derived from the bundled file name.</param>
/// <param name="Package">The parsed package content.</param>
public sealed record LibraryPackage(string Id, ImportedPackage Package)
{
    public string Title => Package.Title;

    public int CardCount => Package.Cards.Count;
}

/// <summary>Reads the bundled learning packages and downloads them into the local store.</summary>
public sealed class PackageLibrary
{
    private readonly PackageImportFileReader _packageImportFileReader = new();

    public PackageLibrary(string packageDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(packageDirectory);
        PackageDirectory = packageDirectory;
    }

    public string PackageDirectory { get; }

    public static string DefaultPackageDirectory =>
        Path.Combine(AppContext.BaseDirectory, "Assets", "DefaultPackages");

    public IReadOnlyList<LibraryPackage> Load()
    {
        if (!Directory.Exists(PackageDirectory))
        {
            throw new DirectoryNotFoundException(
                $"Le dossier de la bibliothèque est introuvable : {PackageDirectory}");
        }

        return Directory.GetFiles(PackageDirectory, "*.json")
            .Order(StringComparer.Ordinal)
            .Select(filePath => new LibraryPackage(
                Path.GetFileNameWithoutExtension(filePath),
                _packageImportFileReader.Read(filePath)))
            .ToArray();
    }

    /// <summary>Copies a library package into the local store so it can be reviewed and edited.</summary>
    /// <returns>The created package.</returns>
    public static PackageRecord Download(
        LocalStore store,
        LibraryPackage libraryPackage,
        DateTimeOffset downloadedAt)
    {
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(libraryPackage);
        var records = libraryPackage.Package.CreateRecords(libraryPackage.Title, downloadedAt);
        store.CreatePackage(records.Package, records.Cards, records.ImportedAt, libraryPackage.Id);
        return records.Package;
    }
}
