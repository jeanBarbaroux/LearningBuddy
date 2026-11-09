// User preferences, their defaults and their limits (v1: app_settings table).
import { LocalizedError } from './errors';
import { validateDailySlots, type DailyReviewSlot } from './review/dailySchedule';

export type Language = 'fr' | 'en';
export const LANGUAGES: readonly Language[] = ['fr', 'en'];

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Companion position, normalised (0–1) inside the work area of a display, as in v1. */
export interface CompanionPosition {
  readonly displayId: string;
  readonly x: number;
  readonly y: number;
}

export interface AppSettings {
  readonly language: Language;
  readonly theme: ThemePreference;
  readonly assistantEnabled: boolean;
  /** Pause after a series, in whole minutes. */
  readonly intervalMinutes: number;
  readonly questionsPerSeries: number;
  readonly useFixedSchedule: boolean;
  readonly dailySlots: readonly DailyReviewSlot[];
  /** Delay of the "Reporter" button of the review invitation. */
  readonly snoozeMinutes: number;
  /** Packages proposed by the assistant, in selection order. */
  readonly reviewPackageIds: readonly string[];
  /** Optional draw percentages of the selected packages (total 100); null means package rotation. */
  readonly packagePercentages: Readonly<Record<string, number>> | null;
  readonly launchAtStartup: boolean;
  readonly autoHideCompanionAfterSeries: boolean;
  readonly pauseDuringTeamsMeetings: boolean;
  readonly companionWanderingEnabled: boolean;
  readonly companionPosition: CompanionPosition | null;
  readonly avatarSizePercent: number;
  readonly bubbleSizePercent: number;
  /** The "still running in the notification area" notice is shown only once. */
  readonly backgroundNoticeShown: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'fr',
  theme: 'system',
  assistantEnabled: false,
  intervalMinutes: 10,
  questionsPerSeries: 1,
  useFixedSchedule: false,
  dailySlots: [],
  snoozeMinutes: 5,
  reviewPackageIds: [],
  packagePercentages: null,
  launchAtStartup: true,
  autoHideCompanionAfterSeries: false,
  pauseDuringTeamsMeetings: true,
  companionWanderingEnabled: false,
  companionPosition: null,
  avatarSizePercent: 100,
  bubbleSizePercent: 100,
  backgroundNoticeShown: false,
};

export const SettingsLimits = {
  minIntervalMinutes: 1,
  /** Technical limit only: the v1 stored the interval as a 32-bit number of seconds. */
  maxIntervalMinutes: Math.floor(2_147_483_647 / 60),
  minQuestionsPerSeries: 1,
  maxQuestionsPerSeries: Number.MAX_SAFE_INTEGER,
  minSnoozeMinutes: 1,
  maxSnoozeMinutes: 120,
  minSizePercent: 50,
  maxSizePercent: 200,
  maxReviewPackages: 100,
} as const;

/** Rejects any value outside its range so that invalid preferences are never stored. */
export function validateSettings(settings: AppSettings): AppSettings {
  const limits = SettingsLimits;
  check(LANGUAGES.includes(settings.language));
  check(THEME_PREFERENCES.includes(settings.theme));
  check(isIntegerIn(settings.intervalMinutes, limits.minIntervalMinutes, limits.maxIntervalMinutes));
  check(isIntegerIn(settings.questionsPerSeries, limits.minQuestionsPerSeries, limits.maxQuestionsPerSeries));
  check(isIntegerIn(settings.snoozeMinutes, limits.minSnoozeMinutes, limits.maxSnoozeMinutes));
  check(isIntegerIn(settings.avatarSizePercent, limits.minSizePercent, limits.maxSizePercent));
  check(isIntegerIn(settings.bubbleSizePercent, limits.minSizePercent, limits.maxSizePercent));
  check(new Set(settings.reviewPackageIds).size === settings.reviewPackageIds.length);
  check(settings.reviewPackageIds.length <= limits.maxReviewPackages);
  validateDailySlots(settings.dailySlots, settings.useFixedSchedule);
  return settings;
}

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function check(condition: boolean): void {
  if (!condition) {
    throw new LocalizedError('PreferencesFailure');
  }
}
