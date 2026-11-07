import { REVIEW_OUTCOMES, type ReviewOutcome } from '../core/types';

export function expectString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new TypeError('Identifiant invalide.');
  }

  return value;
}

export function expectBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('Booléen attendu.');
  }

  return value;
}

export function expectInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Entier attendu entre ${min} et ${max}.`);
  }

  return value;
}

export function expectObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Objet attendu.');
  }

  return value as Record<string, unknown>;
}

export function expectOutcome(value: unknown): ReviewOutcome {
  if (!REVIEW_OUTCOMES.includes(value as ReviewOutcome)) {
    throw new TypeError('Résultat de révision invalide.');
  }

  return value as ReviewOutcome;
}
