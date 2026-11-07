using System.Text.Json;
using System.Text.Json.Serialization;

namespace CertifBuddy.Core;

/// <summary>Reports a missing or invalid avatar resource with an explicit diagnostic.</summary>
public sealed class AvatarAssetException : Exception
{
    public AvatarAssetException(string message)
        : base(message)
    {
    }

    public AvatarAssetException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>Manifest of an exported avatar preset (contract v1.0.0), independent of the authoring tool.</summary>
public sealed record AvatarManifest(
    string ContractVersion,
    string PresetId,
    int LogicalWidth,
    int LogicalHeight,
    AvatarManifestSource Source,
    IReadOnlyList<AvatarManifestAnimation> Animations)
{
    public const string FileName = "manifest.json";

    /// <summary>Returns the animation with the given identifier.</summary>
    /// <exception cref="AvatarAssetException">The animation is not part of the manifest.</exception>
    public AvatarManifestAnimation GetAnimation(string animationId) =>
        Animations.FirstOrDefault(animation => string.Equals(animation.Id, animationId, StringComparison.Ordinal))
        ?? throw new AvatarAssetException($"Animation « {animationId} » absente du preset « {PresetId} ».");
}

/// <summary>Provenance recorded by the authoring chain; never used to play the animation.</summary>
public sealed record AvatarManifestSource(string Tool, string ToolVersion, string Recipe);

public sealed record AvatarManifestAnimation(string Id, bool Loop, IReadOnlyList<AvatarManifestFrame> Frames);

/// <param name="Path">Path relative to the manifest folder, using « / ».</param>
/// <param name="RgbaSha256">SHA-256 of the decoded, non-premultiplied RGBA bytes.</param>
public sealed record AvatarManifestFrame(string Path, int DurationMs, string RgbaSha256);

/// <summary>Parses and validates avatar manifests before any frame is displayed.</summary>
public static class AvatarManifestReader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
    };

    /// <summary>Parses a manifest and checks the contract and the presence of every storyboard animation.</summary>
    /// <param name="json">Manifest content.</param>
    /// <param name="expectedPresetId">Preset identifier expected for the folder being loaded.</param>
    /// <exception cref="AvatarAssetException">The manifest is malformed or breaks the contract.</exception>
    public static AvatarManifest Parse(string json, string expectedPresetId)
    {
        ArgumentNullException.ThrowIfNull(json);
        AvatarManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<AvatarManifest>(json, JsonOptions);
        }
        catch (JsonException exception)
        {
            throw new AvatarAssetException($"Manifeste JSON invalide : {exception.Message}", exception);
        }

        if (manifest is null)
        {
            throw new AvatarAssetException("Manifeste vide.");
        }

        var problems = Validate(manifest, expectedPresetId);
        if (problems.Count > 0)
        {
            throw new AvatarAssetException(
                $"Manifeste du preset « {expectedPresetId} » invalide : {string.Join(" ; ", problems)}");
        }

        return manifest;
    }

    /// <summary>Lists every contract violation of a deserialized manifest.</summary>
    public static IReadOnlyList<string> Validate(AvatarManifest manifest, string expectedPresetId)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        var problems = new List<string>();
        if (manifest.ContractVersion != AvatarStoryboard.ContractVersion)
        {
            problems.Add($"version de contrat non prise en charge ({manifest.ContractVersion})");
        }

        if (!AvatarStoryboard.IsStableIdentifier(manifest.PresetId)
            || !string.Equals(manifest.PresetId, expectedPresetId, StringComparison.Ordinal))
        {
            problems.Add($"identifiant de preset « {manifest.PresetId} » au lieu de « {expectedPresetId} »");
        }

        if (manifest.LogicalWidth != AvatarStoryboard.LogicalSize || manifest.LogicalHeight != AvatarStoryboard.LogicalSize)
        {
            problems.Add($"dimensions {manifest.LogicalWidth}x{manifest.LogicalHeight} au lieu de 32x32");
        }

        if (string.IsNullOrWhiteSpace(manifest.Source.Tool)
            || string.IsNullOrWhiteSpace(manifest.Source.ToolVersion)
            || string.IsNullOrWhiteSpace(manifest.Source.Recipe))
        {
            problems.Add("provenance incomplète");
        }

        var animationIds = new HashSet<string>(StringComparer.Ordinal);
        var framePaths = new HashSet<string>(StringComparer.Ordinal);
        // Nullable annotations are not enforced on collection elements by System.Text.Json.
        if (manifest.Animations.Any(animation => animation is null || animation.Frames.Any(frame => frame is null)))
        {
            problems.Add("animation ou frame nulle");
            return problems;
        }

        foreach (var animation in manifest.Animations)
        {
            if (!AvatarStoryboard.IsStableIdentifier(animation.Id) || !animationIds.Add(animation.Id))
            {
                problems.Add($"identifiant d’animation invalide ou dupliqué « {animation.Id} »");
            }

            if (animation.Frames.Count == 0)
            {
                problems.Add($"{animation.Id} : aucune frame");
            }

            foreach (var frame in animation.Frames)
            {
                if (!IsValidFramePath(frame.Path, animation.Id) || !framePaths.Add(frame.Path))
                {
                    problems.Add($"{animation.Id} : chemin de frame invalide ou dupliqué « {frame.Path} »");
                }

                if (frame.DurationMs <= 0)
                {
                    problems.Add($"{frame.Path} : durée non positive ({frame.DurationMs} ms)");
                }

                if (!IsValidSha256(frame.RgbaSha256))
                {
                    problems.Add($"{frame.Path} : empreinte SHA-256 invalide");
                }
            }
        }

        problems.AddRange(AvatarStoryboard.Animations
            .Where(spec => !animationIds.Contains(spec.Id))
            .Select(spec => $"animation requise absente « {spec.Id} »"));
        return problems;
    }

    private static bool IsValidFramePath(string path, string animationId)
    {
        var prefix = animationId + "/";
        if (!path.StartsWith(prefix, StringComparison.Ordinal) || !path.EndsWith(".png", StringComparison.Ordinal))
        {
            return false;
        }

        var number = path.AsSpan(prefix.Length, path.Length - prefix.Length - ".png".Length);
        return number.Length >= 2 && !number.ContainsAnyExceptInRange('0', '9');
    }

    private static bool IsValidSha256(string value) =>
        value.Length == 64 && !value.AsSpan().ContainsAnyExcept("0123456789abcdef");
}
