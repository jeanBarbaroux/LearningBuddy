// Local persistence: a single JSON document written atomically in the Electron userData folder.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { calculateNextState } from '../core/reviewScheduler';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CardRecord,
  type CardReviewState,
  type ImportedPackage,
  type PackageRecord,
  type ReviewEvent,
  type ReviewOutcome,
} from '../core/types';

const SCHEMA_VERSION = 1;

interface StoreDocument {
  schemaVersion: number;
  settings: AppSettings;
  packages: PackageRecord[];
  cards: CardRecord[];
  reviewStates: Record<string, CardReviewState>;
  events: ReviewEvent[];
}

export class LocalStorageError extends Error {
  constructor(message: string, readonly filePath: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalStorageError';
  }
}

export interface PackageSummary {
  readonly package: PackageRecord;
  readonly cardCount: number;
}

export interface ReviewCandidates {
  readonly states: CardReviewState[];
  readonly packageIdsByCardId: Map<string, string>;
}

export interface StoreStatistics {
  readonly packageCount: number;
  readonly cardCount: number;
  readonly dueCount: number;
  readonly reviewedToday: number;
}

export class LocalStore {
  private readonly document: StoreDocument;

  constructor(readonly filePath: string) {
    this.document = this.load();
  }

  getSettings(): AppSettings {
    return this.document.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.document.settings = { ...this.document.settings, ...patch };
    this.save();
    return this.document.settings;
  }

  listPackages(): PackageSummary[] {
    const counts = new Map<string, number>();
    for (const card of this.document.cards) {
      counts.set(card.packageId, (counts.get(card.packageId) ?? 0) + 1);
    }

    return this.document.packages
      .map((record) => ({ package: record, cardCount: counts.get(record.id) ?? 0 }))
      .sort((a, b) => a.package.name.localeCompare(b.package.name, 'fr'));
  }

  getPackage(id: string): PackageRecord | null {
    return this.document.packages.find((record) => record.id === id) ?? null;
  }

  hasLibraryPackage(libraryId: string): boolean {
    return this.document.packages.some((record) => record.libraryId === libraryId);
  }

  createPackage(imported: ImportedPackage, libraryId: string | null, now: number): PackageRecord {
    const record: PackageRecord = { id: randomUUID(), name: imported.title, libraryId, createdAt: now };
    this.document.packages.push(record);
    imported.cards.forEach((card, position) => {
      const id = randomUUID();
      this.document.cards.push({ ...card, id, packageId: record.id, position, createdAt: now });
      this.document.reviewStates[id] = { cardId: id, level: 0, dueAt: now, lastReviewedAt: null };
    });
    this.save();
    return record;
  }

  deletePackage(id: string): boolean {
    if (!this.getPackage(id)) {
      return false;
    }

    const removedCardIds = new Set(
      this.document.cards.filter((card) => card.packageId === id).map((card) => card.id),
    );
    this.document.packages = this.document.packages.filter((record) => record.id !== id);
    this.document.cards = this.document.cards.filter((card) => card.packageId !== id);
    this.document.events = this.document.events.filter((event) => !removedCardIds.has(event.cardId));
    for (const cardId of removedCardIds) {
      delete this.document.reviewStates[cardId];
    }

    const selected = this.document.settings.reviewPackageIds;
    if (selected) {
      this.document.settings = {
        ...this.document.settings,
        reviewPackageIds: selected.filter((packageId) => packageId !== id),
      };
    }

    this.save();
    return true;
  }

  getCard(id: string): CardRecord | null {
    return this.document.cards.find((card) => card.id === id) ?? null;
  }

  /** Review states of the cards in the selected packages (every package when the selection is null). */
  getReviewCandidates(packageIds: readonly string[] | null): ReviewCandidates {
    const allowed = packageIds ? new Set(packageIds) : null;
    const states: CardReviewState[] = [];
    const packageIdsByCardId = new Map<string, string>();
    for (const card of this.document.cards) {
      if (allowed && !allowed.has(card.packageId)) {
        continue;
      }

      const state = this.document.reviewStates[card.id];
      if (state) {
        states.push(state);
        packageIdsByCardId.set(card.id, card.packageId);
      }
    }

    return { states, packageIdsByCardId };
  }

  /** Records the outcome of a presentation and returns the new review state. */
  recordOutcome(cardId: string, shownAt: number, outcome: ReviewOutcome, now: number): CardReviewState {
    const state = this.document.reviewStates[cardId];
    if (!state) {
      throw new Error(`Carte inconnue : ${cardId}`);
    }

    const next = calculateNextState(state, outcome, now);
    this.document.reviewStates[cardId] = next;
    this.document.events.push({
      id: randomUUID(),
      cardId,
      shownAt,
      answeredAt: now,
      outcome,
      levelBefore: state.level,
      levelAfter: next.level,
    });
    this.save();
    return next;
  }

  getStatistics(now: number): StoreStatistics {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const states = Object.values(this.document.reviewStates);
    return {
      packageCount: this.document.packages.length,
      cardCount: this.document.cards.length,
      dueCount: states.filter((state) => state.lastReviewedAt === null || state.dueAt <= now).length,
      reviewedToday: this.document.events.filter((event) =>
        event.answeredAt >= startOfDay.getTime() && event.outcome !== 'noResult').length,
    };
  }

  private load(): StoreDocument {
    if (!existsSync(this.filePath)) {
      return emptyDocument();
    }

    let parsed: Partial<StoreDocument>;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoreDocument>;
    } catch (error) {
      throw new LocalStorageError('Les données locales sont illisibles.', this.filePath, { cause: error });
    }

    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new LocalStorageError(
        `Version de données non prise en charge : ${String(parsed.schemaVersion)}.`,
        this.filePath,
      );
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      packages: parsed.packages ?? [],
      cards: parsed.cards ?? [],
      reviewStates: parsed.reviewStates ?? {},
      events: parsed.events ?? [],
    };
  }

  // Write to a temporary file then rename it so a crash never leaves a truncated document.
  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify(this.document), 'utf8');
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      throw new LocalStorageError('Impossible d’enregistrer les données locales.', this.filePath, { cause: error });
    }
  }
}

function emptyDocument(): StoreDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: DEFAULT_SETTINGS,
    packages: [],
    cards: [],
    reviewStates: {},
    events: [],
  };
}
