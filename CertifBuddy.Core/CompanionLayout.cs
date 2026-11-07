namespace CertifBuddy.Core;

/// <summary>A point expressed in device-independent screen units.</summary>
public readonly record struct ScreenPoint(double X, double Y);

/// <summary>A size expressed in device-independent screen units.</summary>
public readonly record struct ScreenSize(double Width, double Height);

/// <summary>A rectangle expressed in device-independent screen units.</summary>
public readonly record struct ScreenRect(double Left, double Top, double Width, double Height)
{
    public double Right => Left + Width;

    public double Bottom => Top + Height;

    public ScreenPoint TopLeft => new(Left, Top);
}

/// <summary>A companion position normalized between 0 and 1 inside a monitor work area.</summary>
public readonly record struct NormalizedPosition(double X, double Y);

/// <summary>The side of the companion where the question bubble is displayed.</summary>
public enum BubbleSide
{
    Right,
    Left
}

/// <summary>The computed position of the question bubble.</summary>
public readonly record struct BubblePlacement(BubbleSide Side, ScreenRect Bounds);

/// <summary>Keeps the floating companion and its bubble inside the monitor work area.</summary>
public static class CompanionLayout
{
    /// <summary>Returns the closest top-left position keeping an element entirely inside the work area.</summary>
    public static ScreenPoint ClampToWorkArea(ScreenRect workArea, ScreenSize size, ScreenPoint topLeft)
    {
        EnsureFinite(topLeft.X, topLeft.Y, nameof(topLeft));
        return new ScreenPoint(
            Math.Clamp(topLeft.X, workArea.Left, Math.Max(workArea.Left, workArea.Right - size.Width)),
            Math.Clamp(topLeft.Y, workArea.Top, Math.Max(workArea.Top, workArea.Bottom - size.Height)));
    }

    /// <summary>Converts a top-left position into coordinates between 0 and 1 of the free work area.</summary>
    public static NormalizedPosition Normalize(ScreenRect workArea, ScreenSize size, ScreenPoint topLeft)
    {
        var clamped = ClampToWorkArea(workArea, size, topLeft);
        return new NormalizedPosition(
            NormalizeAxis(clamped.X - workArea.Left, workArea.Width - size.Width),
            NormalizeAxis(clamped.Y - workArea.Top, workArea.Height - size.Height));
    }

    /// <summary>Converts normalized coordinates back into a top-left position inside the work area.</summary>
    public static ScreenPoint Denormalize(ScreenRect workArea, ScreenSize size, NormalizedPosition position)
    {
        EnsureFinite(position.X, position.Y, nameof(position));
        return new ScreenPoint(
            workArea.Left + Math.Clamp(position.X, 0, 1) * Math.Max(0, workArea.Width - size.Width),
            workArea.Top + Math.Clamp(position.Y, 0, 1) * Math.Max(0, workArea.Height - size.Height));
    }

    /// <summary>
    /// Places the bubble beside the companion, on the right when it fits, otherwise on the side with
    /// the most space, and always entirely inside the work area.
    /// </summary>
    public static BubblePlacement PlaceBubble(
        ScreenRect workArea,
        ScreenRect companion,
        ScreenSize bubble,
        double gap)
    {
        var spaceRight = workArea.Right - companion.Right - gap;
        var spaceLeft = companion.Left - workArea.Left - gap;
        var side = bubble.Width <= spaceRight
            ? BubbleSide.Right
            : bubble.Width <= spaceLeft
                ? BubbleSide.Left
                : spaceRight >= spaceLeft ? BubbleSide.Right : BubbleSide.Left;

        var desired = new ScreenPoint(
            side == BubbleSide.Right ? companion.Right + gap : companion.Left - gap - bubble.Width,
            companion.Top + (companion.Height - bubble.Height) / 2);
        var topLeft = ClampToWorkArea(workArea, bubble, desired);
        return new BubblePlacement(side, new ScreenRect(topLeft.X, topLeft.Y, bubble.Width, bubble.Height));
    }

    /// <summary>
    /// Places a notification in the bottom-right corner of the work area, next to the notification
    /// area of the taskbar, where Windows displays its own notifications.
    /// </summary>
    public static ScreenPoint PlaceNotification(ScreenRect workArea, ScreenSize notification, double margin)
    {
        var desired = new ScreenPoint(
            workArea.Right - margin - notification.Width,
            workArea.Bottom - margin - notification.Height);
        return ClampToWorkArea(workArea, notification, desired);
    }

    private static double NormalizeAxis(double offset, double freeSpace) =>
        freeSpace <= 0 ? 0 : Math.Clamp(offset / freeSpace, 0, 1);

    private static void EnsureFinite(double x, double y, string parameterName)
    {
        if (!double.IsFinite(x) || !double.IsFinite(y))
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                "Les coordonnées du compagnon doivent être des nombres finis.");
        }
    }
}
