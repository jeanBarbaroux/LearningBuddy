// Validation of the values received from the renderers: nothing coming through IPC is trusted.
import type { CardChoice, CardContent, ReviewOutcome } from '../../core/model';
import { REVIEW_OUTCOMES } from '../../core/model';
import { LANGUAGES, SettingsLimits, THEME_PREFERENCES, type Language, type ThemePreference } from '../../core/settings';
import type { DailyReviewSlot } from '../../core/review/dailySchedule';
import type { PreferencesPatch, RhythmSettings, StatisticsQuery } from '../../shared/ipc';

export class InvalidArgumentError extends Error {
  constructor(what: string) {
    super(`Argument IPC invalide : ${what}`);
    this.name = 'InvalidArgumentError';
  }
}

type UnknownObject = Record<string, unknown>;

export function expectObject(value: unknown, what = 'objet'): UnknownObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidArgumentError(what);
  }

  return value as UnknownObject;
}

export function expectString(value: unknown, what = 'texte', maxLength = 10_000_000): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new InvalidArgumentError(what);
  }

  return value;
}

export function expectNullableString(value: unknown, what: string): string | null {
  return value === null ? null : expectString(value, what);
}

export function expectBoolean(value: unknown, what = 'booléen'): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidArgumentError(what);
  }

  return value;
}

export function expectNumber(value: unknown, what = 'nombre'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidArgumentError(what);
  }

  return value;
}

/** Integers are not range-checked here: the domain rules return a translated message instead. */
export function expectInteger(value: unknown, what = 'entier'): number {
  const number = expectNumber(value, what);
  if (!Number.isSafeInteger(number)) {
    throw new InvalidArgumentError(what);
  }

  return number;
}

export function expectOutcome(value: unknown): ReviewOutcome {
  if (!REVIEW_OUTCOMES.includes(value as ReviewOutcome)) {
    throw new InvalidArgumentError('résultat de révision');
  }

  return value as ReviewOutcome;
}

export function expectCardContent(value: unknown): CardContent {
  const card = expectObject(value, 'carte');
  if (card.type !== 'card' && card.type !== 'qcm') {
    throw new InvalidArgumentError('type de carte');
  }

  const tags = card.tags;
  const choices = card.choices;
  if (!Array.isArray(tags) || !Array.isArray(choices)) {
    throw new InvalidArgumentError('carte');
  }

  return {
    type: card.type,
    question: expectString(card.question, 'question'),
    answer: expectString(card.answer, 'réponse'),
    explanation: expectNullableString(card.explanation, 'explication'),
    language: expectNullableString(card.language, 'langue'),
    tags: tags.map((tag) => expectString(tag, 'tag')),
    choices: choices.map((choice): CardChoice => {
      const object = expectObject(choice, 'choix');
      return { text: expectString(object.text, 'choix'), correct: expectBoolean(object.correct, 'choix') };
    }),
    image: expectNullableString(card.image, 'image'),
    answerImage: expectNullableString(card.answerImage, 'image'),
  };
}

export function expectCardContents(value: unknown): CardContent[] {
  if (!Array.isArray(value)) {
    throw new InvalidArgumentError('cartes');
  }

  return value.map(expectCardContent);
}

export function expectNullableInteger(value: unknown, what: string): number | null {
  return value === null ? null : expectInteger(value, what);
}

export function expectPercentages(value: unknown): Record<string, number> {
  const object = expectObject(value, 'fréquences');
  return Object.fromEntries(Object.entries(object).map(([id, percentage]) => [id, expectInteger(percentage, 'fréquence')]));
}

export function expectPreferences(value: unknown): PreferencesPatch {
  const patch = expectObject(value, 'préférences');
  const result: { -readonly [K in keyof PreferencesPatch]: PreferencesPatch[K] } = {};
  if ('language' in patch) {
    if (!LANGUAGES.includes(patch.language as Language)) throw new InvalidArgumentError('langue');
    result.language = patch.language as Language;
  }

  if ('theme' in patch) {
    if (!THEME_PREFERENCES.includes(patch.theme as ThemePreference)) throw new InvalidArgumentError('thème');
    result.theme = patch.theme as ThemePreference;
  }

  for (const key of ['launchAtStartup', 'autoHideCompanionAfterSeries', 'pauseDuringTeamsMeetings'] as const) {
    if (key in patch) {
      result[key] = expectBoolean(patch[key], key);
    }
  }

  for (const key of ['avatarSizePercent', 'bubbleSizePercent'] as const) {
    if (key in patch) {
      const size = expectInteger(patch[key], key);
      result[key] = Math.min(Math.max(size, SettingsLimits.minSizePercent), SettingsLimits.maxSizePercent);
    }
  }

  return result;
}

export function expectRhythm(value: unknown): RhythmSettings {
  const rhythm = expectObject(value, 'rythme');
  if (!Array.isArray(rhythm.dailySlots)) {
    throw new InvalidArgumentError('horaires');
  }

  return {
    useFixedSchedule: expectBoolean(rhythm.useFixedSchedule, 'mode'),
    intervalMinutes: expectInteger(rhythm.intervalMinutes, 'pause'),
    questionsPerSeries: expectInteger(rhythm.questionsPerSeries, 'questions'),
    snoozeMinutes: expectInteger(rhythm.snoozeMinutes, 'rappel'),
    dailySlots: rhythm.dailySlots.map((slot): DailyReviewSlot => {
      const object = expectObject(slot, 'horaire');
      return { time: expectString(object.time, 'heure', 5), questions: expectInteger(object.questions, 'questions') };
    }),
  };
}

export function expectStatisticsQuery(value: unknown): StatisticsQuery {
  const query = expectObject(value, 'statistiques');
  const start = expectNumber(query.start, 'début');
  const end = expectNumber(query.end, 'fin');
  return { packageId: expectNullableString(query.packageId, 'paquet'), start: Math.min(start, end), end: Math.max(start, end) };
}
