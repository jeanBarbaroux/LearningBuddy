// Local persistence. Data is split into three JSON documents so that answering a question only rewrites
// the (small) review history, never the catalogue that may contain images:
//   settings.json  user preferences
//   catalog.json   packages and cards
//   reviews.json   review state of every card and the presentation history
// Each document is written to a temporary file then renamed, so a crash never leaves a truncated file.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Card, CardReviewState, Package, ReviewEvent } from '../../core/model';
import { DEFAULT_SETTINGS, type AppSettings } from '../../core/settings';

export const SCHEMA_VERSION = 1;

export interface SettingsDocument {
  settings: AppSettings;
}

export interface CatalogDocument {
  packages: Package[];
  cards: Card[];
}

export interface ReviewsDocument {
  states: Record<string, CardReviewState>;
  events: ReviewEvent[];
}

export type StorageErrorKind = 'corrupted' | 'incompatibleVersion' | 'writeFailed' | 'inaccessible';

export class LocalStorageError extends Error {
  constructor(readonly kind: StorageErrorKind, readonly filePath: string, options?: ErrorOptions) {
    super(`${kind}: ${filePath}`, options);
    this.name = 'LocalStorageError';
  }
}

interface DocumentFile<T> {
  readonly fileName: string;
  readonly create: () => T;
  readonly upgrade: (stored: Partial<T>) => T;
}

const SETTINGS_FILE: DocumentFile<SettingsDocument> = {
  fileName: 'settings.json',
  create: () => ({ settings: DEFAULT_SETTINGS }),
  // Preferences added by later versions get their default value.
  upgrade: (stored) => ({ settings: { ...DEFAULT_SETTINGS, ...stored.settings } }),
};

const CATALOG_FILE: DocumentFile<CatalogDocument> = {
  fileName: 'catalog.json',
  create: () => ({ packages: [], cards: [] }),
  upgrade: (stored) => ({ packages: stored.packages ?? [], cards: stored.cards ?? [] }),
};

const REVIEWS_FILE: DocumentFile<ReviewsDocument> = {
  fileName: 'reviews.json',
  create: () => ({ states: {}, events: [] }),
  upgrade: (stored) => ({ states: stored.states ?? {}, events: stored.events ?? [] }),
};

export type DocumentName = 'settings' | 'catalog' | 'reviews';

export class DataStore {
  readonly settings: SettingsDocument;
  readonly catalog: CatalogDocument;
  readonly reviews: ReviewsDocument;

  constructor(readonly directory: string) {
    this.settings = this.load(SETTINGS_FILE);
    this.catalog = this.load(CATALOG_FILE);
    this.reviews = this.load(REVIEWS_FILE);
  }

  /**
   * Applies a change to the documents then saves them. If the change or a save fails, the documents are
   * restored, so the data in memory never diverges from what the user was told.
   * Records are immutable: a change replaces array entries instead of modifying them, which makes a
   * shallow snapshot enough to roll back.
   */
  transact<T>(documents: readonly DocumentName[], change: () => T): T {
    const snapshot = this.snapshot();
    const saved: DocumentName[] = [];
    try {
      const result = change();
      for (const name of documents) {
        this.save(name);
        saved.push(name);
      }

      return result;
    } catch (error) {
      this.restore(snapshot);
      for (const name of saved) {
        try {
          this.save(name);
        } catch {
          // The original error is more useful to the user.
        }
      }

      throw error;
    }
  }

  private snapshot(): { settings: SettingsDocument; catalog: CatalogDocument; reviews: ReviewsDocument } {
    return {
      settings: { settings: this.settings.settings },
      catalog: { packages: [...this.catalog.packages], cards: [...this.catalog.cards] },
      reviews: { states: { ...this.reviews.states }, events: [...this.reviews.events] },
    };
  }

  private restore(snapshot: ReturnType<DataStore['snapshot']>): void {
    Object.assign(this.settings, snapshot.settings);
    Object.assign(this.catalog, snapshot.catalog);
    Object.assign(this.reviews, snapshot.reviews);
  }

  private save(name: DocumentName): void {
    switch (name) {
      case 'settings':
        return this.write(SETTINGS_FILE, this.settings);
      case 'catalog':
        return this.write(CATALOG_FILE, this.catalog);
      case 'reviews':
        return this.write(REVIEWS_FILE, this.reviews);
    }
  }

  private load<T>(file: DocumentFile<T>): T {
    const filePath = path.join(this.directory, file.fileName);
    if (!existsSync(filePath)) {
      return file.create();
    }

    let parsed: { schemaVersion?: unknown } & Partial<T>;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8')) as typeof parsed;
    } catch (error) {
      const kind = (error as NodeJS.ErrnoException).code ? 'inaccessible' : 'corrupted';
      throw new LocalStorageError(kind, filePath, { cause: error });
    }

    if (typeof parsed !== 'object' || parsed === null || typeof parsed.schemaVersion !== 'number') {
      throw new LocalStorageError('corrupted', filePath);
    }

    if (parsed.schemaVersion > SCHEMA_VERSION) {
      throw new LocalStorageError('incompatibleVersion', filePath);
    }

    return file.upgrade(parsed);
  }

  private write<T>(file: DocumentFile<T>, document: T): void {
    const filePath = path.join(this.directory, file.fileName);
    const temporaryPath = `${filePath}.tmp`;
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(temporaryPath, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...document }), 'utf8');
      renameSync(temporaryPath, filePath);
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw new LocalStorageError('writeFailed', filePath, { cause: error });
    }
  }
}
