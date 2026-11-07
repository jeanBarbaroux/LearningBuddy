using System.Text;

namespace CertifBuddy.Core;

public sealed record ImportedCard(
    string Question,
    string Answer,
    string? Explanation,
    string? Language,
    IReadOnlyList<string> Tags)
{
    public CardType Type { get; init; } = CardType.Card;

    /// <summary>Gets the QCM choices, in display order; empty for a <see cref="CardType.Card"/>.</summary>
    public IReadOnlyList<CardChoice> Choices { get; init; } = Array.Empty<CardChoice>();

    /// <summary>Gets the optional PNG or JPEG image shown with the question.</summary>
    public byte[]? ImageData { get; init; }

    /// <summary>Gets the optional PNG or JPEG image shown with the answer.</summary>
    public byte[]? AnswerImageData { get; init; }

    public string TagsDisplay => string.Join(", ", Tags);

    public bool IsQcm => Type == CardType.Qcm;

    public string ChoicesDisplay => CardChoices.FormatDisplay(Choices);
}

public sealed record PackageImportRecords(
    PackageRecord Package,
    IReadOnlyList<CardRecord> Cards,
    DateTimeOffset ImportedAt);

public sealed record ImportedPackage(
    string Title,
    IReadOnlyList<ImportedCard> Cards)
{
    public PackageImportRecords CreateRecords(
        string packageName,
        DateTimeOffset importedAt)
    {
        return CreateRecords(packageName, Cards, importedAt);
    }

    public PackageImportRecords CreateRecords(
        string packageName,
        IReadOnlyList<ImportedCard> cards,
        DateTimeOffset importedAt)
    {
        ArgumentNullException.ThrowIfNull(packageName);
        ArgumentNullException.ThrowIfNull(cards);
        if (cards.Count == 0)
        {
            throw new ArgumentException(
                "Le paquet doit contenir au moins une carte acceptée.",
                nameof(cards));
        }

        if (cards.Any(card =>
                (string.IsNullOrWhiteSpace(card.Question) && card.ImageData is null)
                || string.IsNullOrWhiteSpace(card.Answer)))
        {
            throw new ArgumentException(
                "Toutes les cartes acceptées doivent avoir une question et une réponse non blanches.",
                nameof(cards));
        }

        if (cards.Any(card => card.ImageData is not null
            && CardImageValidator.GetValidationError(card.ImageData) is not null))
        {
            throw new ArgumentException(
                "Every question image must be a valid PNG or JPEG up to 4 MiB.",
                nameof(cards));
        }

        if (cards.Any(card => card.AnswerImageData is not null
            && CardImageValidator.GetValidationError(card.AnswerImageData) is not null))
        {
            throw new ArgumentException(
                "Every answer image must be a valid PNG or JPEG up to 4 MiB.",
                nameof(cards));
        }

        var normalizedName = packageName.Trim();
        var characterCount = CountCharacters(normalizedName);
        if (characterCount is < 1 or > 100)
        {
            throw new ArgumentException(
                "Le nom du paquet doit contenir entre 1 et 100 caractères.",
                nameof(packageName));
        }

        var packageId = Guid.NewGuid().ToString("D");
        var package = new PackageRecord(
            packageId,
            normalizedName,
            importedAt,
            importedAt);
        var cardRecords = cards
            .Select((card, position) => new CardRecord(
                Guid.NewGuid().ToString("D"),
                packageId,
                position,
                card.Question,
                card.Answer,
                card.Explanation,
                card.Language,
                importedAt,
                card.Tags)
            {
                Type = card.Type,
                Choices = card.Choices,
                ImageData = card.ImageData?.ToArray(),
                AnswerImageData = card.AnswerImageData?.ToArray()
            })
            .ToArray();

        return new PackageImportRecords(package, cardRecords, importedAt);
    }

    private static int CountCharacters(string value)
    {
        var count = 0;
        foreach (var _ in value.EnumerateRunes())
        {
            count++;
        }

        return count;
    }
}
