// BCP 47 language tag validation (v1 PackageImportParser grammar).

const GRANDFATHERED = new Set([
  'en-gb-oed', 'i-ami', 'i-bnn', 'i-default', 'i-enochian', 'i-hak', 'i-klingon', 'i-lux', 'i-mingo',
  'i-navajo', 'i-pwn', 'i-tao', 'i-tay', 'i-tsu', 'sgn-be-fr', 'sgn-be-nl', 'sgn-ch-de', 'art-lojban',
  'cel-gaulish', 'no-bok', 'no-nyn', 'zh-guoyu', 'zh-hakka', 'zh-min', 'zh-min-nan', 'zh-xiang',
]);

const LETTERS = /^[a-z]+$/i;
const DIGITS = /^\d+$/;
const ALPHANUMERIC = /^[a-z0-9]+$/i;

export const MIN_LANGUAGE_TAG_LENGTH = 2;
export const MAX_LANGUAGE_TAG_LENGTH = 255;

export function isValidLanguageTag(tag: string): boolean {
  if (tag.length < MIN_LANGUAGE_TAG_LENGTH || tag.length > MAX_LANGUAGE_TAG_LENGTH) {
    return false;
  }

  if (GRANDFATHERED.has(tag.toLowerCase())) {
    return true;
  }

  const parts = tag.split('-');
  if (parts.some((part) => part.length === 0)) {
    return false;
  }

  let index = 0;
  const current = (): string | undefined => parts[index];

  if (current()?.toLowerCase() === 'x') {
    return isPrivateUse(parts, index);
  }

  // Language: 2–3 letters with up to three 3-letter extlangs, or 4 letters, or 5–8 letters.
  const language = current()!;
  if (!LETTERS.test(language) || language.length > 8) {
    return false;
  }

  index += 1;
  if (language.length <= 3) {
    for (let extlangs = 0; extlangs < 3 && isLetters(current(), 3, 3); extlangs += 1) {
      index += 1;
    }
  }

  if (isLetters(current(), 4, 4)) {
    index += 1;
  }

  if (isLetters(current(), 2, 2) || isDigits(current(), 3)) {
    index += 1;
  }

  while (isVariant(current())) {
    index += 1;
  }

  const singletons = new Set<string>();
  while (current() !== undefined && current()!.length === 1 && current()!.toLowerCase() !== 'x') {
    const singleton = current()!.toLowerCase();
    if (!ALPHANUMERIC.test(singleton) || singletons.has(singleton)) {
      return false;
    }

    singletons.add(singleton);
    index += 1;
    let subtags = 0;
    while (isAlphanumeric(current(), 2, 8)) {
      index += 1;
      subtags += 1;
    }

    if (subtags === 0) {
      return false;
    }
  }

  if (current()?.toLowerCase() === 'x') {
    return isPrivateUse(parts, index);
  }

  return index === parts.length;
}

function isPrivateUse(parts: readonly string[], index: number): boolean {
  const subtags = parts.slice(index + 1);
  return subtags.length > 0 && subtags.every((part) => isAlphanumeric(part, 1, 8));
}

function isVariant(part: string | undefined): boolean {
  return isAlphanumeric(part, 5, 8) || (part !== undefined && part.length === 4 && /^\d[a-z0-9]{3}$/i.test(part));
}

function isLetters(part: string | undefined, min: number, max: number): boolean {
  return part !== undefined && part.length >= min && part.length <= max && LETTERS.test(part);
}

function isDigits(part: string | undefined, length: number): boolean {
  return part !== undefined && part.length === length && DIGITS.test(part);
}

function isAlphanumeric(part: string | undefined, min: number, max: number): boolean {
  return part !== undefined && part.length >= min && part.length <= max && ALPHANUMERIC.test(part);
}
