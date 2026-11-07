namespace CertifBuddy.Core;

/// <summary>
/// Interface colour-scheme preference. <see cref="System"/> follows the Windows "app mode" setting.
/// </summary>
public static class ThemePreference
{
    public const string System = "system";
    public const string Light = "light";
    public const string Dark = "dark";

    public static IReadOnlyList<string> Values { get; } = [System, Light, Dark];

    public static bool IsValid(string? preference) =>
        preference is System or Light or Dark;

    public static bool UsesDarkScheme(string preference, bool systemUsesDarkTheme) =>
        preference switch
        {
            System => systemUsesDarkTheme,
            Light => false,
            Dark => true,
            _ => throw new ArgumentOutOfRangeException(nameof(preference), preference, null)
        };
}
