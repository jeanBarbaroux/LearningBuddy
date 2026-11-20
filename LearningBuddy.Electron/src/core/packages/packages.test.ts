import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LocalizedError, type LocalizedMessage } from '../errors';
import { acceptedCards, canConfirm, createDrafts, draftStatus, summarize } from './importReview';
import { changePercentage, createEqualDistribution, isValidDistribution, maximumPercentage } from './packageFrequency';
import { decodePackageFile, exportFileName, PACKAGE_TEMPLATE, parsePackage, serializePackage } from './packageFormat';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function packageJson(cards: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'learning-buddy', schemaVersion: 1, title: 'Paquet', cards, ...extra });
}

function failure(action: () => unknown): LocalizedMessage | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof LocalizedError) {
      return error.localized;
    }

    throw error;
  }

  return undefined;
}

describe('parsePackage', () => {
  it('reads classic cards and QCMs, deriving a missing QCM answer and deduplicating tags', () => {
    const content = parsePackage(`\uFEFF${packageJson([
      { question: 'Q1', answer: 'A1', tags: [' a ', 'A', 'b'], language: 'fr-FR' },
      { type: 'qcm', question: 'Q2', choices: [{ text: ' 1 ' }, { text: '2', correct: true }] },
    ], { title: '  Paquet  ' })}`);
    expect(content.title).toBe('Paquet');
    expect(content.cards[0]).toMatchObject({ type: 'card', tags: ['a', 'b'], language: 'fr-FR', explanation: null });
    expect(content.cards[1]).toMatchObject({ type: 'qcm', answer: '2', choices: [{ text: '1', correct: false }, { text: '2', correct: true }] });
  });

  it('keeps blank questions and answers for the import preview, but requires the fields', () => {
    expect(parsePackage(packageJson([{ question: ' ', answer: '' }])).cards[0]).toMatchObject({ question: ' ', answer: '' });
    expect(parsePackage(packageJson([{ image: PNG, answer: 'A' }])).cards[0]).toMatchObject({ question: '', image: PNG });
    expect(failure(() => parsePackage(packageJson([{ answer: 'A' }])))).toEqual({ key: 'ParserRequiredField', args: [], path: '$.cards[0].question' });
  });

  it.each([
    ['malformed JSON', '{\n  "format": }', { key: 'ParserMalformedJson', args: [2, 13] }],
    ['a trailing comma', '{"a":1,}', { key: 'ParserMalformedJson', args: [1, 8] }],
    ['a comment', '{"a":1 // c\n}', { key: 'ParserMalformedJson', args: [1, 8] }],
    ['an empty file', '', { key: 'ParserMalformedJson', args: [1, 1] }],
    ['a root array', '[]', { key: 'ParserRootObject', args: [], path: '$' }],
    ['another format', packageJson([{ question: 'Q', answer: 'A' }], { format: 'anki' }), { key: 'ParserExpectedFormat', args: [], path: '$.format' }],
    ['another version', packageJson([{ question: 'Q', answer: 'A' }], { schemaVersion: 2 }), { key: 'ParserVersionUnsupported', args: ['2'], path: '$.schemaVersion' }],
    ['no card', packageJson([]), { key: 'ParserCardCount', args: ['5000'], path: '$.cards' }],
    ['an unknown property', packageJson([{ question: 'Q', answer: 'A', level: 3 }]), { key: 'ParserUnknownProperty', args: [], path: '$.cards[0].level' }],
    ['a duplicated property', `{"format":"learning-buddy","schemaVersion":1,"title":"T","cards":[{"question":"Q","answer":"A","answer":"B"}]}`, { key: 'ParserDuplicateProperty', args: [], path: '$.cards[0].answer' }],
    ['an unknown type', packageJson([{ type: 'quiz', question: 'Q', answer: 'A' }]), { key: 'ParserCardType', args: [], path: '$.cards[0].type' }],
    ['choices on a classic card', packageJson([{ question: 'Q', answer: 'A', choices: [] }]), { key: 'ParserChoicesOnlyForQcm', args: [], path: '$.cards[0].choices' }],
    ['a QCM without correct choice', packageJson([{ type: 'QCM', question: 'Q', choices: [{ text: '1' }, { text: '2' }] }]), { key: 'ParserChoiceNoCorrect', args: [], path: '$.cards[0].choices' }],
    ['a non-boolean correct flag', packageJson([{ type: 'QCM', question: 'Q', choices: [{ text: '1', correct: 'yes' }, { text: '2' }] }]), { key: 'ParserExpectedBoolean', args: [], path: '$.cards[0].choices[0].correct' }],
    ['an invalid language', packageJson([{ question: 'Q', answer: 'A', language: 'fr_FR' }]), { key: 'ParserInvalidLanguageTag', args: [], path: '$.cards[0].language' }],
    ['a non-image', packageJson([{ question: 'Q', answer: 'A', image: 'AAAA' }]), { key: 'ParserImageFormat', args: [], path: '$.cards[0].image' }],
    ['invalid base64', packageJson([{ question: 'Q', answer: 'A', answerImage: 'not base64' }]), { key: 'ParserImageEncoding', args: [], path: '$.cards[0].answerImage' }],
    ['a blank tag', packageJson([{ question: 'Q', answer: 'A', tags: ['ok', ' '] }]), { key: 'ParserTagLength', args: [], path: '$.cards[0].tags[1]' }],
  ])('refuses %s with the JSON path', (_case, json, expected) => {
    expect(failure(() => parsePackage(json))).toEqual(expected);
  });

  it('refuses nesting deeper than 64 levels', () => {
    expect(failure(() => parsePackage(`${'['.repeat(65)}${']'.repeat(65)}`))?.key).toBe('ParserMalformedJson');
  });

  it('ignores braces and escaped quotes inside strings when looking for duplicates', () => {
    expect(() => parsePackage(packageJson([{ question: 'a "{" b \\', answer: '}]"' }]))).not.toThrow();
  });

  it('reads the template and every bundled package', () => {
    expect(parsePackage(PACKAGE_TEMPLATE).cards).toHaveLength(3);
    const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../assets/default-packages');
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      expect(() => parsePackage(decodePackageFile(readFileSync(path.join(directory, file)))), file).not.toThrow();
    }
  });
});

describe('decodePackageFile', () => {
  it('refuses invalid UTF-8', () => {
    expect(failure(() => decodePackageFile(new Uint8Array([0x7b, 0xff, 0x7d])))?.key).toBe('ParserInvalidUtf8');
  });
});

describe('serializePackage', () => {
  it('exports an importable file without null values', () => {
    const cards = parsePackage(PACKAGE_TEMPLATE).cards;
    const json = serializePackage('Export', cards);
    expect(json).not.toContain('null');
    expect(JSON.parse(json).cards[1]).toMatchObject({ type: 'QCM', choices: [{ text: '3', correct: false }, { text: '4', correct: true }, { text: '5', correct: false }] });
    expect(parsePackage(json)).toEqual({ title: 'Export', cards });
  });

  it('refuses to export an empty package', () => {
    expect(failure(() => serializePackage('Vide', []))?.key).toBe('ParserCardCount');
  });
});

describe('exportFileName', () => {
  it.each([
    ['Géographie — Capitales', 'Géographie — Capitales.json'],
    ['a/b:c*d?', 'a_b_c_d_.json'],
    ['nom. ', 'nom.json'],
    ['CON', '_CON.json'],
    ['...', 'learning-buddy-package.json'],
  ])('%s → %s', (name, expected) => {
    expect(exportFileName(name)).toBe(expected);
  });
});

describe('packageFrequency', () => {
  it('splits evenly and validates distributions', () => {
    expect(createEqualDistribution(['a', 'b', 'c'])).toEqual({ a: 34, b: 33, c: 33 });
    expect(isValidDistribution(['a', 'b'], { a: 40, b: 60 })).toBe(true);
    expect(isValidDistribution(['a', 'b'], { a: 40, b: 50 })).toBe(false);
    expect(isValidDistribution(['a', 'b'], { a: 0, b: 100 })).toBe(false);
    expect(isValidDistribution(['a', 'b'], { a: 40, c: 60 })).toBe(false);
    expect(maximumPercentage(3)).toBe(98);
  });

  it('compensates with the first package, or the second when the first changes', () => {
    const start = { a: 34, b: 33, c: 33 };
    expect(changePercentage(['a', 'b', 'c'], start, 'c', 43)).toEqual({ a: 24, b: 33, c: 43 });
    expect(changePercentage(['a', 'b', 'c'], start, 'a', 24)).toEqual({ a: 24, b: 43, c: 33 });
  });

  it('takes what the partner cannot give from the other packages and clamps the value', () => {
    expect(changePercentage(['a', 'b', 'c'], { a: 10, b: 30, c: 60 }, 'b', 80)).toEqual({ a: 1, b: 80, c: 19 });
    expect(changePercentage(['a', 'b', 'c'], { a: 34, b: 33, c: 33 }, 'b', 150)).toEqual({ a: 1, b: 98, c: 1 });
  });
});

describe('importReview', () => {
  const content = parsePackage(packageJson([
    { question: 'Q1', answer: 'A1' },
    { question: ' ', answer: 'A2' },
    { type: 'QCM', question: 'Q3', choices: [{ text: '1' }, { text: '2', correct: true }] },
  ]));

  it('tracks statuses and only confirms without invalid card', () => {
    const drafts = createDrafts(content);
    expect(drafts.map(draftStatus)).toEqual(['valid', 'invalid', 'valid']);
    expect(canConfirm(summarize(drafts))).toBe(false);

    const corrected = drafts.map((draft, index) => (index === 1 ? { ...draft, question: 'Q2' } : draft));
    expect(summarize(corrected)).toEqual({ total: 3, accepted: 3, valid: 2, corrected: 1, excluded: 0, invalid: 0 });
    expect(canConfirm(summarize(corrected))).toBe(true);
  });

  it('skips excluded cards and restores the answer of a cleared QCM', () => {
    const drafts = createDrafts(content).map((draft, index) =>
      (index === 1 ? { ...draft, excluded: true } : index === 2 ? { ...draft, answer: ' ' } : draft));
    expect(acceptedCards(drafts).map((card) => card.answer)).toEqual(['A1', '2']);
  });
});
