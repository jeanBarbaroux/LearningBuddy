import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CardContent } from '../../core/model';
import type { BubbleView } from '../../shared/ipc';
import { DataStore } from '../data/dataStore';
import { PackageService } from '../services/packageService';
import { ReviewService } from '../services/reviewService';
import { SettingsService } from '../services/settingsService';
import { ReviewController, type ReviewControllerHost } from './reviewController';

const MINUTE = 60_000;

const card = (question: string): CardContent => ({
  type: 'card', question, answer: 'R', explanation: null, language: null, tags: [], choices: [], image: null, answerImage: null,
});

class FakeHost implements ReviewControllerHost {
  companionVisible = true;
  bubble: BubbleView | null = null;
  invitation = false;
  reactions: string[] = [];
  errors: string[] = [];
  showBubble(view: BubbleView): void { this.bubble = view; }
  closeBubble(): void { this.bubble = null; }
  showInvitation(): void { this.invitation = true; }
  closeInvitation(): void { this.invitation = false; }
  setCompanionVisible(visible: boolean): void { this.companionVisible = visible; }
  playReaction(reaction: string): void { this.reactions.push(reaction); }
  stateChanged(): void {}
  showError(message: { key: string }): void { this.errors.push(message.key); }
}

let directory: string;
let now: number;
let host: FakeHost;
let settings: SettingsService;
let packages: PackageService;
let reviews: ReviewService;
let store: DataStore;

function controller(): ReviewController {
  return new ReviewController(settings, packages, reviews, host, () => now, () => 0);
}

function cardQuestion(): string | undefined {
  return host.bubble?.kind === 'card' ? host.bubble.card.question : undefined;
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'learning-buddy-controller-'));
  now = 10 * MINUTE;
  host = new FakeHost();
  store = new DataStore(directory);
  settings = new SettingsService(store);
  packages = new PackageService(store, () => now);
  reviews = new ReviewService(store, () => now);
  const record = packages.createPackage('Paquet', [card('Q1'), card('Q2'), card('Q3')], null);
  packages.setSelected(record.id, true);
  settings.update({ questionsPerSeries: 2, intervalMinutes: 10, pauseDuringTeamsMeetings: false });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('ReviewController', () => {
  it('presents a series of distinct cards, then waits for the pause', () => {
    const review = controller();
    review.start();
    const first = cardQuestion();
    expect(first).toBeDefined();
    review.answer('good');
    expect(host.reactions).toEqual(['celebrate']);
    review.tick();
    const second = cardQuestion();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    review.answer('again');
    expect(host.reactions).toEqual(['celebrate', 'think']);
    review.tick();
    expect(host.bubble).toBeNull();
    now += 10 * MINUTE;
    review.tick();
    expect(host.bubble).not.toBeNull();
  });

  it('refuses to start without cards and persists the enabled state', () => {
    const review = controller();
    review.start();
    expect(settings.current.assistantEnabled).toBe(true);
    review.pause();
    expect(settings.current.assistantEnabled).toBe(false);
    for (const summary of packages.listSummaries()) {
      packages.deletePackage(summary.package.id);
    }

    expect(() => review.start()).toThrow();
  });

  it('records "no result" when the bubble is closed and ends the series', () => {
    const review = controller();
    review.start();
    review.close();
    expect(store.reviews.events.at(-1)?.outcome).toBe('noResult');
    expect(review.session.isSeriesActive).toBe(false);
    expect(host.reactions).toEqual([]);
  });

  it('shows an invitation while the companion is hidden, and can snooze it', () => {
    const review = controller();
    review.start();
    review.answer('good');
    host.companionVisible = false;
    review.tick();
    expect(host.invitation).toBe(true);
    review.snoozeInvitation();
    expect(host.invitation).toBe(false);
    review.tick();
    expect(host.invitation).toBe(false);
    now += 6 * MINUTE;
    review.tick();
    expect(host.invitation).toBe(true);
    review.acceptInvitation();
    expect(host.companionVisible).toBe(true);
    expect(host.bubble).not.toBeNull();
  });

  it('hides the companion during a Teams meeting and restores it afterwards', () => {
    const review = controller();
    review.setTeamsMeeting(false);
    review.start();
    review.setTeamsMeeting(true);
    expect(host.bubble).toBeNull();
    expect(host.companionVisible).toBe(false);
    expect(review.session.isActive).toBe(false);
    review.setTeamsMeeting(false);
    expect(host.companionVisible).toBe(true);
    expect(review.session.isActive).toBe(true);
  });

  it('presents manual questions only while the assistant is active and hides after a series when asked', () => {
    settings.update({ autoHideCompanionAfterSeries: true, questionsPerSeries: 1 });
    const review = controller();
    review.presentManually();
    expect(host.bubble).toBeNull();
    review.start();
    review.answer('easy');
    expect(host.companionVisible).toBe(false);
  });

  it('closes a bubble whose card is deleted', () => {
    const review = controller();
    review.start();
    const cardId = host.bubble?.kind === 'card' ? host.bubble.card.id : '';
    packages.deleteCard(cardId);
    review.onCardsDeleted();
    expect(host.bubble).toBeNull();
    expect(review.questionDisplayed).toBe(false);
  });
});
