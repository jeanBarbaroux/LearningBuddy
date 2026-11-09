import { describe, expect, it } from 'vitest';
import { LocalizedError } from '../errors';
import type { CardContent } from '../model';
import { isValidLanguageTag } from './bcp47';
import {
  allowsMultipleAnswers,
  deriveAnswer,
  evaluateChoice,
  formatChoicesText,
  hasCustomAnswer,
  normalizeChoices,
  parseChoicesText,
} from './cardChoices';
import { CardValidationError, normalizeCardContent } from './cardContent';
import { checkImage, imageMimeType } from './images';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function card(overrides: Partial<CardContent> = {}): CardContent {
  return {
    type: 'card', question: 'Q', answer: 'A', explanation: null, language: null, tags: [], choices: [],
    image: null, answerImage: null, ...overrides,
  };
}

function errorKey(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof LocalizedError ? error.localized.key : 'other';
  }

  return undefined;
}

describe('card choices', () => {
  const choices = [{ text: ' 3 ', correct: false }, { text: '4', correct: true }];

  it('trims valid choices and derives the answer from the correct ones', () => {
    expect(normalizeChoices('qcm', choices)).toEqual([{ text: '3', correct: false }, { text: '4', correct: true }]);
    expect(deriveAnswer([{ text: 'a', correct: true }, { text: 'b', correct: true }])).toBe('a\nb');
  });

  it('rejects counts, duplicates and missing correct choices', () => {
    expect(errorKey(() => normalizeChoices('qcm', [choices[0]!]))).toBe('ParserChoiceCount');
    expect(errorKey(() => normalizeChoices('qcm', [{ text: 'A', correct: true }, { text: 'a', correct: false }])))
      .toBe('ParserChoiceDuplicate');
    expect(errorKey(() => normalizeChoices('qcm', [{ text: 'A', correct: false }, { text: 'B', correct: false }])))
      .toBe('ParserChoiceNoCorrect');
    expect(errorKey(() => normalizeChoices('card', choices))).toBe('ParserChoicesOnlyForQcm');
  });

  it('reads and writes the editor format', () => {
    const parsed = parseChoicesText('[x] Paris\n\n[ ] Lyon\n[] Nice\nMarseille\n[X] Brest');
    expect(parsed).toEqual([
      { text: 'Paris', correct: true },
      { text: 'Lyon', correct: false },
      { text: 'Nice', correct: false },
      { text: 'Marseille', correct: false },
      { text: 'Brest', correct: true },
    ]);
    expect(formatChoicesText(parsed.slice(0, 2))).toBe('[x] Paris\n[ ] Lyon');
  });

  it('detects custom answers and multiple answers', () => {
    expect(hasCustomAnswer('4', choices)).toBe(false);
    expect(hasCustomAnswer('Quatre', choices)).toBe(true);
    expect(allowsMultipleAnswers(choices)).toBe(false);
    expect(evaluateChoice({ text: 'x', correct: true }, false)).toBe('correctMissed');
    expect(evaluateChoice({ text: 'x', correct: false }, true)).toBe('incorrectSelected');
  });
});

describe('card content', () => {
  it('normalises optional fields, tags and QCM answers', () => {
    const result = normalizeCardContent(card({
      type: 'qcm', answer: ' ', explanation: '  ', language: ' fr-FR ', tags: [' a ', 'A', 'b'],
      choices: [{ text: 'x', correct: true }, { text: 'y', correct: false }],
    }));
    expect(result).toMatchObject({ answer: 'x', explanation: null, language: 'fr-FR', tags: ['a', 'b'] });
  });

  it('reports the invalid field', () => {
    const fieldOf = (content: CardContent): string | undefined => {
      try {
        normalizeCardContent(content);
      } catch (error) {
        return error instanceof CardValidationError ? error.field : 'other';
      }

      return undefined;
    };
    expect(fieldOf(card({ question: ' ' }))).toBe('question');
    expect(fieldOf(card({ question: '', image: PNG }))).toBeUndefined();
    expect(fieldOf(card({ answer: '' }))).toBe('answer');
    expect(fieldOf(card({ language: 'f' }))).toBe('language');
    expect(fieldOf(card({ tags: ['x'.repeat(65)] }))).toBe('tags');
    expect(fieldOf(card({ image: 'aGVsbG8=' }))).toBe('image');
  });
});

describe('images and language tags', () => {
  it('recognises PNG and rejects other content', () => {
    expect(imageMimeType(PNG)).toBe('image/png');
    expect(checkImage(PNG)).toBeNull();
    expect(checkImage('aGVsbG8=')).toBe('format');
    expect(checkImage('not base64!')).toBe('encoding');
  });

  it('validates BCP 47 tags', () => {
    for (const tag of ['fr', 'fr-FR', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1996', 'en-a-bbb-x-ccc', 'i-klingon', 'x-private']) {
      expect(isValidLanguageTag(tag), tag).toBe(true);
    }

    for (const tag of ['f', 'fr-', 'fr--FR', 'toolonglanguage', 'en-a-bbb-a-ccc', 'fr_FR', 'en-x']) {
      expect(isValidLanguageTag(tag), tag).toBe(false);
    }
  });
});
