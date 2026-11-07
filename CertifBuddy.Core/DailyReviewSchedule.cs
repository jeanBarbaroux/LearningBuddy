namespace CertifBuddy.Core;

/// <summary>A daily local-time review slot with its own series size.</summary>
/// <param name="Time">The local time, at minute precision.</param>
/// <param name="Questions">The positive maximum number of questions in the series.</param>
public sealed record DailyReviewSlot(TimeOnly Time, long Questions);

/// <summary>Validates and resolves daily review schedules in a local time zone.</summary>
public static class DailyReviewSchedule
{
    /// <summary>Copies, validates and sorts slots, rejecting duplicate times.</summary>
    /// <param name="slots">The configured slots.</param>
    /// <param name="enabled">Whether at least one slot is required.</param>
    /// <returns>A sorted, independent array of valid slots.</returns>
    public static DailyReviewSlot[] Validate(IEnumerable<DailyReviewSlot> slots, bool enabled)
    {
        ArgumentNullException.ThrowIfNull(slots);
        var result = slots.ToArray();
        if ((enabled && result.Length == 0)
            || result.Any(slot => slot is null || slot.Questions < 1
                || slot.Time.Ticks % TimeSpan.TicksPerMinute != 0)
            || result.Select(slot => slot.Time).Distinct().Count() != result.Length)
        {
            throw new ArgumentException("Les horaires doivent être uniques, à la minute, avec un nombre de questions positif.", nameof(slots));
        }

        return result.OrderBy(slot => slot.Time).ToArray();
    }

    /// <summary>Finds the first future slot, without replaying missed slots.</summary>
    /// <param name="slots">A nonempty validated schedule.</param>
    /// <param name="now">The exclusive lower bound.</param>
    /// <param name="timeZone">The local time zone used for the daily schedule.</param>
    /// <returns>The next instant and its configured series size.</returns>
    public static (DateTimeOffset At, long Questions) Next(
        IReadOnlyList<DailyReviewSlot> slots,
        DateTimeOffset now,
        TimeZoneInfo timeZone)
    {
        if (slots.Count == 0)
        {
            throw new ArgumentException("Un horaire au moins est requis.", nameof(slots));
        }

        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, timeZone).DateTime);
        for (var day = 0; ; day++)
        {
            foreach (var slot in slots)
            {
                var local = date.AddDays(day).ToDateTime(slot.Time, DateTimeKind.Unspecified);
                // Skip nonexistent spring-forward times; use only the first fall-back occurrence.
                if (timeZone.IsInvalidTime(local))
                {
                    continue;
                }

                var offset = timeZone.IsAmbiguousTime(local)
                    ? timeZone.GetAmbiguousTimeOffsets(local).Max()
                    : timeZone.GetUtcOffset(local);
                var candidate = new DateTimeOffset(local, offset);
                if (candidate > now)
                {
                    return (candidate, slot.Questions);
                }
            }
        }
    }
}
