// Packages and cards: creation, edition, deletion, export and the selection used by the assistant
// (v1 LocalStore.Packages, LocalStore.Cards).
import { randomUUID } from 'node:crypto';
import { normalizeCardContent } from '../../core/cards/cardContent';
import { LocalizedError } from '../../core/errors';
import type { Card, CardContent, CardReviewState, Package } from '../../core/model';
import { createEqualDistribution, isValidDistribution, type PackagePercentages } from '../../core/packages/packageFrequency';
import { MAX_CARDS_PER_PACKAGE, MAX_PACKAGE_NAME_LENGTH, serializePackage } from '../../core/packages/packageFormat';
import { SettingsLimits, type AppSettings } from '../../core/settings';
import { compareOrdinal, hasLengthBetween } from '../../core/text';
import type { DataStore } from '../data/dataStore';

export interface CardWithLevel extends Card {
  readonly level: number;
}

export interface PackageSummary {
  readonly package: Package;
  readonly cardCount: number;
}

export interface ReviewCandidates {
  readonly states: CardReviewState[];
  readonly packageIdsByCardId: Map<string, string>;
}

export class PackageService {
  constructor(private readonly store: DataStore, private readonly now: () => number = Date.now) {}

  private get settings(): AppSettings {
    return this.store.settings.settings;
  }

  // -------------------------------------------------------------------------------------------------
  // Reading

  /** Packages sorted by name (case-insensitive), then by id. */
  listSummaries(): PackageSummary[] {
    const counts = new Map<string, number>();
    for (const card of this.store.catalog.cards) {
      counts.set(card.packageId, (counts.get(card.packageId) ?? 0) + 1);
    }

    return this.store.catalog.packages
      .map((record) => ({ package: record, cardCount: counts.get(record.id) ?? 0 }))
      .sort((a, b) => a.package.name.localeCompare(b.package.name, undefined, { sensitivity: 'base' })
        || compareOrdinal(a.package.id, b.package.id));
  }

  getPackage(id: string): Package {
    const record = this.store.catalog.packages.find((candidate) => candidate.id === id);
    if (!record) {
      throw new LocalizedError('PackageMissing');
    }

    return record;
  }

  findPackage(id: string): Package | null {
    return this.store.catalog.packages.find((candidate) => candidate.id === id) ?? null;
  }

  cardsOf(packageId: string): Card[] {
    return this.store.catalog.cards
      .filter((card) => card.packageId === packageId)
      .sort((a, b) => a.position - b.position);
  }

  cardsWithLevel(packageId: string): CardWithLevel[] {
    this.getPackage(packageId);
    return this.cardsOf(packageId).map((card) => ({ ...card, level: this.store.reviews.states[card.id]?.level ?? 0 }));
  }

  findCard(id: string): Card | null {
    return this.store.catalog.cards.find((card) => card.id === id) ?? null;
  }

  getCard(id: string): Card {
    const card = this.findCard(id);
    if (!card) {
      throw new LocalizedError('CardMissing');
    }

    return card;
  }

  exportPackage(id: string): { name: string; json: string } {
    const record = this.getPackage(id);
    return { name: record.name, json: serializePackage(record.name, this.cardsOf(id)) };
  }

  // -------------------------------------------------------------------------------------------------
  // Packages

  /** Stores a new package; every card starts at level 0 and is due immediately. */
  createPackage(name: string, contents: readonly CardContent[], librarySource: string | null): Package {
    const trimmed = validPackageName(name);
    if (contents.length < 1 || contents.length > MAX_CARDS_PER_PACKAGE) {
      throw new LocalizedError('ParserCardCount', [String(MAX_CARDS_PER_PACKAGE)]);
    }

    const normalized = contents.map(normalizeCardContent);
    const now = this.now();
    const record: Package = { id: randomUUID(), name: trimmed, librarySource, createdAt: now, updatedAt: now };
    return this.store.transact(['catalog', 'reviews'], () => {
      this.store.catalog.packages = [...this.store.catalog.packages, record];
      const cards = normalized.map((content, position): Card =>
        ({ ...content, id: randomUUID(), packageId: record.id, position, createdAt: now }));
      this.store.catalog.cards = [...this.store.catalog.cards, ...cards];
      for (const card of cards) {
        this.store.reviews.states[card.id] = initialState(card.id, now);
      }

      return record;
    });
  }

  rename(id: string, name: string): void {
    const trimmed = validPackageName(name);
    this.store.transact(['catalog'], () => this.touchPackage(id, { name: trimmed }));
  }

  /** Deletes a package with its cards and history, and removes it from the review selection. */
  deletePackage(id: string): void {
    this.getPackage(id);
    this.store.transact(['catalog', 'reviews', 'settings'], () => {
      const removed = new Set(this.cardsOf(id).map((card) => card.id));
      this.store.catalog.packages = this.store.catalog.packages.filter((record) => record.id !== id);
      this.store.catalog.cards = this.store.catalog.cards.filter((card) => card.packageId !== id);
      this.forgetCards(removed);
      if (this.settings.reviewPackageIds.includes(id)) {
        this.applySelection(this.settings.reviewPackageIds.filter((packageId) => packageId !== id));
      }

      this.disableAssistantWithoutCards();
    });
  }

  // -------------------------------------------------------------------------------------------------
  // Cards

  addCard(packageId: string, content: CardContent): Card {
    this.getPackage(packageId);
    const existing = this.cardsOf(packageId);
    if (existing.length >= MAX_CARDS_PER_PACKAGE) {
      throw new LocalizedError('CardLimitReached');
    }

    const normalized = normalizeCardContent(content);
    const now = this.now();
    const card: Card = {
      ...normalized,
      id: randomUUID(),
      packageId,
      position: existing.length === 0 ? 0 : Math.max(...existing.map((candidate) => candidate.position)) + 1,
      createdAt: now,
    };
    return this.store.transact(['catalog', 'reviews'], () => {
      this.store.catalog.cards = [...this.store.catalog.cards, card];
      this.store.reviews.states[card.id] = initialState(card.id, now);
      this.touchPackage(packageId, {});
      return card;
    });
  }

  /** Replaces the content of a card; the level may be changed without changing the due date. */
  updateCard(cardId: string, content: CardContent, level: number | null): Card {
    const current = this.getCard(cardId);
    const normalized = normalizeCardContent(content);
    if (level !== null && (!Number.isInteger(level) || level < 0)) {
      throw new LocalizedError('CardEditorLevelInvalid');
    }

    const updated: Card = { ...current, ...normalized };
    return this.store.transact(['catalog', 'reviews'], () => {
      this.store.catalog.cards = this.store.catalog.cards.map((card) => (card.id === cardId ? updated : card));
      const state = this.store.reviews.states[cardId];
      if (level !== null && state) {
        this.store.reviews.states[cardId] = { ...state, level };
      }

      this.touchPackage(current.packageId, {});
      return updated;
    });
  }

  deleteCard(cardId: string): void {
    const card = this.getCard(cardId);
    this.store.transact(['catalog', 'reviews', 'settings'], () => {
      this.store.catalog.cards = this.store.catalog.cards.filter((candidate) => candidate.id !== cardId);
      this.forgetCards(new Set([cardId]));
      this.touchPackage(card.packageId, {});
      this.disableAssistantWithoutCards();
    });
  }

  // -------------------------------------------------------------------------------------------------
  // Review selection

  /**
   * Adds or removes a package from the review selection. An empty package cannot be added; adding or
   * removing a package resets the frequencies to an even split.
   */
  setSelected(id: string, selected: boolean): void {
    const current = this.settings.reviewPackageIds;
    if (selected === current.includes(id)) {
      return;
    }

    if (selected) {
      if (this.cardsOf(this.getPackage(id).id).length === 0) {
        throw new LocalizedError('SelectPackageForReview');
      }

      if (current.length >= SettingsLimits.maxReviewPackages) {
        throw new LocalizedError('PackageFrequencyLimit');
      }
    }

    this.store.transact(['settings'], () => {
      this.applySelection(selected ? [...current, id] : current.filter((packageId) => packageId !== id));
      this.disableAssistantWithoutCards();
    });
  }

  setPercentages(percentages: PackagePercentages): void {
    if (!isValidDistribution(this.settings.reviewPackageIds, percentages)) {
      throw new LocalizedError('PackageFrequencyValidation');
    }

    this.store.transact(['settings'], () => {
      this.store.settings.settings = { ...this.settings, packagePercentages: { ...percentages } };
    });
  }

  hasReviewableCards(): boolean {
    const selected = new Set(this.settings.reviewPackageIds);
    return this.store.catalog.cards.some((card) => selected.has(card.packageId));
  }

  /** Review states of the cards of the selected packages. */
  reviewCandidates(): ReviewCandidates {
    const selected = new Set(this.settings.reviewPackageIds);
    const states: CardReviewState[] = [];
    const packageIdsByCardId = new Map<string, string>();
    for (const card of this.store.catalog.cards) {
      const state = this.store.reviews.states[card.id];
      if (selected.has(card.packageId) && state) {
        states.push(state);
        packageIdsByCardId.set(card.id, card.packageId);
      }
    }

    return { states, packageIdsByCardId };
  }

  // -------------------------------------------------------------------------------------------------
  // Library links

  isLibraryEntryDownloaded(libraryId: string): boolean {
    return this.store.catalog.packages.some((record) => record.librarySource === libraryId);
  }

  /** Links packages created before their library entry existed: same name, oldest package first. */
  linkLibraryEntries(entries: readonly { readonly id: string; readonly title: string }[]): void {
    const links = new Map<string, string>();
    for (const entry of entries) {
      if (this.isLibraryEntryDownloaded(entry.id)) {
        continue;
      }

      const candidate = this.store.catalog.packages
        .filter((record) => record.librarySource === null && record.name.trim() === entry.title.trim()
          && ![...links.values()].includes(record.id))
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (candidate) {
        links.set(entry.id, candidate.id);
      }
    }

    if (links.size === 0) {
      return;
    }

    this.store.transact(['catalog'], () => {
      for (const [libraryId, packageId] of links) {
        this.store.catalog.packages = this.store.catalog.packages.map((record) =>
          (record.id === packageId ? { ...record, librarySource: libraryId } : record));
      }
    });
  }

  // -------------------------------------------------------------------------------------------------

  private touchPackage(id: string, change: Partial<Pick<Package, 'name'>>): void {
    this.getPackage(id);
    const now = this.now();
    this.store.catalog.packages = this.store.catalog.packages.map((record) =>
      (record.id === id ? { ...record, ...change, updatedAt: now } : record));
  }

  private forgetCards(cardIds: ReadonlySet<string>): void {
    for (const cardId of cardIds) {
      delete this.store.reviews.states[cardId];
    }

    this.store.reviews.events = this.store.reviews.events.filter((event) => !cardIds.has(event.cardId));
  }

  private applySelection(reviewPackageIds: string[]): void {
    const hadPercentages = this.settings.packagePercentages !== null;
    this.store.settings.settings = {
      ...this.settings,
      reviewPackageIds,
      packagePercentages: hadPercentages && reviewPackageIds.length > 0 ? createEqualDistribution(reviewPackageIds) : null,
    };
  }

  /** The assistant cannot stay enabled when no selected package contains cards. */
  private disableAssistantWithoutCards(): void {
    if (this.settings.assistantEnabled && !this.hasReviewableCards()) {
      this.store.settings.settings = { ...this.settings, assistantEnabled: false };
    }
  }
}

function validPackageName(name: string): string {
  const trimmed = name.trim();
  if (!hasLengthBetween(trimmed, 1, MAX_PACKAGE_NAME_LENGTH)) {
    throw new LocalizedError('PackageNameValidation');
  }

  return trimmed;
}

function initialState(cardId: string, now: number): CardReviewState {
  return { cardId, level: 0, dueAt: now, lastReviewedAt: null };
}
