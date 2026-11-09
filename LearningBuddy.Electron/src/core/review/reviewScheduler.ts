// Spaced repetition rules (v1 ReviewScheduler): levels, delays and choice of the next card.
import type { CardReviewState, ReviewOutcome } from '../model';
import type { PackagePercentages } from '../packages/packageFrequency';
import { compareOrdinal } from '../text';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function calculateNextLevel(currentLevel: number, outcome: ReviewOutcome): number {
  if (!Number.isInteger(currentLevel) || currentLevel < 0) {
    throw new RangeError(`Niveau de révision invalide : ${currentLevel}`);
  }

  switch (outcome) {
    case 'again':
      return 0;
    case 'good':
      return currentLevel + 1;
    case 'easy':
      return currentLevel + 2;
    case 'hard':
    case 'passed':
    case 'noResult':
      return currentLevel;
  }
}

/** Delay before the card is due again; "À revoir" and "Difficile" use short fixed delays. */
export function nextReviewDelayMs(currentLevel: number, outcome: ReviewOutcome): number | null {
  switch (outcome) {
    case 'again':
      return 2 * MINUTE;
    case 'hard':
      return 8 * MINUTE;
    case 'good':
    case 'easy':
      return intervalForLevel(calculateNextLevel(currentLevel, outcome));
    case 'passed':
    case 'noResult':
      return null;
  }
}

/** Passing a card or closing without result leaves its state untouched. */
export function calculateNextState(state: CardReviewState, outcome: ReviewOutcome, answeredAt: number): CardReviewState {
  const delay = nextReviewDelayMs(state.level, outcome);
  if (delay === null) {
    return state;
  }

  return {
    ...state,
    level: calculateNextLevel(state.level, outcome),
    dueAt: answeredAt + delay,
    lastReviewedAt: answeredAt,
  };
}

export function intervalForLevel(level: number): number {
  if (level >= 5) return 168 * HOUR;
  switch (level) {
    case 1: return HOUR;
    case 2: return 4 * HOUR;
    case 3: return 24 * HOUR;
    case 4: return 72 * HOUR;
    default: throw new RangeError(`Niveau sans intervalle : ${level}`);
  }
}

export interface CardSelectionContext {
  /** Package of every candidate card. */
  readonly packageIdsByCardId: ReadonlyMap<string, string>;
  /** Last presented card, avoided when another card is available. */
  readonly lastCardId: string | null;
  /** Cards already presented in the current series. */
  readonly excludedCardIds: ReadonlySet<string>;
  /** Draw percentages of the selected packages; null rotates packages instead. */
  readonly percentages: PackagePercentages | null;
  /** Uniform random sample in [0, 1), used by the percentage draw. */
  readonly random: () => number;
}

/**
 * Chooses the next card. Due dates never block a card: the lowest level comes first. Without percentages
 * the packages are rotated; with percentages a package is drawn first, then its lowest-level card.
 */
export function selectNextCard(
  states: readonly CardReviewState[],
  context: CardSelectionContext,
): CardReviewState | null {
  const eligible = states.filter((state) => !context.excludedCardIds.has(state.cardId));
  if (eligible.length === 0) {
    return null;
  }

  if (context.percentages) {
    return selectByPackageFrequency(eligible, context);
  }

  const lowestLevel = sortByPriority(eligible).filter((state, _index, sorted) => state.level === sorted[0]!.level);
  const groups = groupByPackage(lowestLevel, context.packageIdsByCardId);
  const lastPackageId = context.lastCardId ? context.packageIdsByCardId.get(context.lastCardId) ?? null : null;
  const nextGroup = groups.find(([packageId]) => lastPackageId === null || compareOrdinal(packageId, lastPackageId) > 0)
    ?? groups[0]!;
  return avoidLastCard(nextGroup[1], context.lastCardId);
}

function selectByPackageFrequency(eligible: readonly CardReviewState[], context: CardSelectionContext): CardReviewState {
  const percentages = context.percentages!;
  const groups = groupByPackage(eligible, context.packageIdsByCardId);
  const total = groups.reduce((sum, [packageId]) => sum + (percentages[packageId] ?? 0), 0);
  const threshold = context.random() * total;
  let cumulative = 0;
  for (const [packageId, states] of groups) {
    cumulative += percentages[packageId] ?? 0;
    if (threshold < cumulative) {
      return lowestLevelCard(states, context.lastCardId);
    }
  }

  // Only reachable when no group has a percentage, for example right after a selection change.
  return lowestLevelCard(groups[0]![1], context.lastCardId);
}

function lowestLevelCard(states: readonly CardReviewState[], lastCardId: string | null): CardReviewState {
  const sorted = sortByPriority(states);
  return avoidLastCard(sorted.filter((state) => state.level === sorted[0]!.level), lastCardId);
}

function sortByPriority(states: readonly CardReviewState[]): CardReviewState[] {
  return [...states].sort((a, b) => a.level - b.level || a.dueAt - b.dueAt || compareOrdinal(a.cardId, b.cardId));
}

function groupByPackage(
  states: readonly CardReviewState[],
  packageIdsByCardId: ReadonlyMap<string, string>,
): [string, CardReviewState[]][] {
  const groups = new Map<string, CardReviewState[]>();
  for (const state of states) {
    const packageId = packageIdsByCardId.get(state.cardId);
    if (packageId === undefined) {
      throw new Error(`Paquet inconnu pour la carte ${state.cardId}.`);
    }

    const group = groups.get(packageId);
    if (group) {
      group.push(state);
    } else {
      groups.set(packageId, [state]);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => compareOrdinal(a, b));
}

function avoidLastCard(states: readonly CardReviewState[], lastCardId: string | null): CardReviewState {
  return states.find((state) => state.cardId !== lastCardId) ?? states[0]!;
}
