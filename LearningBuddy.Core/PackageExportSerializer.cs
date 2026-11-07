using System.Text.Json;
using System.Text.Json.Serialization;

namespace LearningBuddy.Core;

/// <summary>Exports package content using the importable Learning Buddy v1 contract.</summary>
public static class PackageExportSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>Serializes the current package name and cards, without local review data.</summary>
    /// <param name="package">The package to export.</param>
    /// <param name="cards">Its cards, which are exported in position order.</param>
    /// <returns>Indented UTF-8 JSON without a byte order mark.</returns>
    /// <exception cref="PackageImportException">
    /// The content or file size does not satisfy the import contract, including an empty package.
    /// </exception>
    public static byte[] Serialize(PackageRecord package, IReadOnlyList<CardRecord> cards)
    {
        ArgumentNullException.ThrowIfNull(package);
        ArgumentNullException.ThrowIfNull(cards);
        if (cards.Any(card => card.PackageId != package.Id))
        {
            throw new ArgumentException("All cards must belong to the exported package.", nameof(cards));
        }

        var json = JsonSerializer.SerializeToUtf8Bytes(new
        {
            format = "learning-buddy",
            schemaVersion = 1,
            title = package.Name,
            cards = cards.OrderBy(card => card.Position).Select(card => new
            {
                type = CardChoices.ToTypeName(card.Type),
                question = card.Question,
                image = card.ImageData,
                answer = card.Answer,
                answerImage = card.AnswerImageData,
                explanation = card.Explanation,
                language = card.Language,
                tags = card.Tags,
                choices = card.Type == CardType.Qcm
                    ? card.Choices.Select(choice => new { text = choice.Text, correct = choice.IsCorrect })
                    : null
            })
        }, Options);

        // Never save an export that the import path would reject.
        new PackageImportParser().Parse(json);
        return json;
    }
}
