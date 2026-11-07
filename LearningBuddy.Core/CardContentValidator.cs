using System.Text;

namespace LearningBuddy.Core;

public static class CardContentValidator
{
    public const int MaximumTagsPerCard = 20;
    private const int MaximumTagLength = 64;
    private const int MaximumLanguageLength = 255;

    public static CardContent ValidateAndNormalize(CardContent content)
    {
        ArgumentNullException.ThrowIfNull(content);
        ArgumentNullException.ThrowIfNull(content.Question);
        ArgumentNullException.ThrowIfNull(content.Answer);
        ArgumentNullException.ThrowIfNull(content.Tags);

        if (string.IsNullOrWhiteSpace(content.Question) && content.ImageData is null)
        {
            throw new ArgumentException("A question is required.", "question");
        }

        if (content.ImageData is not null
            && CardImageValidator.GetValidationError(content.ImageData) is not null)
        {
            throw new ArgumentException("The question image is invalid.", "image");
        }

        if (content.AnswerImageData is not null
            && CardImageValidator.GetValidationError(content.AnswerImageData) is not null)
        {
            throw new ArgumentException("The answer image is invalid.", "answerImage");
        }

        ArgumentNullException.ThrowIfNull(content.Choices);
        if (!Enum.IsDefined(content.Type))
        {
            throw new ArgumentException("The card type is invalid.", "type");
        }

        var choicesError = CardChoices.GetValidationError(content.Type, content.Choices);
        if (choicesError is not null)
        {
            throw new ArgumentException(choicesError, "choices");
        }

        var choices = CardChoices.Normalize(content.Choices);
        var answer = content.Type == CardType.Qcm && string.IsNullOrWhiteSpace(content.Answer)
            ? CardChoices.DeriveAnswer(choices)
            : content.Answer;
        if (string.IsNullOrWhiteSpace(answer))
        {
            throw new ArgumentException("An answer is required.", "answer");
        }

        string? language = content.Language;
        if (!string.IsNullOrWhiteSpace(language))
        {
            if (CountCharacters(language) is < 2 or > MaximumLanguageLength
                || !PackageImportParser.IsValidLanguageTag(language))
            {
                throw new ArgumentException("The language tag is invalid.", "language");
            }
        }

        if (content.Tags.Count > MaximumTagsPerCard)
        {
            throw new ArgumentException(
                $"A card can have at most {MaximumTagsPerCard} tags.",
                "tags");
        }

        var tags = new List<string>(content.Tags.Count);
        var uniqueTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in content.Tags)
        {
            ArgumentNullException.ThrowIfNull(value);
            var tag = value.Trim();
            if (CountCharacters(tag) is < 1 or > MaximumTagLength)
            {
                throw new ArgumentException(
                    $"A tag must contain between 1 and {MaximumTagLength} characters.",
                    "tags");
            }

            if (uniqueTags.Add(tag))
            {
                tags.Add(tag);
            }
        }

        return content with
        {
            Answer = answer,
            Explanation = string.IsNullOrWhiteSpace(content.Explanation)
                ? null
                : content.Explanation,
            Language = string.IsNullOrWhiteSpace(language) ? null : language,
            Tags = tags,
            Choices = choices,
            ImageData = content.ImageData?.ToArray(),
            AnswerImageData = content.AnswerImageData?.ToArray()
        };
    }

    private static int CountCharacters(string value) => value.EnumerateRunes().Count();
}
