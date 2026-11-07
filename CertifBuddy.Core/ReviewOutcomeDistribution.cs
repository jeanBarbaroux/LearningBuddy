namespace CertifBuddy.Core;

public sealed record ReviewOutcomeDistribution(
    int Again,
    int Hard,
    int Good,
    int Easy)
{
    public long Total => (long)Again + Hard + Good + Easy;
}

public static class ReviewOutcomeDistributionAggregator
{
    public static ReviewOutcomeDistribution Aggregate(
        IEnumerable<ReviewTimelinePeriod> periods)
    {
        ArgumentNullException.ThrowIfNull(periods);

        var again = 0;
        var hard = 0;
        var good = 0;
        var easy = 0;

        foreach (var period in periods)
        {
            if (period is null)
            {
                throw new InvalidDataException(
                    "Une période de statistiques est absente.");
            }

            checked
            {
                again += period.Again;
                hard += period.Hard;
                good += period.Good;
                easy += period.Easy;
            }
        }

        return new ReviewOutcomeDistribution(again, hard, good, easy);
    }
}
