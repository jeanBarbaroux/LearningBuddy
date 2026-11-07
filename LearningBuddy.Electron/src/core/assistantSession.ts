// Simplified port of LearningBuddy.Core/AssistantSession.cs: interval-based series of questions
// (the fixed daily schedule of the WPF version is not part of this prototype).

export interface AssistantSessionOptions {
  readonly active: boolean;
  readonly intervalMs: number;
  readonly questionsPerSeries: number;
}

export class AssistantSession {
  private enabled: boolean;
  private hasStarted: boolean;
  private intervalMs: number;
  private questionsPerSeries: number;
  private presentationInProgress = false;
  private manualPresentation = false;
  private seriesActive = false;
  private seriesTarget = 0;
  private presentedInSeries = 0;
  nextPresentationAt: number;

  constructor(private readonly now: () => number, options: AssistantSessionOptions) {
    validateInterval(options.intervalMs);
    validateQuestions(options.questionsPerSeries);
    this.intervalMs = options.intervalMs;
    this.questionsPerSeries = options.questionsPerSeries;
    this.enabled = options.active;
    this.hasStarted = options.active;
    this.nextPresentationAt = now() + (options.active ? this.intervalMs : 0);
  }

  get isActive(): boolean {
    return this.enabled;
  }

  get isPresentationInProgress(): boolean {
    return this.presentationInProgress;
  }

  get seriesProgress(): { readonly presented: number; readonly target: number } | null {
    return this.seriesActive ? { presented: this.presentedInSeries, target: this.seriesTarget } : null;
  }

  /** The first start presents immediately; later restarts wait for a full interval. */
  start(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.nextPresentationAt = this.now() + (this.hasStarted ? this.intervalMs : 0);
    this.hasStarted = true;
  }

  pause(): void {
    this.enabled = false;
    this.resetSeries();
  }

  /** Whether an automatic presentation should happen now. */
  isDue(): boolean {
    return this.enabled && !this.presentationInProgress
      && (this.seriesActive || this.now() >= this.nextPresentationAt);
  }

  beginPresentation(manual: boolean): void {
    if (this.presentationInProgress) {
      throw new Error('Une présentation est déjà en cours.');
    }

    this.presentationInProgress = true;
    this.manualPresentation = manual;
    if (!manual && !this.seriesActive) {
      this.seriesActive = true;
      this.seriesTarget = this.questionsPerSeries;
      this.presentedInSeries = 0;
    }
  }

  /** Ends the current presentation; returns whether the series continues with another question. */
  completePresentation(): boolean {
    if (!this.presentationInProgress) {
      return false;
    }

    this.presentationInProgress = false;
    if (this.manualPresentation || !this.seriesActive) {
      return false;
    }

    this.presentedInSeries += 1;
    if (this.presentedInSeries < this.seriesTarget && this.enabled) {
      return true;
    }

    this.endSeries();
    return false;
  }

  /** Called when no card is available: the series stops and the next attempt waits a full interval. */
  noCardAvailable(): void {
    this.presentationInProgress = false;
    this.endSeries();
  }

  updateSettings(intervalMs: number, questionsPerSeries: number): void {
    validateInterval(intervalMs);
    validateQuestions(questionsPerSeries);
    const intervalChanged = intervalMs !== this.intervalMs;
    this.intervalMs = intervalMs;
    this.questionsPerSeries = questionsPerSeries;
    if (intervalChanged && this.enabled && !this.seriesActive) {
      this.nextPresentationAt = this.now() + intervalMs;
    }
  }

  private endSeries(): void {
    this.resetSeries();
    this.nextPresentationAt = this.now() + this.intervalMs;
  }

  private resetSeries(): void {
    this.seriesActive = false;
    this.seriesTarget = 0;
    this.presentedInSeries = 0;
  }
}

function validateInterval(intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
    throw new RangeError('L’intervalle doit être d’au moins une minute.');
  }
}

function validateQuestions(questions: number): void {
  if (!Number.isInteger(questions) || questions < 1) {
    throw new RangeError('Une série contient au moins une question.');
  }
}
