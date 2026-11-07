using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace LearningBuddy.Core;

public sealed class ReviewedImportCard : INotifyPropertyChanged
{
    private readonly string _uiLanguage;
    private string _question;
    private string _answer;
    private bool _isExcluded;

    internal ReviewedImportCard(int index, ImportedCard card, string uiLanguage)
    {
        Index = index;
        OriginalCard = card;
        _uiLanguage = uiLanguage;
        _question = card.Question;
        _answer = card.Answer;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public int Index { get; }

    public string DisplayLabel => UiText.Format("CardLabel", _uiLanguage, Index + 1);

    public ImportedCard OriginalCard { get; }

    public bool HasImage => OriginalCard.ImageData is not null;

    public bool HasAnswerImage => OriginalCard.AnswerImageData is not null;

    public string Question
    {
        get => _question;
        set
        {
            ArgumentNullException.ThrowIfNull(value);
            if (_question == value)
            {
                return;
            }

            _question = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(QuestionDiagnostic));
            OnPropertyChanged(nameof(Diagnostic));
            OnPropertyChanged(nameof(IsValid));
            OnPropertyChanged(nameof(IsCorrected));
            OnPropertyChanged(nameof(Status));
        }
    }

    public string Answer
    {
        get => _answer;
        set
        {
            ArgumentNullException.ThrowIfNull(value);
            if (_answer == value)
            {
                return;
            }

            _answer = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(AnswerDiagnostic));
            OnPropertyChanged(nameof(Diagnostic));
            OnPropertyChanged(nameof(IsValid));
            OnPropertyChanged(nameof(IsCorrected));
            OnPropertyChanged(nameof(Status));
        }
    }

    public bool IsExcluded
    {
        get => _isExcluded;
        set
        {
            if (_isExcluded == value)
            {
                return;
            }

            _isExcluded = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(Status));
        }
    }

    public string QuestionDiagnostic =>
        string.IsNullOrWhiteSpace(Question) && OriginalCard.ImageData is null
            ? $"$.cards[{Index}].question: {UiText.Get("QuestionRequired", _uiLanguage)}"
            : string.Empty;

    public string AnswerDiagnostic =>
        string.IsNullOrWhiteSpace(Answer) && OriginalCard.Type != CardType.Qcm
            ? $"$.cards[{Index}].answer: {UiText.Get("AnswerRequired", _uiLanguage)}"
            : string.Empty;

    public string Diagnostic => string.Join(
        Environment.NewLine,
        new[] { QuestionDiagnostic, AnswerDiagnostic }
            .Where(diagnostic => diagnostic.Length > 0));

    public bool IsValid =>
        QuestionDiagnostic.Length == 0 && AnswerDiagnostic.Length == 0;

    public bool IsCorrected =>
        IsValid
        && (Question != OriginalCard.Question || Answer != OriginalCard.Answer);

    public string Status => IsExcluded
        ? UiText.Get("CardExcluded", _uiLanguage)
        : !IsValid
            ? UiText.Get("CardInvalid", _uiLanguage)
            : IsCorrected
                ? UiText.Get("CardCorrected", _uiLanguage)
                : UiText.Get("CardValid", _uiLanguage);

    internal ImportedCard ToImportedCard() =>
        OriginalCard with
        {
            Question = Question,
            Answer = OriginalCard.Type == CardType.Qcm && string.IsNullOrWhiteSpace(Answer)
                ? CardChoices.DeriveAnswer(OriginalCard.Choices)
                : Answer
        };

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}

public sealed class PackageImportReview : INotifyPropertyChanged
{
    private readonly IReadOnlyList<ReviewedImportCard> _cards;
    private readonly string _uiLanguage;

    public PackageImportReview(ImportedPackage package, string uiLanguage = "fr")
    {
        ArgumentNullException.ThrowIfNull(package);
        if (uiLanguage is not ("fr" or "en"))
        {
            throw new ArgumentOutOfRangeException(nameof(uiLanguage));
        }

        _uiLanguage = uiLanguage;
        Title = package.Title;
        _cards = package.Cards
            .Select((card, index) => new ReviewedImportCard(index, card, _uiLanguage))
            .ToArray();

        foreach (var card in _cards)
        {
            card.PropertyChanged += OnCardPropertyChanged;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; }

    public IReadOnlyList<ReviewedImportCard> Cards => _cards;

    public int AcceptedCount => ValidCount + CorrectedCount;

    public int ValidCount =>
        _cards.Count(card => !card.IsExcluded && card.IsValid && !card.IsCorrected);

    public int CorrectedCount =>
        _cards.Count(card => !card.IsExcluded && card.IsCorrected);

    public int ExcludedCount => _cards.Count(card => card.IsExcluded);

    public int InvalidCount =>
        _cards.Count(card => !card.IsExcluded && !card.IsValid);

    public bool CanConfirm => AcceptedCount > 0 && InvalidCount == 0;

    public string Summary => _uiLanguage == "en"
        ? UiText.Format(
            "ImportSummary",
            _uiLanguage,
            AcceptedCount,
            string.Empty,
            ValidCount,
            string.Empty,
            CorrectedCount,
            string.Empty,
            ExcludedCount,
            string.Empty,
            InvalidCount,
            string.Empty,
            _cards.Count,
            string.Empty)
        : UiText.Format(
            "ImportSummary",
            _uiLanguage,
            AcceptedCount,
            AcceptedCount == 1 ? string.Empty : "s",
            ValidCount,
            ValidCount == 1 ? string.Empty : "s",
            CorrectedCount,
            CorrectedCount == 1 ? string.Empty : "s",
            ExcludedCount,
            ExcludedCount == 1 ? string.Empty : "s",
            InvalidCount,
            InvalidCount == 1 ? string.Empty : "s",
            _cards.Count,
            _cards.Count == 1 ? string.Empty : "s");

    public PackageImportRecords CreateRecords(string packageName, DateTimeOffset importedAt)
    {
        if (!CanConfirm)
        {
            throw new InvalidOperationException(
                UiText.Get("FixOrExcludeCards", _uiLanguage));
        }

        var acceptedCards = _cards
            .Where(card => !card.IsExcluded)
            .Select(card => card.ToImportedCard())
            .ToArray();
        var package = new ImportedPackage(Title, acceptedCards);
        return package.CreateRecords(packageName, acceptedCards, importedAt);
    }

    private void OnCardPropertyChanged(object? sender, PropertyChangedEventArgs eventArgs)
    {
        OnPropertyChanged(nameof(AcceptedCount));
        OnPropertyChanged(nameof(ValidCount));
        OnPropertyChanged(nameof(CorrectedCount));
        OnPropertyChanged(nameof(ExcludedCount));
        OnPropertyChanged(nameof(InvalidCount));
        OnPropertyChanged(nameof(CanConfirm));
        OnPropertyChanged(nameof(Summary));
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
