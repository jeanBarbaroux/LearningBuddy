namespace CertifBuddy.Core;

/// <summary>Frame to display at a given time of an animation.</summary>
/// <param name="FrameIndex">Index of the frame in playback order.</param>
/// <param name="IsCompleted">Whether a non-looping animation has reached its end.</param>
/// <param name="UntilNextFrame">Remaining time before the next frame, or <see langword="null"/> once completed.</param>
public readonly record struct AvatarFramePosition(int FrameIndex, bool IsCompleted, TimeSpan? UntilNextFrame);

/// <summary>
/// Maps elapsed time to frames. Positions are computed from the time since the start of the sequence rather
/// than by accumulating timer intervals, so timer latency never shifts the following frames.
/// </summary>
public sealed class AvatarAnimationTimeline
{
    private readonly long[] _frameEndsTicks;

    public AvatarAnimationTimeline(IReadOnlyList<int> frameDurationsMs, bool loop)
    {
        ArgumentNullException.ThrowIfNull(frameDurationsMs);
        if (frameDurationsMs.Count == 0)
        {
            throw new ArgumentException("Une animation contient au moins une frame.", nameof(frameDurationsMs));
        }

        _frameEndsTicks = new long[frameDurationsMs.Count];
        var end = 0L;
        for (var index = 0; index < frameDurationsMs.Count; index++)
        {
            ArgumentOutOfRangeException.ThrowIfNegativeOrZero(frameDurationsMs[index], nameof(frameDurationsMs));
            end += TimeSpan.FromMilliseconds(frameDurationsMs[index]).Ticks;
            _frameEndsTicks[index] = end;
        }

        Loop = loop;
    }

    public bool Loop { get; }

    public int FrameCount => _frameEndsTicks.Length;

    public TimeSpan Duration => TimeSpan.FromTicks(_frameEndsTicks[^1]);

    public AvatarFramePosition GetPosition(TimeSpan elapsed)
    {
        var ticks = Math.Max(0, elapsed.Ticks);
        if (Loop)
        {
            ticks %= _frameEndsTicks[^1];
        }
        else if (ticks >= _frameEndsTicks[^1])
        {
            return new AvatarFramePosition(FrameCount - 1, IsCompleted: true, UntilNextFrame: null);
        }

        var index = Array.FindIndex(_frameEndsTicks, end => ticks < end);
        return new AvatarFramePosition(index, IsCompleted: false, TimeSpan.FromTicks(_frameEndsTicks[index] - ticks));
    }
}
