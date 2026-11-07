// Port of LearningBuddy.Core/CompanionLayout.cs and CompanionWanderer.cs.
import type { ScreenPoint, ScreenRect, ScreenSize } from './types';

export function clampToWorkArea(workArea: ScreenRect, size: ScreenSize, topLeft: ScreenPoint): ScreenPoint {
  if (!Number.isFinite(topLeft.x) || !Number.isFinite(topLeft.y)) {
    throw new RangeError('Les coordonnées du compagnon doivent être des nombres finis.');
  }

  return {
    x: clamp(topLeft.x, workArea.x, Math.max(workArea.x, workArea.x + workArea.width - size.width)),
    y: clamp(topLeft.y, workArea.y, Math.max(workArea.y, workArea.y + workArea.height - size.height)),
  };
}

export function denormalize(workArea: ScreenRect, size: ScreenSize, normalized: ScreenPoint): ScreenPoint {
  return {
    x: workArea.x + clamp(normalized.x, 0, 1) * Math.max(0, workArea.width - size.width),
    y: workArea.y + clamp(normalized.y, 0, 1) * Math.max(0, workArea.height - size.height),
  };
}

/** Bottom-right corner of the work area, where the companion first appears. */
export function defaultCompanionPosition(workArea: ScreenRect, size: ScreenSize, margin = 24): ScreenPoint {
  return clampToWorkArea(workArea, size, {
    x: workArea.x + workArea.width - size.width - margin,
    y: workArea.y + workArea.height - size.height - margin,
  });
}

/**
 * Places the bubble beside the companion, on the right when it fits, otherwise on the side with the
 * most space, and always entirely inside the work area.
 */
export function placeBubble(workArea: ScreenRect, companion: ScreenRect, bubble: ScreenSize, gap: number): ScreenRect {
  const companionRight = companion.x + companion.width;
  const spaceRight = workArea.x + workArea.width - companionRight - gap;
  const spaceLeft = companion.x - workArea.x - gap;
  const right = bubble.width <= spaceRight
    || (bubble.width > spaceLeft && spaceRight >= spaceLeft);
  const desired = {
    x: right ? companionRight + gap : companion.x - gap - bubble.width,
    y: companion.y + (companion.height - bubble.height) / 2,
  };
  return { ...clampToWorkArea(workArea, bubble, desired), width: bubble.width, height: bubble.height };
}

const MAX_STEP_MS = 1000;

/** Computes the slow autonomous movement of the companion inside a work area. */
export class CompanionWanderer {
  private remainingRestMs = 0;
  target: ScreenPoint | null = null;

  constructor(
    private readonly random: () => number = Math.random,
    private readonly speedPerSecond = 24,
    private readonly minimumRestMs = 2000,
    private readonly maximumRestMs = 8000,
  ) {
    if (!Number.isFinite(speedPerSecond) || speedPerSecond <= 0) {
      throw new RangeError('La vitesse du compagnon doit être strictement positive.');
    }

    if (minimumRestMs < 0 || maximumRestMs < minimumRestMs) {
      throw new RangeError('La durée de repos maximale doit être supérieure ou égale à la durée minimale.');
    }
  }

  /** Returns the next top-left position after `elapsedMs` of activity. */
  advance(current: ScreenPoint, workArea: ScreenRect, size: ScreenSize, elapsedMs: number): ScreenPoint {
    const position = clampToWorkArea(workArea, size, current);
    if (elapsedMs <= 0) {
      return position;
    }

    const elapsed = Math.min(elapsedMs, MAX_STEP_MS);
    if (this.remainingRestMs > 0) {
      this.remainingRestMs -= elapsed;
      return position;
    }

    let target = this.target;
    if (!target || !samePoint(clampToWorkArea(workArea, size, target), target)) {
      target = denormalize(workArea, size, { x: this.random(), y: this.random() });
      this.target = target;
    }

    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);
    const step = (this.speedPerSecond * elapsed) / 1000;
    if (distance <= step) {
      this.target = null;
      this.remainingRestMs = this.minimumRestMs + (this.maximumRestMs - this.minimumRestMs) * this.random();
      return target;
    }

    return { x: position.x + (dx / distance) * step, y: position.y + (dy / distance) * step };
  }

  /** Forgets the current destination, for instance after the user moved the companion. */
  reset(): void {
    this.target = null;
    this.remainingRestMs = 0;
  }
}

/**
 * The companion wanders only while the assistant is active, no question is displayed, the user enabled
 * walking and is not dragging it.
 */
export function canWander(
  isAssistantActive: boolean,
  isQuestionDisplayed: boolean,
  isBeingDragged: boolean,
  isWanderingEnabled: boolean,
): boolean {
  return isAssistantActive && isWanderingEnabled && !isQuestionDisplayed && !isBeingDragged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function samePoint(a: ScreenPoint, b: ScreenPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
