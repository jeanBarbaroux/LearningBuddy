namespace CertifBuddy.Core;

public sealed class PackageImportException : Exception
{
    public PackageImportException(string message)
        : base(message)
    {
    }

    public PackageImportException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
