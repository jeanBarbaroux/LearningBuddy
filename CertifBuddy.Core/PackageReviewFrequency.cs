namespace CertifBuddy.Core;

/// <summary>Validates percentage distributions for the selected review packages.</summary>
public static class PackageReviewFrequency
{
    /// <summary>Checks that every selected package has at least one percent and the total is 100.</summary>
    /// <param name="packageIds">The selected package identifiers.</param>
    /// <param name="percentages">The complete distribution, or null to retain the default scheduler.</param>
    public static void Validate(
        IReadOnlyCollection<string> packageIds,
        IReadOnlyDictionary<string, int>? percentages)
    {
        ArgumentNullException.ThrowIfNull(packageIds);
        if (percentages is null)
        {
            return;
        }

        if (packageIds.Count is < 1 or > 100
            || packageIds.Any(string.IsNullOrWhiteSpace)
            || packageIds.Distinct(StringComparer.Ordinal).Count() != packageIds.Count
            || percentages.Count != packageIds.Count
            || packageIds.Any(id => !percentages.ContainsKey(id))
            || percentages.Values.Any(value => value is < 1 or > 100)
            || percentages.Values.Sum() != 100)
        {
            throw new ArgumentException(
                "Each selected package must have a percentage between 1 and 100, totaling 100.",
                nameof(percentages));
        }
    }

    /// <summary>Creates an even integer distribution, assigning rounding remainders in input order.</summary>
    /// <param name="packageIds">One to 100 distinct package identifiers.</param>
    /// <returns>Percentages totaling 100.</returns>
    public static IReadOnlyDictionary<string, int> CreateEqual(IReadOnlyCollection<string> packageIds)
    {
        ArgumentNullException.ThrowIfNull(packageIds);
        if (packageIds.Count is < 1 or > 100
            || packageIds.Any(string.IsNullOrWhiteSpace)
            || packageIds.Distinct(StringComparer.Ordinal).Count() != packageIds.Count)
        {
            throw new ArgumentException("Supply one to 100 distinct package identifiers.", nameof(packageIds));
        }

        return packageIds.Select((id, index) => (id, value: 100 / packageIds.Count
                + (index < 100 % packageIds.Count ? 1 : 0)))
            .ToDictionary(item => item.id, item => item.value, StringComparer.Ordinal);
    }
}
