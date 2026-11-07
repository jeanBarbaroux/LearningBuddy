namespace LearningBuddy.Core;

public static class CardImageValidator
{
    public const int MaximumImageSizeBytes = 4 * 1024 * 1024;

    private static readonly byte[] PngSignature =
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    public static string? GetValidationError(byte[] imageData)
    {
        ArgumentNullException.ThrowIfNull(imageData);
        if (imageData.Length is 0 or > MaximumImageSizeBytes)
        {
            return UiText.Get("ParserImageSize");
        }

        var isPng = imageData.AsSpan().StartsWith(PngSignature);
        var isJpeg = imageData.Length >= 3
            && imageData[0] == 0xFF
            && imageData[1] == 0xD8
            && imageData[2] == 0xFF;
        return isPng || isJpeg
            ? null
            : UiText.Get("ParserImageFormat");
    }
}
