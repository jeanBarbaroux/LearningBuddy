namespace CertifBuddy.Core;

/// <summary>Timing contract of one animation approved in the BETA-US-020 storyboard.</summary>
/// <param name="Id">Stable animation identifier.</param>
/// <param name="Loop">Whether the sequence restarts after its last frame.</param>
/// <param name="FrameDurationsMs">Duration of each frame, in playback order.</param>
public sealed record AvatarAnimationSpec(string Id, bool Loop, IReadOnlyList<int> FrameDurationsMs);

/// <summary>
/// Storyboard and asset contract v1.0.0 approved on 2026-10-21 (BETA-US-020): approved presets, eight animation
/// identifiers covering the seven families, 32 × 32 logical pixels displayed at 4 DIP per pixel.
/// </summary>
public static class AvatarStoryboard
{
    public const string ContractVersion = "1.0.0";
    public const int LogicalSize = 32;
    public const int DisplayScale = 4;
    public const int DisplaySize = LogicalSize * DisplayScale;

    public const string Idle = "idle";
    public const string Move = "move";
    public const string Appear = "appear";
    public const string Disappear = "disappear";
    public const string Request = "request";
    public const string Think = "think";
    public const string Celebrate = "celebrate";
    public const string Sleep = "sleep";

    public const string OwlPresetId = "preset-owl";
    public const string FoxPresetId = "preset-fox";
    public const string AxolotlPresetId = "preset-axolotl";
    public const string SunPresetId = "preset-sun";
    public const string CatPresetId = "preset-cat";
    public const string DogPresetId = "preset-dog";
    public const string PandaPresetId = "preset-panda";
    public const string GibbonPresetId = "preset-gibbon";

    /// <summary>Gets the approved presets in catalogue order (sun, cat, dog, panda and gibbon were added on 2026-10-28).</summary>
    public static IReadOnlyList<string> PresetIds { get; } =
        [OwlPresetId, FoxPresetId, AxolotlPresetId, SunPresetId, CatPresetId, DogPresetId, PandaPresetId, GibbonPresetId];

    /// <summary>Gets the eight approved animations in export order.</summary>
    public static IReadOnlyList<AvatarAnimationSpec> Animations { get; } =
    [
        new(Idle, Loop: true, [400, 200, 400, 150]),
        new(Move, Loop: true, [100, 100, 100, 100]),
        new(Appear, Loop: false, [60, 60, 80, 120]),
        new(Disappear, Loop: false, [120, 80, 60, 40]),
        new(Request, Loop: false, [100, 100, 180, 300]),
        new(Think, Loop: false, [150, 250, 150, 350]),
        new(Celebrate, Loop: false, [80, 100, 100, 160, 280]),
        new(Sleep, Loop: true, [500, 500, 800, 1200]),
    ];

    /// <summary>Returns the approved specification of an animation, or <see langword="null"/> if it is unknown.</summary>
    public static AvatarAnimationSpec? Find(string? animationId) =>
        Animations.FirstOrDefault(animation => string.Equals(animation.Id, animationId, StringComparison.Ordinal));

    /// <summary>Returns the animation shown for a character expression of the alpha state machine.</summary>
    public static string AnimationFor(CompanionCharacterState state) => state switch
    {
        CompanionCharacterState.Idle => Idle,
        CompanionCharacterState.Question => Request,
        CompanionCharacterState.NeedsReview or CompanionCharacterState.Difficult => Think,
        CompanionCharacterState.Correct or CompanionCharacterState.Easy => Celebrate,
        _ => throw new ArgumentOutOfRangeException(nameof(state), state, "État du personnage non pris en charge."),
    };

    /// <summary>Checks the ASCII kebab-case format used for preset and animation identifiers.</summary>
    public static bool IsStableIdentifier(string? value)
    {
        if (string.IsNullOrEmpty(value) || value[0] is < 'a' or > 'z' || value[^1] == '-')
        {
            return false;
        }

        for (var index = 1; index < value.Length; index++)
        {
            var character = value[index];
            var isAllowed = character is >= 'a' and <= 'z' or >= '0' and <= '9'
                || (character == '-' && value[index - 1] != '-');
            if (!isAllowed)
            {
                return false;
            }
        }

        return true;
    }
}
