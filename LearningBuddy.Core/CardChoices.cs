using System.Text;

namespace LearningBuddy.Core;

public enum CardType
{
    Card,
    Qcm
}

public sealed record CardChoice(string Text, bool IsCorrect);

/// <summary>How a QCM choice is rendered once the answer is revealed.</summary>
public enum QcmChoiceOutcome
{
    /// <summary>A correct choice the user selected.</summary>
    CorrectSelected,

    /// <summary>An incorrect choice the user selected.</summary>
    IncorrectSelected,

    /// <summary>A correct choice the user did not select.</summary>
    CorrectMissed,

    /// <summary>An incorrect choice the user rightly left unselected.</summary>
    IncorrectNotSelected
}

public static class CardChoices
{
    public const int MinimumChoices = 2;
    public const int MaximumChoices = 10;
    public const int MaximumChoiceLength = 500;

    public const string CardTypeName = "Card";
    public const string QcmTypeName = "QCM";

    private const string CorrectEditorPrefix = "[x]";
    private const string IncorrectEditorPrefix = "[ ]";

    public static string ToTypeName(CardType type) =>
        type == CardType.Qcm ? QcmTypeName : CardTypeName;

    public static bool TryParseType(string? value, out CardType type)
    {
        if (string.Equals(value, CardTypeName, StringComparison.OrdinalIgnoreCase))
        {
            type = CardType.Card;
            return true;
        }

        if (string.Equals(value, QcmTypeName, StringComparison.OrdinalIgnoreCase))
        {
            type = CardType.Qcm;
            return true;
        }

        type = CardType.Card;
        return false;
    }

    /// <summary>Returns whether the QCM expects several answers (checkboxes) rather than one (radio).</summary>
    public static bool HasMultipleCorrectAnswers(IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        return choices.Count(choice => choice.IsCorrect) > 1;
    }

    /// <summary>Builds the answer stored for a QCM whose author did not write one.</summary>
    public static string DeriveAnswer(IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        return string.Join("\n", choices.Where(choice => choice.IsCorrect).Select(choice => choice.Text));
    }

    /// <summary>Returns whether the free-text answer adds information beyond the correct choices.</summary>
    public static bool HasCustomAnswer(CardType type, string answer, IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(answer);
        return type != CardType.Qcm
            || !string.Equals(answer.Trim(), DeriveAnswer(choices), StringComparison.Ordinal);
    }

    public static QcmChoiceOutcome Evaluate(CardChoice choice, bool isSelected)
    {
        ArgumentNullException.ThrowIfNull(choice);
        return (choice.IsCorrect, isSelected) switch
        {
            (true, true) => QcmChoiceOutcome.CorrectSelected,
            (false, true) => QcmChoiceOutcome.IncorrectSelected,
            (true, false) => QcmChoiceOutcome.CorrectMissed,
            _ => QcmChoiceOutcome.IncorrectNotSelected
        };
    }

    /// <summary>Returns the reason why the choices are invalid for <paramref name="type"/>, or null.</summary>
    /// <remarks>The reason is French: it doubles as the import diagnostic translated by <see cref="UiText"/>.</remarks>
    public static string? GetValidationError(CardType type, IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        if (type == CardType.Card)
        {
            return choices.Count == 0 ? null : UiText.Get("ParserChoicesOnlyForQcm");
        }

        if (choices.Count is < MinimumChoices or > MaximumChoices)
        {
            return UiText.Format("ParserChoiceCount", "fr", MinimumChoices, MaximumChoices);
        }

        var uniqueTexts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var choice in choices)
        {
            ArgumentNullException.ThrowIfNull(choice);
            ArgumentNullException.ThrowIfNull(choice.Text);
            var text = choice.Text.Trim();
            if (CountCharacters(text) is < 1 or > MaximumChoiceLength)
            {
                return UiText.Format("ParserChoiceLength", "fr", MaximumChoiceLength);
            }

            if (!uniqueTexts.Add(text))
            {
                return UiText.Get("ParserChoiceDuplicate");
            }
        }

        return choices.Any(choice => choice.IsCorrect)
            ? null
            : UiText.Get("ParserChoiceNoCorrect");
    }

    /// <summary>Trims choice texts; the caller must first check <see cref="GetValidationError"/>.</summary>
    public static IReadOnlyList<CardChoice> Normalize(IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        return choices.Select(choice => choice with { Text = choice.Text.Trim() }).ToArray();
    }

    /// <summary>Formats choices as read-only lines, ✓ marking the correct ones.</summary>
    public static string FormatDisplay(IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        return string.Join(
            Environment.NewLine,
            choices.Select(choice => (choice.IsCorrect ? "✓ " : "○ ") + choice.Text));
    }

    /// <summary>Formats choices for the card editor: one per line, prefixed by [x] when correct.</summary>
    public static string FormatEditorText(IReadOnlyList<CardChoice> choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        var builder = new StringBuilder();
        foreach (var choice in choices)
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(choice.IsCorrect ? CorrectEditorPrefix : IncorrectEditorPrefix)
                .Append(' ')
                .Append(choice.Text);
        }

        return builder.ToString();
    }

    /// <summary>Parses the card editor text: one choice per line, [x] marks a correct one.</summary>
    public static IReadOnlyList<CardChoice> ParseEditorText(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        var choices = new List<CardChoice>();
        foreach (var rawLine in text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var line = rawLine.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            if (line.StartsWith(CorrectEditorPrefix, StringComparison.OrdinalIgnoreCase))
            {
                choices.Add(new CardChoice(line[CorrectEditorPrefix.Length..].Trim(), true));
            }
            else if (line.StartsWith(IncorrectEditorPrefix, StringComparison.Ordinal)
                || line.StartsWith("[]", StringComparison.Ordinal))
            {
                choices.Add(new CardChoice(line[(line.IndexOf(']') + 1)..].Trim(), false));
            }
            else
            {
                choices.Add(new CardChoice(line, false));
            }
        }

        return choices;
    }

    private static int CountCharacters(string value) => value.EnumerateRunes().Count();
}
