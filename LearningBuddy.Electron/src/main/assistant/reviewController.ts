// Orchestrates the review assistant (v1 MainWindow.Assistant/Reviews/Teams): automatic series, manual
// questions, the invitation shown while the companion is hidden, Teams meetings, sleep and session lock.
// It does not depend on Electron so that it can be unit tested; windows are reached through the host.
import { reactionForOutcome, type CompanionReaction } from '../../core/companion/avatarStoryboard';
import { imageDataUrl } from '../../core/cards/images';
import { LocalizedError, type LocalizedMessage } from '../../core/errors';
import { RATING_OUTCOMES, type Card, type RatingOutcome, type ReviewOutcome } from '../../core/model';
import { AssistantSession } from '../../core/review/assistantSession';
import { calculateNextLevel, selectNextCard } from '../../core/review/reviewScheduler';
import type { AssistantView, BubbleCardView, BubbleView } from '../../shared/ipc';
import type { PackageService } from '../services/packageService';
import type { ReviewService } from '../services/reviewService';
import type { SettingsService } from '../services/settingsService';

export interface ReviewControllerHost {
  showBubble(view: BubbleView): void;
  closeBubble(): void;
  showInvitation(snoozeMinutes: number): void;
  closeInvitation(): void;
  readonly companionVisible: boolean;
  setCompanionVisible(visible: boolean): void;
  playReaction(reaction: CompanionReaction): void;
  /** Something visible changed: windows, tray and companion must refresh. */
  stateChanged(): void;
  showError(message: LocalizedMessage): void;
}

interface Presentation {
  readonly cardId: string;
  /** Null for the preview of the Avatar page, which records nothing. */
  readonly eventId: string | null;
  readonly manual: boolean;
}

export class ReviewController {
  readonly session: AssistantSession;
  private presentation: Presentation | null = null;
  private messageDisplayed = false;
  private invitationDisplayed = false;
  private snoozedUntil = 0;
  private lastCardId: string | null = null;
  private readonly seriesCardIds = new Set<string>();
  private locked = false;
  private teamsMeeting = false;
  private teamsCheckPending: boolean;
  private teamsDetectionFailed = false;
  private companionVisibleBeforeMeeting = true;

  constructor(
    private readonly settings: SettingsService,
    private readonly packages: PackageService,
    private readonly reviews: ReviewService,
    private readonly host: ReviewControllerHost,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    const current = settings.current;
    this.session = new AssistantSession(now, current.assistantEnabled && packages.hasReviewableCards(), current);
    this.teamsCheckPending = current.pauseDuringTeamsMeetings;
  }

  // -------------------------------------------------------------------------------------------------
  // State

  get questionDisplayed(): boolean {
    return this.presentation !== null;
  }

  get isInvitationDisplayed(): boolean {
    return this.invitationDisplayed;
  }

  get isPreviewDisplayed(): boolean {
    return this.presentation?.eventId === null;
  }

  get isTeamsMeeting(): boolean {
    return this.teamsMeeting;
  }

  /** The companion sleeps while the assistant is not active (paused, Teams meeting or sleep). */
  get companionPaused(): boolean {
    return !this.session.isActive;
  }

  get view(): AssistantView {
    return {
      enabled: this.session.isEnabled,
      active: this.session.isActive,
      teamsMeeting: this.teamsMeeting,
      teamsCheckPending: this.teamsCheckPending,
      teamsDetectionFailed: this.teamsDetectionFailed,
      questionDisplayed: this.presentation !== null && this.presentation.eventId !== null,
      manualInProgress: this.session.isManualPresentationInProgress,
      series: this.session.seriesProgress,
      canPresentNow: this.session.canPresent(),
      canPresentManually: !this.teamsCheckPending && this.session.canPresentManually() && this.presentation === null,
      nextPresentationAt: this.session.nextPresentationAt,
    };
  }

  // -------------------------------------------------------------------------------------------------
  // Commands

  /** "Démarrer l’assistant": the first question is presented right away. */
  start(): void {
    if (this.teamsMeeting || this.teamsCheckPending) {
      return;
    }

    if (!this.packages.hasReviewableCards()) {
      throw new LocalizedError('SelectPackageForReview');
    }

    this.settings.update({ assistantEnabled: true });
    this.session.start();
    this.tick();
    this.host.stateChanged();
  }

  pause(): void {
    this.closePresentation('noResult');
    this.dismissInvitation();
    this.session.pause();
    this.seriesCardIds.clear();
    if (this.settings.current.assistantEnabled) {
      this.settings.update({ assistantEnabled: false });
    }

    this.host.stateChanged();
  }

  /** Called after the stored preferences changed outside of the controller (deleted package…). */
  synchronizeWithSettings(): void {
    const settings = this.settings.current;
    this.session.updateSchedule(settings);
    if (!settings.assistantEnabled && this.session.isEnabled) {
      this.pause();
    }
  }

  /** "Présenter une question" or a click on the companion: a question outside of any series. */
  presentManually(): void {
    if (this.teamsCheckPending || this.presentation || !this.session.canPresentManually()) {
      return;
    }

    const card = this.selectCard(false);
    if (!card) {
      this.showMessage({ key: 'ReviewCompleted' }, { key: 'NoCardDue' });
      return;
    }

    if (this.session.beginManualPresentation()) {
      this.open(card, true);
    }
  }

  /** Called every second by the application. */
  tick(): void {
    if (this.locked || this.teamsCheckPending) {
      return;
    }

    if (!this.host.companionVisible) {
      this.updateInvitation();
      return;
    }

    this.dismissInvitation();
    if (!this.presentation && !this.messageDisplayed && this.session.canPresent()) {
      this.presentAutomatically();
    }
  }

  answer(outcome: ReviewOutcome): void {
    const presentation = this.presentation;
    if (!presentation) {
      this.dismissMessage();
      return;
    }

    this.presentation = null;
    this.host.closeBubble();
    if (presentation.eventId === null) {
      this.host.stateChanged();
      return;
    }

    try {
      this.reviews.completePresentation(presentation.eventId, outcome);
    } catch (error) {
      this.session.cancelPresentation();
      this.handleStorageError(error);
      return;
    }

    this.lastCardId = presentation.cardId;
    const reaction = reactionForOutcome(outcome);
    if (reaction) {
      this.host.playReaction(reaction);
    }

    if (!presentation.manual) {
      this.seriesCardIds.add(presentation.cardId);
    }

    const hasMore = outcome !== 'noResult' && this.selectCard(true) !== null;
    const seriesEnded = this.session.completePresentation(hasMore);
    if (seriesEnded) {
      this.seriesCardIds.clear();
      if (this.settings.current.autoHideCompanionAfterSeries) {
        this.host.setCompanionVisible(false);
      }
    }

    this.host.stateChanged();
  }

  /** Closing the bubble without a self-assessment records "no result". */
  close(): void {
    if (this.presentation) {
      this.answer('noResult');
    } else {
      this.dismissMessage();
    }
  }

  /** The companion is being hidden: the open question ends without result. */
  onCompanionHiding(): void {
    this.closePresentation('noResult');
  }

  onCompanionShown(): void {
    this.dismissInvitation();
  }

  // Invitation buttons -------------------------------------------------------------------------------

  /** "Afficher": brings the companion back; the next tick presents the question. */
  acceptInvitation(): void {
    this.dismissInvitation();
    this.host.setCompanionVisible(true);
    this.tick();
  }

  snoozeInvitation(): void {
    this.snoozedUntil = this.now() + this.settings.current.snoozeMinutes * 60_000;
    this.dismissInvitation();
  }

  // Card changes -------------------------------------------------------------------------------------

  /** The card shown in the bubble was edited: its content is refreshed. */
  onCardUpdated(cardId: string): void {
    if (this.presentation?.cardId === cardId && this.presentation.eventId !== null) {
      const card = this.packages.findCard(cardId);
      if (card) {
        this.host.showBubble(this.bubbleView(card, false));
      }
    }
  }

  /** Cards were deleted: a bubble showing one of them is closed. */
  onCardsDeleted(): void {
    const presentation = this.presentation;
    if (presentation && presentation.eventId !== null && !this.packages.findCard(presentation.cardId)) {
      this.presentation = null;
      this.host.closeBubble();
      this.session.completePresentation(false);
      this.seriesCardIds.clear();
      this.host.stateChanged();
    }
  }

  // Avatar page preview ----------------------------------------------------------------------------

  toggleBubblePreview(sample: Card): void {
    if (this.isPreviewDisplayed) {
      this.answer('noResult');
      return;
    }

    if (this.presentation || this.messageDisplayed) {
      throw new LocalizedError('BubblePreviewUnavailable');
    }

    this.presentation = { cardId: sample.id, eventId: null, manual: true };
    this.host.showBubble(this.bubbleView(sample, true));
    this.host.stateChanged();
  }

  /** The bubble size changed: a preview is re-rendered with its new scale. */
  refreshBubble(sample: Card): void {
    if (this.isPreviewDisplayed) {
      this.host.showBubble(this.bubbleView(sample, true));
    } else if (this.presentation) {
      this.onCardUpdated(this.presentation.cardId);
    }
  }

  // System events ------------------------------------------------------------------------------------

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.dismissInvitation();
    }
  }

  suspendForSleep(): void {
    this.closePresentation('noResult');
    this.session.suspend();
    this.seriesCardIds.clear();
    this.host.stateChanged();
  }

  resumeFromSleep(): void {
    if (!this.teamsMeeting) {
      this.session.resume();
    }

    this.host.stateChanged();
  }

  /** Result of a Teams check; null means the detection failed and the last known state is kept. */
  setTeamsMeeting(inMeeting: boolean | null): void {
    const firstCheck = this.teamsCheckPending;
    this.teamsCheckPending = false;
    this.teamsDetectionFailed = inMeeting === null;
    if (inMeeting !== null && inMeeting !== this.teamsMeeting) {
      this.teamsMeeting = inMeeting;
      if (inMeeting) {
        this.companionVisibleBeforeMeeting = this.host.companionVisible;
        this.closePresentation('noResult');
        this.dismissInvitation();
        this.session.suspend();
        this.seriesCardIds.clear();
        this.host.setCompanionVisible(false);
      } else {
        this.session.resume();
        this.host.setCompanionVisible(this.companionVisibleBeforeMeeting);
      }
    }

    if (firstCheck || inMeeting !== null) {
      this.host.stateChanged();
    }
  }

  /** Teams pausing was turned off: any meeting pause ends. */
  disableTeamsDetection(): void {
    this.teamsCheckPending = false;
    this.teamsDetectionFailed = false;
    this.setTeamsMeeting(false);
    this.host.stateChanged();
  }

  // -------------------------------------------------------------------------------------------------

  private presentAutomatically(): void {
    const card = this.selectCard(true);
    if (!card) {
      this.session.endSeries();
      this.seriesCardIds.clear();
      this.host.stateChanged();
      return;
    }

    if (this.session.beginPresentation()) {
      this.open(card, false);
    }
  }

  private open(card: Card, manual: boolean): void {
    let eventId: string;
    try {
      eventId = this.reviews.beginPresentation(card.id);
    } catch (error) {
      this.session.cancelPresentation();
      this.handleStorageError(error);
      return;
    }

    this.presentation = { cardId: card.id, eventId, manual };
    this.dismissInvitation();
    if (!this.host.companionVisible) {
      this.host.setCompanionVisible(true);
    }

    this.host.showBubble(this.bubbleView(card, false));
    this.host.stateChanged();
  }

  private selectCard(excludeSeriesCards: boolean): Card | null {
    const candidates = this.packages.reviewCandidates();
    const percentages = this.settings.current.packagePercentages;
    const state = selectNextCard(candidates.states, {
      packageIdsByCardId: candidates.packageIdsByCardId,
      lastCardId: this.lastCardId,
      excludedCardIds: excludeSeriesCards ? this.seriesCardIds : new Set(),
      percentages,
      random: this.random,
    });
    return state ? this.packages.findCard(state.cardId) : null;
  }

  private bubbleView(card: Card, preview: boolean): BubbleView {
    const level = preview ? 0 : this.reviews.stateOf(card.id).level;
    const nextLevels = Object.fromEntries(RATING_OUTCOMES.map((outcome) =>
      [outcome, calculateNextLevel(level, outcome)])) as Record<RatingOutcome, number>;
    const view: BubbleCardView = {
      id: card.id,
      type: card.type,
      question: card.question,
      answer: card.answer,
      explanation: card.explanation,
      choices: card.choices,
      imageDataUrl: imageDataUrl(card.image),
      answerImageDataUrl: imageDataUrl(card.answerImage),
      level,
      nextLevels,
    };
    const selected = this.settings.current.reviewPackageIds;
    const packageName = !preview && selected.length > 1 ? this.packages.findPackage(card.packageId)?.name ?? null : null;
    return { kind: 'card', preview, card: view, packageName };
  }

  private closePresentation(outcome: ReviewOutcome): void {
    if (this.presentation) {
      this.answer(outcome);
    }

    this.dismissMessage();
  }

  private updateInvitation(): void {
    const shouldShow = this.now() >= this.snoozedUntil
      && !this.presentation
      && !this.messageDisplayed
      && !this.teamsMeeting
      && this.session.canPresent()
      && this.selectCard(true) !== null;
    if (shouldShow && !this.invitationDisplayed) {
      this.invitationDisplayed = true;
      this.host.showInvitation(this.settings.current.snoozeMinutes);
      this.host.stateChanged();
    } else if (!shouldShow) {
      this.dismissInvitation();
    }
  }

  private dismissInvitation(): void {
    if (this.invitationDisplayed) {
      this.invitationDisplayed = false;
      this.host.closeInvitation();
      this.host.stateChanged();
    }
  }

  private showMessage(title: LocalizedMessage, message: LocalizedMessage): void {
    this.messageDisplayed = true;
    this.host.showBubble({ kind: 'message', title, message });
  }

  private dismissMessage(): void {
    if (this.messageDisplayed) {
      this.messageDisplayed = false;
      this.host.closeBubble();
    }
  }

  /** A storage failure pauses the assistant and is reported to the user (v1 behaviour). */
  private handleStorageError(error: unknown): void {
    this.presentation = null;
    this.host.closeBubble();
    this.session.pause();
    this.seriesCardIds.clear();
    this.host.showError(error instanceof LocalizedError ? error.localized : { key: 'ReviewResultNotSaved' });
    this.host.stateChanged();
  }
}
