import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackageImportError, parsePackage } from './packageParser';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function json(value: unknown): string {
  return JSON.stringify(value);
}

function packageWith(cards: unknown[], extra: Record<string, unknown> = {}): string {
  return json({ format: 'learning-buddy', schemaVersion: 1, title: '  Mon paquet  ', cards, ...extra });
}

describe('parsePackage', () => {
  it('reads a simple card package and trims the title', () => {
    const result = parsePackage(packageWith([
      { question: 'Q ?', answer: 'R', explanation: null, language: 'fr', tags: ['a', ' A ', 'b'] },
    ]));
    expect(result.title).toBe('Mon paquet');
    expect(result.cards[0]).toMatchObject({
      type: 'card', question: 'Q ?', answer: 'R', explanation: null, language: 'fr', tags: ['a', 'b'],
    });
  });

  it('derives the answer of a QCM from its correct choices', () => {
    const result = parsePackage(packageWith([
      {
        type: 'QCM',
        question: 'Lesquels ?',
        choices: [{ text: ' Un ', correct: true }, { text: 'Deux' }, { text: 'Trois', correct: true }],
      },
    ]));
    expect(result.cards[0]).toMatchObject({ type: 'qcm', answer: 'Un\nTrois' });
    expect(result.cards[0]?.choices).toEqual([
      { text: 'Un', correct: true }, { text: 'Deux', correct: false }, { text: 'Trois', correct: true },
    ]);
  });

  it('accepts an image-only question', () => {
    const result = parsePackage(packageWith([{ image: PNG_BASE64, answer: 'R' }]));
    expect(result.cards[0]).toMatchObject({ question: '', image: PNG_BASE64 });
  });

  it.each([
    ['malformed JSON', '{', /JSON mal formé/],
    ['wrong format', json({ format: 'other', schemaVersion: 1, title: 't', cards: [] }), /\$\.format/],
    ['unsupported version', packageWith([{ question: 'q', answer: 'a' }], { schemaVersion: 2 }), /version 2/],
    ['unknown property', packageWith([{ question: 'q', answer: 'a', extra: 1 }]), /\$\.cards\[0\]\.extra/],
    ['missing answer', packageWith([{ question: 'q' }]), /\$\.cards\[0\]\.answer/],
    ['empty package', packageWith([]), /entre 1 et 5000 cartes/],
    ['QCM without correct choice', packageWith([
      { type: 'QCM', question: 'q', choices: [{ text: 'a' }, { text: 'b' }] },
    ]), /au moins un choix doit être correct/],
    ['choices on a card', packageWith([
      { question: 'q', answer: 'a', choices: [{ text: 'a', correct: true }, { text: 'b' }] },
    ]), /réservés aux cartes QCM/],
    ['invalid image', packageWith([{ question: 'q', answer: 'a', image: 'R0lGODlh' }]), /PNG ou JPEG/],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parsePackage(input)).toThrow(PackageImportError);
    expect(() => parsePackage(input)).toThrow(message);
  });

  it('parses every package bundled with the application', () => {
    const directory = path.resolve(__dirname, '../../../assets/default-packages');
    const files = readdirSync(directory).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = parsePackage(readFileSync(path.join(directory, file), 'utf8'));
      expect(result.cards.length, file).toBeGreaterThan(0);
    }
  });
});
