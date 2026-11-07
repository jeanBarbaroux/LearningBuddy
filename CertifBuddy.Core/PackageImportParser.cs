using System.Text;
using System.Text.Json;

namespace CertifBuddy.Core;

public sealed class PackageImportParser
{
    public const int MaximumFileSizeBytes = 50 * 1024 * 1024;
    public const int MaximumCards = 5000;
    private const int MaximumTagsPerCard = CardContentValidator.MaximumTagsPerCard;
    private const int MaximumJsonDepth = 64;

    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    private static readonly HashSet<string> PackageProperties =
        new(StringComparer.Ordinal)
        {
            "format",
            "schemaVersion",
            "title",
            "cards"
        };

    private static readonly HashSet<string> CardProperties =
        new(StringComparer.Ordinal)
        {
            "type",
            "question",
            "image",
            "answer",
            "answerImage",
            "explanation",
            "language",
            "tags",
            "choices"
        };

    private static readonly HashSet<string> ChoiceProperties =
        new(StringComparer.Ordinal)
        {
            "text",
            "correct"
        };

    private static readonly HashSet<string> GrandfatheredLanguageTags =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "art-lojban",
            "cel-gaulish",
            "en-GB-oed",
            "i-ami",
            "i-bnn",
            "i-default",
            "i-enochian",
            "i-hak",
            "i-klingon",
            "i-lux",
            "i-mingo",
            "i-navajo",
            "i-pwn",
            "i-tao",
            "i-tay",
            "i-tsu",
            "no-bok",
            "no-nyn",
            "sgn-BE-FR",
            "sgn-BE-NL",
            "sgn-CH-DE",
            "zh-guoyu",
            "zh-hakka",
            "zh-min",
            "zh-min-nan",
            "zh-xiang"
        };

    public ImportedPackage Parse(ReadOnlySpan<byte> utf8Json, string uiLanguage = "fr")
    {
        if (uiLanguage is not ("fr" or "en"))
        {
            throw new ArgumentOutOfRangeException(nameof(uiLanguage));
        }

        if (utf8Json.Length > MaximumFileSizeBytes)
        {
            throw new PackageImportException(
                UiText.Format(
                    "ParserFileTooLarge",
                    uiLanguage,
                    MaximumFileSizeBytes / 1024 / 1024));
        }

        string json;
        try
        {
            json = StrictUtf8.GetString(utf8Json);
        }
        catch (DecoderFallbackException exception)
        {
            throw new PackageImportException(
                UiText.Get("ParserInvalidUtf8", uiLanguage),
                exception);
        }

        if (json.Length > 0 && json[0] == '\uFEFF')
        {
            json = json[1..];
        }

        try
        {
            using var document = JsonDocument.Parse(
                json,
                new JsonDocumentOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow,
                    MaxDepth = MaximumJsonDepth
                });

            ValidateNoDuplicateProperties(document.RootElement, "$");
            try
            {
                return ReadPackage(document.RootElement);
            }
            catch (PackageImportException exception)
            {
                throw new PackageImportException(
                    UiText.TranslateImportError(exception.Message, uiLanguage),
                    exception);
            }
        }
        catch (JsonException exception)
        {
            var line = (exception.LineNumber ?? 0) + 1;
            var column = (exception.BytePositionInLine ?? 0) + 1;
            throw new PackageImportException(
                UiText.Format("ParserMalformedJson", uiLanguage, line, column),
                exception);
        }
    }

    private static ImportedPackage ReadPackage(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw Invalid("$", "la racine JSON doit être un objet");
        }

        ValidateKnownProperties(root, PackageProperties, "$");

        var format = ReadRequiredString(root, "format", "$");
        if (!string.Equals(format, "certif-buddy", StringComparison.Ordinal))
        {
            throw Invalid("$.format", "la valeur attendue est « certif-buddy »");
        }

        if (!root.TryGetProperty("schemaVersion", out var versionElement))
        {
            throw Invalid("$.schemaVersion", "champ obligatoire absent");
        }

        if (versionElement.ValueKind != JsonValueKind.Number
            || !versionElement.TryGetInt32(out var version))
        {
            throw Invalid("$.schemaVersion", "un entier est attendu");
        }

        if (version != 1)
        {
            throw Invalid("$.schemaVersion", $"la version {version} n’est pas prise en charge");
        }

        var title = ReadRequiredString(root, "title", "$").Trim();
        var titleLength = CountCharacters(title);
        if (titleLength is < 1 or > 100)
        {
            throw Invalid("$.title", "le titre doit contenir entre 1 et 100 caractères après trim");
        }

        if (!root.TryGetProperty("cards", out var cardsElement))
        {
            throw Invalid("$.cards", "champ obligatoire absent");
        }

        if (cardsElement.ValueKind != JsonValueKind.Array)
        {
            throw Invalid("$.cards", "un tableau est attendu");
        }

        var cardCount = cardsElement.GetArrayLength();
        if (cardCount is < 1 or > MaximumCards)
        {
            throw Invalid(
                "$.cards",
                $"le paquet doit contenir entre 1 et {MaximumCards} cartes");
        }

        var cards = new List<ImportedCard>(cardCount);
        var position = 0;
        foreach (var cardElement in cardsElement.EnumerateArray())
        {
            cards.Add(ReadCard(cardElement, position));
            position++;
        }

        return new ImportedPackage(title, cards);
    }

    private static ImportedCard ReadCard(JsonElement element, int position)
    {
        var path = $"$.cards[{position}]";
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw Invalid(path, "une carte doit être un objet");
        }

        ValidateKnownProperties(element, CardProperties, path);
        var type = ReadCardType(element, path);
        var imageData = ReadImageData(element, path);
        var answerImageData = ReadImageData(element, path, "answerImage");
        string question;
        if (!element.TryGetProperty("question", out var questionElement))
        {
            if (imageData is null)
            {
                throw Invalid($"{path}.question", "champ obligatoire absent");
            }

            question = string.Empty;
        }
        else if (questionElement.ValueKind != JsonValueKind.String)
        {
            throw Invalid($"{path}.question", "une chaîne est attendue");
        }
        else
        {
            question = questionElement.GetString() ?? string.Empty;
        }

        var choices = ReadChoices(element, type, path);
        var answer = type == CardType.Qcm
            ? ReadOptionalString(element, "answer", path)
            : ReadRequiredString(element, "answer", path);
        if (type == CardType.Qcm && string.IsNullOrWhiteSpace(answer))
        {
            answer = CardChoices.DeriveAnswer(choices);
        }

        string? explanation = null;
        if (element.TryGetProperty("explanation", out var explanationElement)
            && explanationElement.ValueKind != JsonValueKind.Null)
        {
            if (explanationElement.ValueKind != JsonValueKind.String)
            {
                throw Invalid($"{path}.explanation", "une chaîne ou null est attendu");
            }

            explanation = explanationElement.GetString();
        }

        string? language = null;
        if (element.TryGetProperty("language", out var languageElement))
        {
            if (languageElement.ValueKind != JsonValueKind.String)
            {
                throw Invalid($"{path}.language", "une balise de langue BCP 47 est attendue");
            }

            language = languageElement.GetString();
            if (language is null
                || CountCharacters(language) is < 2 or > 255
                || !IsValidLanguageTag(language))
            {
                throw Invalid($"{path}.language", "la balise de langue BCP 47 est invalide");
            }
        }

        var tags = ReadTags(element, path);
        return new ImportedCard(question, answer!, explanation, language, tags)
        {
            Type = type,
            Choices = choices,
            ImageData = imageData,
            AnswerImageData = answerImageData
        };
    }

    private static CardType ReadCardType(JsonElement card, string path)
    {
        if (!card.TryGetProperty("type", out var typeElement))
        {
            return CardType.Card;
        }

        if (typeElement.ValueKind != JsonValueKind.String
            || !CardChoices.TryParseType(typeElement.GetString(), out var type))
        {
            throw Invalid($"{path}.type", UiText.Get("ParserCardType"));
        }

        return type;
    }

    private static IReadOnlyList<CardChoice> ReadChoices(
        JsonElement card,
        CardType type,
        string path)
    {
        var choicesPath = $"{path}.choices";
        if (!card.TryGetProperty("choices", out var choicesElement))
        {
            if (type == CardType.Qcm)
            {
                throw Invalid(choicesPath, "champ obligatoire absent");
            }

            return Array.Empty<CardChoice>();
        }

        if (type == CardType.Card)
        {
            throw Invalid(choicesPath, UiText.Get("ParserChoicesOnlyForQcm"));
        }

        if (choicesElement.ValueKind != JsonValueKind.Array)
        {
            throw Invalid(choicesPath, "un tableau est attendu");
        }

        var choices = new List<CardChoice>(choicesElement.GetArrayLength());
        var position = 0;
        foreach (var choiceElement in choicesElement.EnumerateArray())
        {
            var choicePath = $"{choicesPath}[{position}]";
            if (choiceElement.ValueKind != JsonValueKind.Object)
            {
                throw Invalid(choicePath, UiText.Get("ParserChoiceObject"));
            }

            ValidateKnownProperties(choiceElement, ChoiceProperties, choicePath);
            var text = ReadRequiredString(choiceElement, "text", choicePath);
            var isCorrect = false;
            if (choiceElement.TryGetProperty("correct", out var correctElement))
            {
                if (correctElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    throw Invalid($"{choicePath}.correct", UiText.Get("ParserExpectedBoolean"));
                }

                isCorrect = correctElement.GetBoolean();
            }

            choices.Add(new CardChoice(text, isCorrect));
            position++;
        }

        var error = CardChoices.GetValidationError(type, choices);
        if (error is not null)
        {
            throw Invalid(choicesPath, error);
        }

        return CardChoices.Normalize(choices);
    }

    private static string? ReadOptionalString(
        JsonElement element,
        string propertyName,
        string parentPath)
    {
        if (!element.TryGetProperty(propertyName, out var property)
            || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (property.ValueKind != JsonValueKind.String)
        {
            throw Invalid($"{parentPath}.{propertyName}", "une chaîne ou null est attendu");
        }

        return property.GetString();
    }

    private static byte[]? ReadImageData(
        JsonElement card,
        string path,
        string propertyName = "image")
    {
        if (!card.TryGetProperty(propertyName, out var imageElement)
            || imageElement.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        var imagePath = $"{path}.{propertyName}";
        if (imageElement.ValueKind != JsonValueKind.String)
        {
            throw Invalid(imagePath, "une chaîne base64 ou null est attendue");
        }

        var encoded = imageElement.GetString()
            ?? throw Invalid(imagePath, "une chaîne base64 est attendue");
        var maximumEncodedLength =
            ((CardImageValidator.MaximumImageSizeBytes + 2) / 3) * 4;
        if (encoded.Length > maximumEncodedLength)
        {
            throw Invalid(imagePath, UiText.Get("ParserImageSize"));
        }

        byte[] imageData;
        try
        {
            imageData = Convert.FromBase64String(encoded);
        }
        catch (FormatException)
        {
            throw Invalid(imagePath, "une chaîne base64 valide est attendue");
        }

        var validationError = CardImageValidator.GetValidationError(imageData);
        if (validationError is not null)
        {
            throw Invalid(imagePath, validationError);
        }

        return imageData;
    }

    private static IReadOnlyList<string> ReadTags(JsonElement card, string path)
    {
        if (!card.TryGetProperty("tags", out var tagsElement))
        {
            return Array.Empty<string>();
        }

        if (tagsElement.ValueKind != JsonValueKind.Array)
        {
            throw Invalid($"{path}.tags", "un tableau de chaînes est attendu");
        }

        if (tagsElement.GetArrayLength() > MaximumTagsPerCard)
        {
            throw Invalid($"{path}.tags", $"au plus {MaximumTagsPerCard} tags sont autorisés");
        }

        var tags = new List<string>();
        var uniqueTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var position = 0;
        foreach (var tagElement in tagsElement.EnumerateArray())
        {
            var tagPath = $"{path}.tags[{position}]";
            if (tagElement.ValueKind != JsonValueKind.String)
            {
                throw Invalid(tagPath, "un tag doit être une chaîne");
            }

            var tag = (tagElement.GetString()
                ?? throw Invalid(tagPath, "un tag doit être une chaîne")).Trim();
            var tagLength = CountCharacters(tag);
            if (tagLength is < 1 or > 64)
            {
                throw Invalid(tagPath, "un tag doit contenir entre 1 et 64 caractères après trim");
            }

            if (uniqueTags.Add(tag))
            {
                tags.Add(tag);
            }

            position++;
        }

        return tags;
    }

    private static string ReadRequiredString(
        JsonElement element,
        string propertyName,
        string parentPath)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            throw Invalid($"{parentPath}.{propertyName}", "champ obligatoire absent");
        }

        if (property.ValueKind != JsonValueKind.String)
        {
            throw Invalid($"{parentPath}.{propertyName}", "une chaîne est attendue");
        }

        return property.GetString()
            ?? throw Invalid($"{parentPath}.{propertyName}", "une chaîne est attendue");
    }

    private static void ValidateKnownProperties(
        JsonElement element,
        HashSet<string> allowedProperties,
        string path)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (!allowedProperties.Contains(property.Name))
            {
                throw Invalid($"{path}.{property.Name}", "propriété inconnue");
            }
        }
    }

    private static void ValidateNoDuplicateProperties(JsonElement element, string path)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var propertyNames = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                var propertyPath = $"{path}.{property.Name}";
                if (!propertyNames.Add(property.Name))
                {
                    throw Invalid(propertyPath, "propriété JSON dupliquée");
                }

                ValidateNoDuplicateProperties(property.Value, propertyPath);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            var position = 0;
            foreach (var item in element.EnumerateArray())
            {
                ValidateNoDuplicateProperties(item, $"{path}[{position}]");
                position++;
            }
        }
    }

    internal static bool IsValidLanguageTag(string value)
    {
        if (GrandfatheredLanguageTags.Contains(value))
        {
            return true;
        }

        var subtags = value.Split('-');
        if (subtags.Length == 0)
        {
            return false;
        }

        if (string.Equals(subtags[0], "x", StringComparison.OrdinalIgnoreCase))
        {
            return subtags.Length > 1
                && subtags.Skip(1).All(subtag => IsAlphaNumeric(subtag, 1, 8));
        }

        var index = 0;
        var language = subtags[index];
        if (IsAlpha(language, 2, 3))
        {
            index++;
            var extlangCount = 0;
            while (index < subtags.Length
                && extlangCount < 3
                && IsAlpha(subtags[index], 3, 3))
            {
                extlangCount++;
                index++;
            }
        }
        else if (IsAlpha(language, 4, 4) || IsAlpha(language, 5, 8))
        {
            index++;
        }
        else
        {
            return false;
        }

        if (index < subtags.Length && IsAlpha(subtags[index], 4, 4))
        {
            index++;
        }

        if (index < subtags.Length
            && (IsAlpha(subtags[index], 2, 2) || IsNumeric(subtags[index], 3, 3)))
        {
            index++;
        }

        while (index < subtags.Length
            && (IsAlphaNumeric(subtags[index], 5, 8)
                || (subtags[index].Length == 4
                    && char.IsAsciiDigit(subtags[index][0])
                    && IsAlphaNumeric(subtags[index], 4, 4))))
        {
            index++;
        }

        var extensionSingletons = new HashSet<char>();
        while (index < subtags.Length
            && subtags[index].Length == 1
            && !string.Equals(subtags[index], "x", StringComparison.OrdinalIgnoreCase))
        {
            var singleton = char.ToLowerInvariant(subtags[index][0]);
            if (!char.IsAsciiLetterOrDigit(singleton) || !extensionSingletons.Add(singleton))
            {
                return false;
            }

            index++;
            var extensionStart = index;
            while (index < subtags.Length && IsAlphaNumeric(subtags[index], 2, 8))
            {
                index++;
            }

            if (index == extensionStart)
            {
                return false;
            }
        }

        if (index < subtags.Length
            && string.Equals(subtags[index], "x", StringComparison.OrdinalIgnoreCase))
        {
            index++;
            var privateUseStart = index;
            while (index < subtags.Length && IsAlphaNumeric(subtags[index], 1, 8))
            {
                index++;
            }

            if (index == privateUseStart)
            {
                return false;
            }
        }

        return index == subtags.Length;
    }

    private static bool IsAlpha(string value, int minimumLength, int maximumLength)
    {
        return value.Length >= minimumLength
            && value.Length <= maximumLength
            && value.All(char.IsAsciiLetter);
    }

    private static bool IsNumeric(string value, int minimumLength, int maximumLength)
    {
        return value.Length >= minimumLength
            && value.Length <= maximumLength
            && value.All(char.IsAsciiDigit);
    }

    private static bool IsAlphaNumeric(string value, int minimumLength, int maximumLength)
    {
        return value.Length >= minimumLength
            && value.Length <= maximumLength
            && value.All(char.IsAsciiLetterOrDigit);
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

    private static PackageImportException Invalid(string path, string detail)
    {
        return new PackageImportException($"{path} : {detail}.");
    }
}
