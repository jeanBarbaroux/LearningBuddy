namespace CertifBuddy.Infrastructure;

public sealed partial class LocalStore
{
    /// <summary>Gets the downloaded library entries, keyed by library identifier, with their package id.</summary>
    public IReadOnlyDictionary<string, string> GetLibraryPackageLinks()
    {
        return InConnection(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT library_source, id
                FROM packages
                WHERE library_source IS NOT NULL;
                """;
            using var reader = command.ExecuteReader();
            var links = new Dictionary<string, string>(StringComparer.Ordinal);
            while (reader.Read())
            {
                links[reader.GetString(0)] = reader.GetString(1);
            }

            return links;
        });
    }

    /// <summary>
    /// Links packages that were created before the library existed (for instance the packages
    /// previously seeded at first launch) to the library entry that has the same title.
    /// </summary>
    /// <returns>The number of packages that have been linked.</returns>
    public int LinkLibraryPackagesByName(
        IReadOnlyCollection<(string LibrarySource, string Title)> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);
        foreach (var (librarySource, title) in entries)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(librarySource);
            ArgumentException.ThrowIfNullOrWhiteSpace(title);
        }

        if (entries.Count == 0)
        {
            return 0;
        }

        return InConnection(connection =>
        {
            using var transaction = connection.BeginTransaction();
            try
            {
                var linkedCount = 0;
                foreach (var (librarySource, title) in entries)
                {
                    linkedCount += Execute(connection, transaction, """
                        UPDATE packages
                        SET library_source = $library_source
                        WHERE id = (
                            SELECT id FROM packages
                            WHERE library_source IS NULL AND name = $name
                            ORDER BY created_at, id
                            LIMIT 1)
                          AND NOT EXISTS (
                            SELECT 1 FROM packages WHERE library_source = $library_source);
                        """,
                        ("$library_source", librarySource),
                        ("$name", title.Trim()));
                }

                transaction.Commit();
                return linkedCount;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        });
    }
}
