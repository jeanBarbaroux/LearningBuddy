// Text helpers shared by the validation rules.

/** Number of Unicode code points, the unit used by every length limit of the v1. */
export function countCharacters(value: string): number {
  let count = 0;
  for (const _character of value) {
    count += 1;
  }

  return count;
}

export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/** Trimmed value, or null when blank. */
export function trimToNull(value: string | null | undefined): string | null {
  return isBlank(value) ? null : value!.trim();
}

export function hasLengthBetween(value: string, min: number, max: number): boolean {
  const length = countCharacters(value);
  return length >= min && length <= max;
}

/** Case-insensitive comparison used for tags, choices and searches. */
export function foldCase(value: string): string {
  return value.toLocaleLowerCase();
}

export function containsIgnoringCase(value: string | null | undefined, search: string): boolean {
  return value !== null && value !== undefined && foldCase(value).includes(foldCase(search));
}

export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Part of a text: plain text, or a link that can be opened in the browser. */
export type TextSegment = { readonly text: string; readonly url?: string };

const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
const TRAILING_PUNCTUATION = '.,;:!?';
const BRACKETS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/**
 * Splits a text into plain parts and http(s) links (v1 LinkifiedTextBlock): trailing punctuation and
 * unbalanced closing brackets are not part of the link, and "www." links get an https:// prefix.
 */
export function linkify(value: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(LINK_PATTERN)) {
    const start = match.index;
    const link = trimLink(match[0]);
    if (start > cursor) {
      segments.push({ text: value.slice(cursor, start) });
    }

    const url = /^www\./i.test(link) ? `https://${link}` : link;
    segments.push(isWebUrl(url) ? { text: link, url } : { text: link });
    cursor = start + link.length;
  }

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor) });
  }

  return segments;
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function trimLink(link: string): string {
  let result = link;
  for (;;) {
    const last = result.at(-1);
    if (last === undefined) {
      return result;
    }

    if (TRAILING_PUNCTUATION.includes(last)) {
      result = result.slice(0, -1);
      continue;
    }

    const opening = BRACKETS[last];
    if (opening && count(result, last) > count(result, opening)) {
      result = result.slice(0, -1);
      continue;
    }

    return result;
  }
}

function count(value: string, character: string): number {
  return value.split(character).length - 1;
}
