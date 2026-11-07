namespace CertifBuddy.Core;

public sealed class CompanionPointerGesture
{
    private ScreenPoint _origin;
    private bool _isActive;
    private bool _isDragging;

    public void Begin(ScreenPoint position)
    {
        _origin = position;
        _isActive = true;
        _isDragging = false;
    }

    public bool TryStartDrag(
        ScreenPoint position,
        double horizontalThreshold,
        double verticalThreshold)
    {
        if (!double.IsFinite(horizontalThreshold) || horizontalThreshold < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(horizontalThreshold));
        }

        if (!double.IsFinite(verticalThreshold) || verticalThreshold < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(verticalThreshold));
        }

        if (!_isActive
            || _isDragging
            || (Math.Abs(position.X - _origin.X) < horizontalThreshold
                && Math.Abs(position.Y - _origin.Y) < verticalThreshold))
        {
            return false;
        }

        _isDragging = true;
        return true;
    }

    public bool Complete()
    {
        if (!_isActive)
        {
            return false;
        }

        var wasClick = !_isDragging;
        _isActive = false;
        _isDragging = false;
        return wasClick;
    }
}
