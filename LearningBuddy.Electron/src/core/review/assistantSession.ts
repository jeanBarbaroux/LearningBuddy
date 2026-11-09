// Scheduling of the review assistant (v1 AssistantSession): series of questions separated by a pause,
// or series started at fixed daily times; suspended during sleep or Teams meetings.
import { nextDailySlot, validateDailySlots, type DailyReviewSlot } from './dailySchedule';

const MINUTE = 60_000;
/** In fixed-time mode a slot is skipped when it was not presented within one minute. */
const SLOT_GRACE_MS = MINUTE;

export interface AssistantSchedule {
  readonly intervalMinutes: number;
  readonly questionsPerSeries: number;
  readonly useFixedSchedule: boolean;
  readonly dailySlots: readonly DailyReviewSlot[];
}

export class AssistantSession {
  private enabled: boolean;
  private suspended = false;
  private hasStarted: boolean;
  private intervalMs: number;
  private questionsPerSeries: number;
  private useFixedSchedule = false;
  private dailySlots: DailyReviewSlot[] = [];
  private nextSlotQuestions = 1;
  private presentationInProgress = false;
  private manualPresentation = false;
  private seriesActive = false;
  private seriesTarget = 0;
  private presentedInSeries = 0;
  private nextAt: number;

  /** An enabled assistant waits a full pause after a restart; a disabled one is due as soon as started. */
  constructor(private readonly now: () => number, enabled: boolean, schedule: AssistantSchedule) {
    this.intervalMs = validInterval(schedule.intervalMinutes);
    this.questionsPerSeries = validQuestions(schedule.questionsPerSeries);
    this.enabled = enabled;
    this.hasStarted = enabled;
    this.nextAt = now() + (enabled ? this.intervalMs : 0);
    this.setSchedule(schedule.useFixedSchedule, schedule.dailySlots);
  }

  /** Enabled and not suspended. */
  get isActive(): boolean {
    return this.enabled && !this.suspended;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isSeriesActive(): boolean {
    return this.seriesActive;
  }

  get isPresentationInProgress(): boolean {
    return this.presentationInProgress;
  }

  get isManualPresentationInProgress(): boolean {
    return this.presentationInProgress && this.manualPresentation;
  }

  /** Position of the current automatic question in its series. */
  get seriesProgress(): { readonly presented: number; readonly target: number } | null {
    return this.seriesActive ? { presented: this.presentedInSeries, target: this.seriesTarget } : null;
  }

  get nextPresentationAt(): number {
    return this.nextAt;
  }

  /** Starts immediately: the next question is due now (or at the next fixed time). */
  start(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.hasStarted = true;
    this.nextAt = this.now();
    if (this.useFixedSchedule) {
      this.scheduleNext();
    }
  }

  pause(): void {
    this.enabled = false;
    this.resetSeries();
  }

  /** Whether an automatic question can be shown now. */
  canPresent(): boolean {
    const now = this.now();
    if (this.useFixedSchedule && !this.seriesActive && !this.presentationInProgress && now >= this.nextAt + SLOT_GRACE_MS) {
      this.scheduleNext();
    }

    return this.isActive && !this.presentationInProgress && (this.seriesActive || now >= this.nextAt);
  }

  /** A question requested by the user, outside of any series. */
  canPresentManually(): boolean {
    return this.isActive && !this.presentationInProgress && !this.seriesActive;
  }

  beginPresentation(): boolean {
    if (!this.canPresent()) {
      return false;
    }

    if (!this.seriesActive) {
      this.seriesActive = true;
      this.seriesTarget = this.useFixedSchedule ? this.nextSlotQuestions : this.questionsPerSeries;
      this.presentedInSeries = 0;
    }

    this.presentationInProgress = true;
    this.manualPresentation = false;
    this.hasStarted = true;
    return true;
  }

  beginManualPresentation(): boolean {
    if (!this.canPresentManually()) {
      return false;
    }

    this.presentationInProgress = true;
    this.manualPresentation = true;
    this.hasStarted = true;
    return true;
  }

  /**
   * Ends the current question. The series continues only when more cards are eligible, the target is not
   * reached and the card was not closed without result.
   * Returns true when the series has just ended.
   */
  completePresentation(hasMoreEligibleCards: boolean): boolean {
    if (!this.presentationInProgress) {
      return false;
    }

    this.presentationInProgress = false;
    if (this.manualPresentation) {
      this.manualPresentation = false;
      return false;
    }

    if (!this.seriesActive) {
      this.scheduleNext();
      return false;
    }

    this.presentedInSeries += 1;
    if (!hasMoreEligibleCards || this.presentedInSeries >= this.seriesTarget) {
      this.endSeries();
      return true;
    }

    this.nextAt = this.now();
    return false;
  }

  /** Abandons the presentation that was about to start (no eligible card). */
  cancelPresentation(): void {
    this.presentationInProgress = false;
    this.manualPresentation = false;
  }

  endSeries(): void {
    this.resetSeries();
    this.hasStarted = true;
    this.scheduleNext();
  }

  /** Applies new preferences; the target of a running series is kept. */
  updateSchedule(schedule: AssistantSchedule): void {
    const intervalMs = validInterval(schedule.intervalMinutes);
    this.questionsPerSeries = validQuestions(schedule.questionsPerSeries);
    if (intervalMs !== this.intervalMs) {
      this.intervalMs = intervalMs;
      if (this.hasStarted && !this.seriesActive && !this.useFixedSchedule && !schedule.useFixedSchedule) {
        this.nextAt = this.now() + intervalMs;
      }
    }

    this.setSchedule(schedule.useFixedSchedule, schedule.dailySlots);
  }

  /** System sleep or Teams meeting: no question until resume; the series is abandoned. */
  suspend(): void {
    this.suspended = true;
    this.resetSeries();
  }

  /** Scheduling restarts from now; missed questions are not replayed. */
  resume(): void {
    if (!this.suspended) {
      return;
    }

    this.suspended = false;
    if (this.enabled && this.hasStarted) {
      this.scheduleNext();
    }
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  private setSchedule(useFixedSchedule: boolean, slots: readonly DailyReviewSlot[]): void {
    const validated = validateDailySlots(slots, useFixedSchedule);
    const unchanged = this.useFixedSchedule === useFixedSchedule
      && this.dailySlots.length === validated.length
      && this.dailySlots.every((slot, index) =>
        slot.time === validated[index]!.time && slot.questions === validated[index]!.questions);
    if (unchanged) {
      return;
    }

    this.useFixedSchedule = useFixedSchedule;
    this.dailySlots = validated;
    if (!this.seriesActive) {
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    if (this.useFixedSchedule) {
      const next = nextDailySlot(this.dailySlots, this.now());
      this.nextAt = next.at;
      this.nextSlotQuestions = next.questions;
    } else {
      this.nextAt = this.now() + this.intervalMs;
    }
  }

  private resetSeries(): void {
    this.seriesActive = false;
    this.seriesTarget = 0;
    this.presentedInSeries = 0;
  }
}

function validInterval(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new RangeError('L’intervalle doit être d’au moins 1 minute.');
  }

  return minutes * MINUTE;
}

function validQuestions(questions: number): number {
  if (!Number.isSafeInteger(questions) || questions < 1) {
    throw new RangeError('Le nombre de questions par série doit être positif.');
  }

  return questions;
}
