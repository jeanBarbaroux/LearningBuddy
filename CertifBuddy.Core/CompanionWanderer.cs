namespace CertifBuddy.Core;

/// <summary>Computes the slow autonomous movement of the companion inside a work area.</summary>
public sealed class CompanionWanderer
{
    private static readonly TimeSpan MaximumStep = TimeSpan.FromSeconds(1);

    private readonly Random _random;
    private readonly double _speedPerSecond;
    private readonly TimeSpan _minimumRest;
    private readonly TimeSpan _maximumRest;
    private TimeSpan _remainingRest;

    public CompanionWanderer(
        Random random,
        double speedPerSecond = 24,
        TimeSpan? minimumRest = null,
        TimeSpan? maximumRest = null)
    {
        _random = random ?? throw new ArgumentNullException(nameof(random));
        if (!double.IsFinite(speedPerSecond) || speedPerSecond <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(speedPerSecond),
                "La vitesse du compagnon doit être strictement positive.");
        }

        _speedPerSecond = speedPerSecond;
        _minimumRest = minimumRest ?? TimeSpan.FromSeconds(2);
        _maximumRest = maximumRest ?? TimeSpan.FromSeconds(8);
        if (_minimumRest < TimeSpan.Zero || _maximumRest < _minimumRest)
        {
            throw new ArgumentOutOfRangeException(
                nameof(maximumRest),
                "La durée de repos maximale doit être supérieure ou égale à la durée minimale.");
        }
    }

    /// <summary>Gets the current destination, or <see langword="null"/> when none is chosen.</summary>
    public ScreenPoint? Target { get; private set; }

    /// <summary>Returns the next top-left position after <paramref name="elapsed"/> of activity.</summary>
    public ScreenPoint Advance(ScreenPoint current, ScreenRect workArea, ScreenSize size, TimeSpan elapsed)
    {
        var position = CompanionLayout.ClampToWorkArea(workArea, size, current);
        if (elapsed <= TimeSpan.Zero)
        {
            return position;
        }

        if (elapsed > MaximumStep)
        {
            elapsed = MaximumStep;
        }

        if (_remainingRest > TimeSpan.Zero)
        {
            _remainingRest -= elapsed;
            return position;
        }

        if (Target is not { } target || CompanionLayout.ClampToWorkArea(workArea, size, target) != target)
        {
            target = PickTarget(workArea, size);
            Target = target;
        }

        var deltaX = target.X - position.X;
        var deltaY = target.Y - position.Y;
        var distance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY);
        var step = _speedPerSecond * elapsed.TotalSeconds;
        if (distance <= step)
        {
            Target = null;
            _remainingRest = _minimumRest + (_maximumRest - _minimumRest) * _random.NextDouble();
            return target;
        }

        return new ScreenPoint(
            position.X + deltaX / distance * step,
            position.Y + deltaY / distance * step);
    }

    /// <summary>Forgets the current destination, for instance after the user moved the companion.</summary>
    public void Reset()
    {
        Target = null;
        _remainingRest = TimeSpan.Zero;
    }

    private ScreenPoint PickTarget(ScreenRect workArea, ScreenSize size) =>
        CompanionLayout.Denormalize(
            workArea,
            size,
            new NormalizedPosition(_random.NextDouble(), _random.NextDouble()));
}

/// <summary>Decides when the companion may move on its own.</summary>
public static class CompanionMotionPolicy
{
    /// <summary>
    /// The companion wanders only while the assistant is active (not paused, locked, suspended or closed),
    /// no question is displayed, the user has enabled walking and is not dragging it.
    /// </summary>
    public static bool CanWander(
        bool isAssistantActive,
        bool isQuestionDisplayed,
        bool isBeingDragged,
        bool isWanderingEnabled = true) =>
        isAssistantActive && isWanderingEnabled && !isQuestionDisplayed && !isBeingDragged;
}
