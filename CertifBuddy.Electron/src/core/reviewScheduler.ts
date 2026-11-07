// Port of CertifBuddy.Core/ReviewScheduler.cs.
import type { CardReviewState, ReviewOutcome } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const AGAIN_DELAY = 2 * MINUTE;
const HARD_DELAY = 8 * MINUTE;

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

export function getNextReviewDelayMs(currentLevel: number, outcome: ReviewOutcome): number {
  const nextLevel = calculateNextLevel(currentLevel, outcome);
  switch (outcome) {
    case 'again':
      return AGAIN_DELAY;
    case 'hard':
      return HARD_DELAY;
    case 'passed':
    case 'noResult':
      throw new RangeError(`Aucun délai pour le résultat « ${outcome} ».`);
    default:
      return intervalForLevel(nextLevel);
  }
}

/** Passing or closing without a result leaves the review state untouched. */
export function calculateNextState(
  state: CardReviewState,
  outcome: ReviewOutcome,
  finalizedAt: number,
): CardReviewState {
  if (outcome === 'passed' || outcome === 'noResult') {
    return state;
  }

  return {
    ...state,
    level: calculateNextLevel(state.level, outcome),
    dueAt: finalizedAt + getNextReviewDelayMs(state.level, outcome),
    lastReviewedAt: finalizedAt,
  };
}

export interface SelectNextCardOptions {
  readonly lastCardId?: string | null;
  readonly excludedCardIds?: ReadonlySet<string>;
  /** Package of every supplied card; enables package rotation. */
  readonly packageIdsByCardId?: ReadonlyMap<string, string>;
}

/** Selects the lowest-level card, rotating packages without filtering by review deadline. */
export function selectNextCard(
  states: Iterable<CardReviewState>,
  options: SelectNextCardOptions = {},
): CardReviewState | null {
  const { lastCardId = null, excludedCardIds, packageIdsByCardId } = options;
  const eligible = [...states]
    .filter((state) => !excludedCardIds?.has(state.cardId))
    .sort((a, b) => a.level - b.level || a.dueAt - b.dueAt || compareOrdinal(a.cardId, b.cardId));
  const first = eligible[0];
  if (!first) {
    return null;
  }

  let lowestLevel = eligible.filter((state) => state.level === first.level);
  if (packageIdsByCardId) {
    const lastPackageId = lastCardId ? packageIdsByCardId.get(lastCardId) ?? null : null;
    const groups = new Map<string, CardReviewState[]>();
    for (const state of lowestLevel) {
      const packageId = packageIdsByCardId.get(state.cardId);
      if (packageId === undefined) {
        throw new Error(`Paquet inconnu pour la carte ${state.cardId}.`);
      }

      const group = groups.get(packageId) ?? [];
      group.push(state);
      groups.set(packageId, group);
    }

    const packageIds = [...groups.keys()].sort(compareOrdinal);
    const nextPackageId = packageIds.find((id) => lastPackageId === null || compareOrdinal(id, lastPackageId) > 0)
      ?? packageIds[0]!;
    lowestLevel = groups.get(nextPackageId)!;
  }

  return lowestLevel.find((state) => state.cardId !== lastCardId) ?? lowestLevel[0]!;
}

function intervalForLevel(level: number): number {
  if (level >= 5) return 168 * HOUR;
  switch (level) {
    case 1: return HOUR;
    case 2: return 4 * HOUR;
    case 3: return 24 * HOUR;
    case 4: return 72 * HOUR;
    default: throw new RangeError(`Niveau sans intervalle : ${level}`);
  }
}

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
