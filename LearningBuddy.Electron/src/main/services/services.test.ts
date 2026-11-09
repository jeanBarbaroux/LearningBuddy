import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalizedError } from '../../core/errors';
import type { CardContent } from '../../core/model';
import { DataStore, LocalStorageError } from '../data/dataStore';
import { PackageService } from './packageService';
import { ReviewService } from './reviewService';
import { SettingsService } from './settingsService';

const card = (question: string): CardContent => ({
  type: 'card', question, answer: `${question} !`, explanation: null, language: null, tags: [], choices: [], image: null, answerImage: null,
});

let directory: string;
let now: number;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'learning-buddy-store-'));
  now = 1_000_000;
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function services(): { store: DataStore; packages: PackageService; reviews: ReviewService; settings: SettingsService } {
  const store = new DataStore(directory);
  return { store, packages: new PackageService(store, () => now), reviews: new ReviewService(store, () => now), settings: new SettingsService(store) };
}

describe('DataStore', () => {
  it('persists the documents and reloads them', () => {
    const { packages } = services();
    packages.createPackage('Paquet', [card('Q1'), card('Q2')], null);
    const reloaded = services();
    expect(reloaded.packages.listSummaries()).toMatchObject([{ package: { name: 'Paquet' }, cardCount: 2 }]);
  });

  it('refuses unreadable or newer documents', () => {
    writeFileSync(path.join(directory, 'catalog.json'), '{ not json');
    expect(() => new DataStore(directory)).toThrow(LocalStorageError);
    writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({ schemaVersion: 99 }));
    expect(() => new DataStore(directory)).toThrow(expect.objectContaining({ kind: 'incompatibleVersion' }));
  });

  it('rolls the documents back when a change fails', () => {
    const { store, packages } = services();
    packages.createPackage('Paquet', [card('Q1')], null);
    expect(() => store.transact(['catalog'], () => {
      store.catalog.packages = [];
      throw new Error('échec');
    })).toThrow('échec');
    expect(packages.listSummaries()).toHaveLength(1);
  });
});

describe('PackageService', () => {
  it('validates names and card contents', () => {
    const { packages } = services();
    expect(() => packages.createPackage('   ', [card('Q')], null)).toThrow(LocalizedError);
    expect(() => packages.createPackage('Paquet', [], null)).toThrow(LocalizedError);
    expect(() => packages.createPackage('Paquet', [{ ...card('Q'), answer: ' ' }], null)).toThrow(LocalizedError);
  });

  it('adds, edits and deletes cards, keeping positions and history consistent', () => {
    const { packages, reviews, store } = services();
    const record = packages.createPackage('Paquet', [card('Q1')], null);
    now += 1000;
    const added = packages.addCard(record.id, card('Q2'));
    expect(added.position).toBe(1);
    expect(packages.getPackage(record.id).updatedAt).toBe(now);

    packages.updateCard(added.id, { ...card('Q2 modifiée') }, 3);
    expect(packages.cardsWithLevel(record.id)[1]).toMatchObject({ question: 'Q2 modifiée', level: 3 });

    reviews.beginPresentation(added.id);
    packages.deleteCard(added.id);
    expect(packages.cardsOf(record.id)).toHaveLength(1);
    expect(store.reviews.events).toHaveLength(0);
    expect(store.reviews.states[added.id]).toBeUndefined();
  });

  it('manages the review selection, frequencies and the assistant', () => {
    const { packages, settings } = services();
    const a = packages.createPackage('A', [card('Q')], null);
    const b = packages.createPackage('B', [card('Q')], null);
    packages.setSelected(a.id, true);
    packages.setSelected(b.id, true);
    packages.setPercentages({ [a.id]: 30, [b.id]: 70 });
    expect(() => packages.setPercentages({ [a.id]: 30, [b.id]: 60 })).toThrow(LocalizedError);

    settings.update({ assistantEnabled: true });
    packages.deletePackage(b.id);
    expect(settings.current.reviewPackageIds).toEqual([a.id]);
    // Removing a selected package resets the frequencies to an even split.
    expect(settings.current.packagePercentages).toEqual({ [a.id]: 100 });

    packages.deletePackage(a.id);
    expect(settings.current).toMatchObject({ reviewPackageIds: [], packagePercentages: null, assistantEnabled: false });
  });

  it('refuses to select an empty package and exports an importable file', () => {
    const { packages } = services();
    const record = packages.createPackage('Paquet', [card('Q1')], null);
    const empty = packages.createPackage('Vide', [card('X')], null);
    packages.deleteCard(packages.cardsOf(empty.id)[0]!.id);
    expect(() => packages.setSelected(empty.id, true)).toThrow(LocalizedError);
    expect(JSON.parse(packages.exportPackage(record.id).json)).toMatchObject({ format: 'learning-buddy', title: 'Paquet' });
  });

  it('links library entries to packages created with the same name', () => {
    const { packages } = services();
    packages.createPackage('Géographie', [card('Q')], null);
    packages.linkLibraryEntries([{ id: '40-geographie', title: 'Géographie' }]);
    expect(packages.isLibraryEntryDownloaded('40-geographie')).toBe(true);
  });
});

describe('ReviewService', () => {
  it('records a presentation and its outcome, and closes forgotten ones at startup', () => {
    const { packages, reviews, store } = services();
    const record = packages.createPackage('Paquet', [card('Q1'), card('Q2')], null);
    const [first, second] = packages.cardsOf(record.id);
    const event = reviews.beginPresentation(first!.id);
    now += 5000;
    expect(reviews.completePresentation(event, 'good')).toMatchObject({ level: 1, lastReviewedAt: now });
    expect(reviews.completePresentation(event, 'easy')).toBeNull();

    reviews.beginPresentation(second!.id);
    reviews.closeOpenPresentations();
    expect(store.reviews.events.map((candidate) => candidate.outcome)).toEqual(['good', 'noResult']);
    expect(JSON.parse(readFileSync(path.join(directory, 'reviews.json'), 'utf8')).events).toHaveLength(2);
  });
});
