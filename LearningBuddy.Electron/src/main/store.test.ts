import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageError, LocalStore } from './store';
import { samplePackage } from './testFixtures';

const HOUR = 3_600_000;

describe('LocalStore', () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'learning-buddy-store-'));
    filePath = path.join(directory, 'data', 'store.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('starts with default settings and persists changes', () => {
    const store = new LocalStore(filePath);
    expect(store.getSettings().intervalMinutes).toBe(10);
    store.updateSettings({ intervalMinutes: 25 });
    expect(new LocalStore(filePath).getSettings().intervalMinutes).toBe(25);
  });

  it('creates packages with unreviewed level-0 cards', () => {
    const store = new LocalStore(filePath);
    const record = store.createPackage(samplePackage(), 'lib-1', 1000);
    expect(store.listPackages()).toEqual([{ package: record, cardCount: 2 }]);
    expect(store.hasLibraryPackage('lib-1')).toBe(true);
    const candidates = store.getReviewCandidates(null);
    expect(candidates.states.map((state) => state.level)).toEqual([0, 0]);
    expect(store.getStatistics(1000)).toMatchObject({ packageCount: 1, cardCount: 2, dueCount: 2, reviewedToday: 0 });
  });

  it('filters review candidates by selected packages', () => {
    const store = new LocalStore(filePath);
    const first = store.createPackage(samplePackage('A', 1), null, 0);
    store.createPackage(samplePackage('B', 3), null, 0);
    const candidates = store.getReviewCandidates([first.id]);
    expect(candidates.states).toHaveLength(1);
    expect([...candidates.packageIdsByCardId.values()]).toEqual([first.id]);
  });

  it('records outcomes with the review scheduler and persists them', () => {
    const store = new LocalStore(filePath);
    store.createPackage(samplePackage('A', 1), null, 0);
    const cardId = store.getReviewCandidates(null).states[0]!.cardId;
    const next = store.recordOutcome(cardId, 500, 'good', 1000);
    expect(next).toEqual({ cardId, level: 1, dueAt: 1000 + HOUR, lastReviewedAt: 1000 });
    const reloaded = new LocalStore(filePath);
    expect(reloaded.getReviewCandidates(null).states[0]).toEqual(next);
    expect(reloaded.getStatistics(2000)).toMatchObject({ dueCount: 0, reviewedToday: 1 });
  });

  it('deletes a package with its cards, history and selection', () => {
    const store = new LocalStore(filePath);
    const first = store.createPackage(samplePackage('A', 1), null, 0);
    const second = store.createPackage(samplePackage('B', 1), null, 0);
    store.updateSettings({ reviewPackageIds: [first.id, second.id] });
    expect(store.deletePackage(first.id)).toBe(true);
    expect(store.listPackages().map((summary) => summary.package.id)).toEqual([second.id]);
    expect(store.getReviewCandidates(null).states).toHaveLength(1);
    expect(store.getSettings().reviewPackageIds).toEqual([second.id]);
    expect(store.deletePackage('unknown')).toBe(false);
  });

  it('refuses unreadable data instead of overwriting it', () => {
    new LocalStore(filePath).updateSettings({});
    writeFileSync(filePath, '{ corrupted', 'utf8');
    expect(() => new LocalStore(filePath)).toThrow(LocalStorageError);
  });
});
