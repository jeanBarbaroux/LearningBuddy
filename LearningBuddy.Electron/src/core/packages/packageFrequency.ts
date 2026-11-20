// Draw percentages of the packages selected for the reviews (v1 PackageReviewFrequency).

/** Percentage of each selected package, by package id; integers of 1 to 100 totalling 100. */
export type PackagePercentages = Readonly<Record<string, number>>;

export const MAX_PACKAGES_WITH_PERCENTAGES = 100;

function hasValidIds(ids: readonly string[]): boolean {
  return ids.length >= 1
    && ids.length <= MAX_PACKAGES_WITH_PERCENTAGES
    && ids.every((id) => id.trim() !== '')
    && new Set(ids).size === ids.length;
}

/** Even split; the rounding remainder goes to the first packages. */
export function createEqualDistribution(ids: readonly string[]): Record<string, number> {
  if (!hasValidIds(ids)) {
    throw new RangeError('Supply one to 100 distinct package identifiers.');
  }

  const base = Math.floor(100 / ids.length);
  const remainder = 100 % ids.length;
  return Object.fromEntries(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

/** Every selected package, and only them, has an integer percentage of 1 to 100, totalling 100. */
export function isValidDistribution(ids: readonly string[], percentages: PackagePercentages): boolean {
  if (!hasValidIds(ids) || Object.keys(percentages).length !== ids.length) {
    return false;
  }

  let total = 0;
  for (const id of ids) {
    const value = Object.hasOwn(percentages, id) ? percentages[id] : undefined;
    if (value === undefined || !Number.isInteger(value) || value < 1 || value > 100) {
      return false;
    }

    total += value;
  }

  return total === 100;
}

/** Highest percentage of one package when every other package keeps 1 %. */
export function maximumPercentage(packageCount: number): number {
  return Math.max(1, 101 - Math.max(1, packageCount));
}

/**
 * Sets the percentage of one package and keeps a total of 100: the first package compensates, or the
 * second one when the first is changed; the others absorb what it cannot, keeping at least 1 % each.
 */
export function changePercentage(
  ids: readonly string[],
  percentages: PackagePercentages,
  id: string,
  value: number,
): Record<string, number> {
  const start = isValidDistribution(ids, percentages) ? { ...percentages } : createEqualDistribution(ids);
  if (!ids.includes(id) || ids.length === 1) {
    return start;
  }

  const next: Record<string, number> = { ...start, [id]: Math.min(Math.max(Math.round(value), 1), maximumPercentage(ids.length)) };
  const partner = id === ids[0] ? ids[1]! : ids[0]!;
  const others = [partner, ...ids.filter((other) => other !== id && other !== partner)];
  let excess = ids.reduce((total, other) => total + next[other]!, 0) - 100;
  for (const other of others) {
    if (excess === 0) {
      break;
    }

    const adjusted = Math.max(1, next[other]! - excess);
    excess -= next[other]! - adjusted;
    next[other] = adjusted;
  }

  return next;
}
