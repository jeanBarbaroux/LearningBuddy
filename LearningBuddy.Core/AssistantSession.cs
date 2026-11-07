namespace LearningBuddy.Core;

public sealed class AssistantSession
{
    public const int MinimumIntervalMinutes = 1;

    /// <summary>
    /// No business maximum applies to the pause after a series; this is only the technical
    /// limit imposed by persisting the interval as a 32-bit number of seconds.
    /// </summary>
    public const int MaximumIntervalMinutes = int.MaxValue / 60;

    private readonly TimeProvider _timeProvider;
    private TimeSpan _interval;
    private long _questionsPerSeries;
    private long _seriesTarget;
    private long _questionsPresentedInSeries;
    private DateTimeOffset _nextPresentationAt;
    private bool _hasStarted;
    private bool _isEnabled;
    private bool _isSuspended;
    private bool _isClosed;
    private bool _isPresentationInProgress;
    private bool _isSeriesActive;
    private bool _isManualPresentation;
    private bool _useFixedSchedule;
    private DailyReviewSlot[] _dailySlots = [];
    private long _nextSlotQuestions;

    public AssistantSession(
        bool initiallyActive = false,
        TimeSpan? interval = null,
        TimeProvider? timeProvider = null,
        long questionsPerSeries = 1,
        bool useFixedSchedule = false,
        IEnumerable<DailyReviewSlot>? dailyReviewSlots = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _interval = interval ?? TimeSpan.FromMinutes(10);
        ValidateInterval(_interval);
        ValidateQuestionsPerSeries(questionsPerSeries);
        _questionsPerSeries = questionsPerSeries;
        _isEnabled = initiallyActive;
        _hasStarted = initiallyActive;
        _nextPresentationAt = _timeProvider.GetUtcNow()
            + (initiallyActive ? _interval : TimeSpan.Zero);
        SetSchedule(useFixedSchedule, dailyReviewSlots ?? []);
    }

    public bool IsActive => _isEnabled && !_isSuspended && !_isClosed;

    public bool IsSeriesActive => _isSeriesActive;

    public long SeriesTarget => _seriesTarget;

    public bool IsManualPresentationInProgress =>
        _isPresentationInProgress && _isManualPresentation;

    public long QuestionsPresentedInSeries => _questionsPresentedInSeries;

    public DateTimeOffset NextPresentationAt => _nextPresentationAt;

    public TimeSpan TimeUntilNextPresentation
    {
        get
        {
            var remaining = _nextPresentationAt - _timeProvider.GetUtcNow();
            return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
        }
    }

    public bool WillEndSeriesAfterCurrentPresentation =>
        !_isSeriesActive
        || _questionsPresentedInSeries >= _seriesTarget - 1;

    public void Start()
    {
        if (_isClosed || _isEnabled)
        {
            return;
        }

        _isEnabled = true;
        _nextPresentationAt = _timeProvider.GetUtcNow()
            + (_hasStarted ? _interval : TimeSpan.Zero);
        _hasStarted = true;
        if (_useFixedSchedule)
        {
            ScheduleNext();
        }
    }

    public void StartImmediately()
    {
        if (_isClosed || _isEnabled)
        {
            return;
        }

        _isEnabled = true;
        _nextPresentationAt = _timeProvider.GetUtcNow();
        _hasStarted = true;
        if (_useFixedSchedule)
        {
            ScheduleNext();
        }
    }

    public void Pause()
    {
        _isEnabled = false;
        ResetSeries();
    }

    public bool CanPresent
    {
        get
        {
            if (_useFixedSchedule && !_isSeriesActive && !_isPresentationInProgress
                && _timeProvider.GetUtcNow() >= _nextPresentationAt + TimeSpan.FromMinutes(1))
            {
                ScheduleNext();
            }

            return IsActive
                && !_isPresentationInProgress
                && (_isSeriesActive || _timeProvider.GetUtcNow() >= _nextPresentationAt);
        }
    }

    public bool CanPresentManually =>
        IsActive
        && !_isPresentationInProgress
        && !_isSeriesActive;

    public bool TryBeginPresentation(bool hasEligibleCard)
    {
        if (!hasEligibleCard || !CanPresent)
        {
            return false;
        }

        if (!_isSeriesActive)
        {
            _isSeriesActive = true;
            _seriesTarget = _useFixedSchedule ? _nextSlotQuestions : _questionsPerSeries;
            _questionsPresentedInSeries = 0;
        }

        _isPresentationInProgress = true;
        _isManualPresentation = false;
        _hasStarted = true;
        return true;
    }

    public bool TryBeginManualPresentation(bool hasEligibleCard)
    {
        if (!hasEligibleCard || !CanPresentManually)
        {
            return false;
        }

        _isPresentationInProgress = true;
        _isManualPresentation = true;
        _hasStarted = true;
        return true;
    }

    public void CompletePresentation() => CompletePresentation(hasMoreEligibleCards: false);

    public void CompletePresentation(ReviewOutcome outcome, bool hasMoreEligibleCards)
    {
        if (!Enum.IsDefined(outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(outcome));
        }

        CompletePresentation(
            hasMoreEligibleCards && outcome != ReviewOutcome.NoResult);
    }

    public void CompletePresentation(bool hasMoreEligibleCards)
    {
        if (!_isPresentationInProgress)
        {
            throw new InvalidOperationException(
                "Aucune sollicitation n’est en cours de présentation.");
        }

        _isPresentationInProgress = false;
        if (_isClosed)
        {
            _isManualPresentation = false;
            return;
        }

        _hasStarted = true;
        if (_isManualPresentation)
        {
            _isManualPresentation = false;
            return;
        }

        if (!_isSeriesActive)
        {
            ScheduleNext();
            return;
        }

        _questionsPresentedInSeries++;
        if (!hasMoreEligibleCards || _questionsPresentedInSeries >= _seriesTarget)
        {
            EndSeries();
            return;
        }

        _nextPresentationAt = _timeProvider.GetUtcNow();
    }

    public void EndSeries()
    {
        if (_isClosed)
        {
            return;
        }

        ResetSeries();
        _hasStarted = true;
        ScheduleNext();
    }

    public void SetInterval(TimeSpan interval)
    {
        ValidateInterval(interval);
        if (_interval == interval)
        {
            return;
        }

        _interval = interval;
        if (_hasStarted && !_isSeriesActive && !_useFixedSchedule)
        {
            _nextPresentationAt = _timeProvider.GetUtcNow() + _interval;
        }
    }

    public void SetQuestionsPerSeries(long questionsPerSeries)
    {
        ValidateQuestionsPerSeries(questionsPerSeries);
        _questionsPerSeries = questionsPerSeries;
    }

    /// <summary>Changes cadence without changing the target of an active series.</summary>
    /// <param name="useFixedSchedule">Whether to use daily slots instead of the interval.</param>
    /// <param name="slots">Daily local times and question counts, retained in either mode.</param>
    public void SetSchedule(bool useFixedSchedule, IEnumerable<DailyReviewSlot> slots)
    {
        var validated = DailyReviewSchedule.Validate(slots, useFixedSchedule);
        if (_useFixedSchedule == useFixedSchedule && _dailySlots.SequenceEqual(validated))
        {
            return;
        }

        _useFixedSchedule = useFixedSchedule;
        _dailySlots = validated;
        if (!_isSeriesActive)
        {
            ScheduleNext();
        }
    }

    public void Suspend()
    {
        _isSuspended = true;
        ResetSeries();
    }

    public void Resume()
    {
        if (!_isSuspended)
        {
            return;
        }

        _isSuspended = false;
        if (_isEnabled && _hasStarted)
        {
            ScheduleNext();
        }
    }

    public void Close()
    {
        _isClosed = true;
        _isEnabled = false;
        ResetSeries();
    }

    private void ResetSeries()
    {
        _isSeriesActive = false;
        _seriesTarget = 0;
        _questionsPresentedInSeries = 0;
    }

    private void ScheduleNext()
    {
        var now = _timeProvider.GetUtcNow();
        if (_useFixedSchedule)
        {
            (_nextPresentationAt, _nextSlotQuestions) = DailyReviewSchedule.Next(
                _dailySlots, now, _timeProvider.LocalTimeZone);
        }
        else
        {
            _nextPresentationAt = now + _interval;
        }
    }

    private static void ValidateInterval(TimeSpan interval)
    {
        if (interval < TimeSpan.FromMinutes(MinimumIntervalMinutes)
            || interval > TimeSpan.FromMinutes(MaximumIntervalMinutes))
        {
            throw new ArgumentOutOfRangeException(
                nameof(interval),
                "L’intervalle doit être d’au moins 1 minute.");
        }
    }

    private static void ValidateQuestionsPerSeries(long questionsPerSeries)
    {
        if (questionsPerSeries < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(questionsPerSeries),
                "Le nombre de questions par série doit être positif.");
        }
    }
}
