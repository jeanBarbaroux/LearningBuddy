using LearningBuddy.Core;

namespace CertifLearningBuddyBuddy.Infrastructure;

public sealed class PackageImportFileReader
{
    private readonly PackageImportParser _parser = new();

    public ImportedPackage Read(string filePath, string uiLanguage = "fr")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        if (uiLanguage is not ("fr" or "en"))
        {
            throw new ArgumentOutOfRangeException(nameof(uiLanguage));
        }

        try
        {
            using var stream = new FileStream(
                filePath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read);
            if (stream.Length > PackageImportParser.MaximumFileSizeBytes)
            {
                throw FileTooLarge(uiLanguage);
            }

            var bytes = new byte[PackageImportParser.MaximumFileSizeBytes + 1];
            var bytesRead = 0;
            while (bytesRead < bytes.Length)
            {
                var currentRead = stream.Read(bytes.AsSpan(bytesRead));
                if (currentRead == 0)
                {
                    break;
                }

                bytesRead += currentRead;
            }

            if (bytesRead > PackageImportParser.MaximumFileSizeBytes)
            {
                throw FileTooLarge(uiLanguage);
            }

            return _parser.Parse(bytes.AsSpan(0, bytesRead), uiLanguage);
        }
        catch (PackageImportException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException)
        {
            throw new PackageImportException(
                UiText.Format("ParserFileUnreadable", uiLanguage, filePath),
                exception);
        }
    }

    private static PackageImportException FileTooLarge(string uiLanguage)
    {
        return new PackageImportException(
            UiText.Format(
                "ParserFileTooLarge",
                uiLanguage,
                PackageImportParser.MaximumFileSizeBytes / 1024 / 1024));
    }
}
