import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantSession } from '../core/assistantSession';
import type { CompanionReaction } from '../core/avatarStoryboard';
import type { BubbleView } from '../shared/ipc';
import { ReviewController, type ReviewControllerHost } from './reviewController';
import { LocalStore } from './store';
import { samplePackage } from './testFixtures';

const MINUTE = 60_000;

class FakeHost implements ReviewControllerHost {
  views: BubbleView[] = [];
  bubbleOpen = false;
  questionDisplayed = false;
  reactions: CompanionReaction[] = [];
  scheduled: (() => void)[] = [];

  showBubble(view: BubbleView): void {
    this.views.push(view);
    this.bubbleOpen = true;
  }

  closeBubble(): void {
    this.bubbleOpen = false;
  }

  setQuestionDisplayed(displayed: boolean): void {
    this.questionDisplayed = displayed;
  }

  playReaction(reaction: CompanionReaction): void {
    this.reactions.push(reaction);
  }

  stateChanged(): void { }

  schedule(callback: () => void): void {
    this.scheduled.push(callback);
  }

  runScheduled(): void {
    const callbacks = this.scheduled;
    this.scheduled = [];
    callbacks.forEach((callback) => callback());
  }

  get lastView(): BubbleView {
    return this.views.at(-1)!;
  }
}

describe('ReviewController', () => {
  let directory: string;
  let store: LocalStore;
  let host: FakeHost;
  let clock: { now: number };

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'learning-buddy-controller-'));
    store = new LocalStore(path.join(directory, 'store.json'));
    host = new FakeHost();
    clock = { now: 0 };
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function createController(questionsPerSeries = 1): ReviewController {
    const session = new AssistantSession(() => clock.now, { active: false, intervalMs: 10 * MINUTE, questionsPerSeries });
    return new ReviewController(store, session, host, () => clock.now);
  }

  it('shows a message when no card is available', () => {
    createController().presentNext(true);
    expect(host.lastView).toMatchObject({ kind: 'message' });
    expect(host.questionDisplayed).toBe(false);
  });

  it('presents a card manually and records a celebrated good answer', () => {
    store.createPackage(samplePackage('AZ-900', 1), null, 0);
    const controller = createController();
    controller.presentNext(true);
    expect(host.lastView).toMatchObject({ kind: 'card', packageName: 'AZ-900', series: null });
    expect(host.questionDisplayed).toBe(true);

    clock.now = 5000;
    controller.answer('good');
    expect(host.bubbleOpen).toBe(false);
    expect(host.questionDisplayed).toBe(false);
    expect(host.reactions).toEqual(['celebrate']);
    expect(store.getReviewCandidates(null).states[0]).toMatchObject({ level: 1, lastReviewedAt: 5000 });
  });

  it('makes the companion think after a difficult answer and records no result when closed', () => {
    store.createPackage(samplePackage('A', 2), null, 0);
    const controller = createController();
    controller.presentNext(true);
    controller.answer('hard');
    controller.presentNext(true);
    controller.close();
    expect(host.reactions).toEqual(['think']);
    expect(store.getReviewCandidates(null).states.map((state) => state.lastReviewedAt)).toContain(null);
  });

  it('runs an automatic series without repeating cards', () => {
    store.createPackage(samplePackage('A', 3), null, 0);
    const controller = createController(2);
    controller.setAssistantActive(true);
    controller.tick();
    const first = host.lastView;
    expect(first).toMatchObject({ kind: 'card', series: { index: 1, target: 2 } });
    controller.answer('good');
    host.runScheduled();
    const second = host.lastView;
    expect(second).toMatchObject({ kind: 'card', series: { index: 2, target: 2 } });
    expect(second).not.toEqual(first);
    controller.answer('again');
    expect(host.scheduled).toHaveLength(0);
    controller.tick();
    expect(host.views).toHaveLength(2);
    clock.now = 10 * MINUTE;
    controller.tick();
    expect(host.views).toHaveLength(3);
  });

  it('ignores a new presentation while a card is displayed', () => {
    store.createPackage(samplePackage('A', 2), null, 0);
    const controller = createController();
    controller.presentNext(true);
    controller.presentNext(true);
    expect(host.views).toHaveLength(1);
  });
});
