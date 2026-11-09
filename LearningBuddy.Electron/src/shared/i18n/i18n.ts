// Text lookup and formatting for both languages of the interface.
import type { LocalizedMessage, MessageArgument } from '../../core/errors';
import type { Language } from '../../core/settings';
import { TEXTS, type TextKey } from './texts';

export type { TextKey };

export function text(language: Language, key: TextKey): string {
  const entry = TEXTS[key];
  return language === 'en' ? entry[1] : entry[0];
}

/** Replaces the {0}, {1}… placeholders; numbers are formatted with the conventions of the language. */
export function format(language: Language, key: TextKey, ...args: readonly MessageArgument[]): string {
  return fill(language, text(language, key), args);
}

export function fill(language: Language, template: string, args: readonly MessageArgument[]): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    if (value === undefined) {
      return match;
    }

    return typeof value === 'number' ? formatNumber(language, value) : value;
  });
}

export function translate(language: Language, message: LocalizedMessage): string {
  const detail = format(language, message.key, ...(message.args ?? []));
  if (message.path === undefined) {
    return detail;
  }

  // The French typography puts a space before the colon.
  return language === 'en' ? `${message.path}: ${detail}.` : `${message.path} : ${detail}.`;
}

/** Text without the underscore that marks the access key of a navigation label. */
export function withoutAccessKey(label: string): string {
  return label.replace('_', '');
}

/** Letter following the underscore of a navigation label, used with Alt. */
export function accessKey(label: string): string | null {
  const index = label.indexOf('_');
  return index >= 0 && index + 1 < label.length ? label[index + 1]!.toLowerCase() : null;
}

export function locale(language: Language): string {
  return language === 'en' ? 'en-US' : 'fr-FR';
}

export function formatNumber(language: Language, value: number, maximumFractionDigits = 0, minimumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits, minimumFractionDigits, useGrouping: true }).format(value);
}

/** Short date, for example 09/11/2026 or 11/9/2026. */
export function formatShortDate(language: Language, epochMs: number): string {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'short' }).format(epochMs);
}

/** Short date and time, equivalent to the .NET "g" format. */
export function formatDateTime(language: Language, epochMs: number): string {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'short', timeStyle: 'short' }).format(epochMs);
}

/** "d MMM", for example 9 nov. or Nov 9. */
export function formatDayMonth(language: Language, epochMs: number): string {
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short' }).format(epochMs);
}

/** Countdown in HH:MM:SS, seconds rounded up. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

/** "{n} carte" / "{n} cartes". */
export function cardCount(language: Language, count: number): string {
  return format(language, count === 1 ? 'PackageCardCount' : 'PackageCardCountPlural', count);
}

/** Suffix "s" of the French and English plurals used by the import summary. */
export function pluralSuffix(count: number): string {
  return count === 1 ? '' : 's';
}
