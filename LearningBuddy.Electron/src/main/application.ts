// Composition root: creates the services, the review controller and the windows, and implements the
// commands called by the IPC router, the tray and the companion menu.
import { app, BrowserWindow, dialog, nativeTheme, powerMonitor, shell } from 'electron';
import path from 'node:path';
import type { CompanionReaction } from '../core/companion/avatarStoryboard';
import { LocalizedError, type LocalizedMessage } from '../core/errors';
import type { Card, CardContent, ReviewOutcome } from '../core/model';
import { exportFileName } from '../core/packages/packageFormat';
import { validateDailySlots } from '../core/review/dailySchedule';
import { isIntegerIn, SettingsLimits, type CompanionPosition, type Language } from '../core/settings';
import { countdownMenuText } from '../shared/assistantStatus';
import { text, translate } from '../shared/i18n/i18n';
import {
  Push,
  type AppStateView,
  type BubbleView,
  type CardRow,
  type FileActionResult,
  type ImportPreview,
  type LibraryEntryView,
  type PreferencesPatch,
  type RhythmSettings,
  type StatisticsQuery,
  type StatisticsView,
  type UiPreferences,
} from '../shared/ipc';
import { ReviewController, type ReviewControllerHost } from './assistant/reviewController';
import {
  ASSISTANT_TICK_MS,
  defaultPackagesDirectory,
  teamsDetectionAllowed,
  WANDER_TICK_MS,
} from './config';
import { DataStore } from './data/dataStore';
import { describeError, toLocalizedMessage } from './errors';
import { LibraryService } from './services/libraryService';
import { PackageFiles } from './services/packageFiles';
import { PackageService, type CardWithLevel } from './services/packageService';
import { ReviewService } from './services/reviewService';
import { SettingsService } from './services/settingsService';
import { StatisticsService } from './services/statisticsService';
import { applyStartupRegistration } from './system/startupRegistration';
import { TeamsMeetingDetector } from './system/teamsMeetingDetector';
import { TrayController, type TrayHost } from './tray';
import { ImageWindow, InvitationWindow } from './windows/auxiliaryWindows';
import { BubbleWindow } from './windows/bubbleWindow';
import { CompanionWindow, type CompanionWindowHost } from './windows/companionWindow';
import { MainWindow, type MainWindowHost } from './windows/mainWindow';

export interface ApplicationOptions {
  readonly dataDirectory: string;
  /** Started by Windows at session start: the main window stays hidden. */
  readonly background: boolean;
}

export class LearningBuddyApplication implements ReviewControllerHost, TrayHost, MainWindowHost, CompanionWindowHost {
  private readonly store: DataStore;
  private readonly settingsService: SettingsService;
  private readonly packages: PackageService;
  private readonly reviews: ReviewService;
  private readonly statistics: StatisticsService;
  private readonly library: LibraryService;
  private readonly files: PackageFiles;
  readonly controller: ReviewController;
  private readonly tray: TrayController;
  private readonly teams: TeamsMeetingDetector;
  private mainWindow!: MainWindow;
  private companion!: CompanionWindow;
  private bubble!: BubbleWindow;
  private readonly invitation = new InvitationWindow();
  private readonly imageWindow = new ImageWindow();
  private quitting = false;
  private companionShown = false;
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(private readonly options: ApplicationOptions) {
    this.store = new DataStore(options.dataDirectory);
    this.settingsService = new SettingsService(this.store);
    this.packages = new PackageService(this.store);
    this.reviews = new ReviewService(this.store);
    this.statistics = new StatisticsService(this.store);
    this.library = new LibraryService(defaultPackagesDirectory());
    this.files = new PackageFiles(() => this.mainWindow?.window ?? null, () => this.language);
    this.controller = new ReviewController(this.settingsService, this.packages, this.reviews, this);
    this.tray = new TrayController(this);
    this.teams = new TeamsMeetingDetector((inMeeting) => this.controller.setTeamsMeeting(inMeeting));
  }

  start(): void {
    const settings = this.settingsService.current;
    this.reviews.closeOpenPresentations();
    this.applyStartupRegistrationQuietly(settings.launchAtStartup);
    nativeTheme.themeSource = settings.theme;
    nativeTheme.on('updated', () => this.broadcastUiPreferences());

    this.mainWindow = new MainWindow(this);
    this.companion = new CompanionWindow(this, settings.avatarSizePercent, settings.companionPosition);
    this.bubble = new BubbleWindow(settings.bubbleSizePercent, () => this.controller.close());
    this.companion.window.webContents.once('did-finish-load', () => {
      if (!this.controller.isTeamsMeeting) {
        this.setCompanionVisible(true);
      }
    });
    this.tray.create();
    this.configureTeamsDetection(settings.pauseDuringTeamsMeetings);
    if (!this.options.background) {
      this.mainWindow.window.once('ready-to-show', () => this.mainWindow.show());
    }

    this.timers.push(setInterval(() => this.controller.tick(), ASSISTANT_TICK_MS));
    this.timers.push(setInterval(() => this.companion.wanderTick(), WANDER_TICK_MS));
    powerMonitor.on('lock-screen', () => this.controller.setLocked(true));
    powerMonitor.on('unlock-screen', () => this.controller.setLocked(false));
    powerMonitor.on('suspend', () => this.controller.suspendForSleep());
    powerMonitor.on('resume', () => this.controller.resumeFromSleep());
  }

  /** Ends the open question without result, then closes every window. */
  prepareQuit(): void {
    if (this.quitting) {
      return;
    }

    this.quitting = true;
    this.timers.forEach(clearInterval);
    this.teams.stop();
    try {
      this.controller.close();
    } catch (error) {
      console.error('Fermeture de la révision :', describeError(error));
    }

    this.companion.closable = true;
    this.bubble.destroy();
    this.invitation.destroy();
    this.imageWindow.destroy();
    this.tray.destroy();
  }

  get isQuitting(): boolean {
    return this.quitting;
  }

  get language(): Language {
    return this.settingsService.current.language;
  }

  // -------------------------------------------------------------------------------------------------
  // State sent to the windows

  getState(): AppStateView {
    const settings = this.settingsService.current;
    const selected = new Set(settings.reviewPackageIds);
    const packages = this.packages.listSummaries().map(({ package: record, cardCount }) => ({
      id: record.id, name: record.name, cardCount, updatedAt: record.updatedAt, selected: selected.has(record.id),
    }));
    return {
      settings,
      ui: this.uiPreferences(),
      assistant: this.controller.view,
      companionVisible: this.companionShown,
      bubblePreviewOpen: this.controller.isPreviewDisplayed,
      packages,
      reviewPackages: settings.reviewPackageIds
        .map((id) => packages.find((summary) => summary.id === id))
        .filter((summary) => summary !== undefined),
      hasReviewableCards: this.packages.hasReviewableCards(),
    };
  }

  uiPreferences(): UiPreferences {
    return { language: this.language, theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' };
  }

  stateChanged(): void {
    this.mainWindow?.send(Push.stateChanged, this.getState());
    this.companion?.sendState();
  }

  private broadcastUiPreferences(): void {
    const preferences = this.uiPreferences();
    this.stateChanged();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(Push.uiPreferences, preferences);
    }
  }

  // -------------------------------------------------------------------------------------------------
  // Assistant and companion commands

  startAssistant(): void {
    this.controller.start();
  }

  pauseAssistant(): void {
    this.controller.pause();
  }

  toggleAssistant(): void {
    try {
      if (this.controller.session.isActive) {
        this.controller.pause();
      } else {
        this.controller.start();
      }
    } catch (error) {
      this.showError(toLocalizedMessage(error), 'ActivationFailed');
    }
  }

  presentNow(): void {
    this.controller.presentManually();
  }

  get assistantActive(): boolean {
    return this.controller.session.isActive;
  }

  get companionVisible(): boolean {
    return this.companionShown;
  }

  get canShowCompanion(): boolean {
    return !this.controller.isTeamsMeeting;
  }

  get wanderingEnabled(): boolean {
    return this.settingsService.current.companionWanderingEnabled;
  }

  countdownText(): string | null {
    return countdownMenuText(this.language, this.controller.view, this.packages.hasReviewableCards(), Date.now());
  }

  setCompanionVisible(visible: boolean): void {
    if (visible === this.companionShown || (visible && this.controller.isTeamsMeeting && !this.quitting)) {
      return;
    }

    if (!visible) {
      this.controller.onCompanionHiding();
    }

    this.companionShown = visible;
    this.companion.setVisible(visible);
    if (visible) {
      this.controller.onCompanionShown();
    }

    this.stateChanged();
  }

  setWandering(enabled: boolean): void {
    this.settingsService.update({ companionWanderingEnabled: enabled });
    if (!enabled) {
      this.companion.resetWanderer();
    }

    this.stateChanged();
  }

  showMainWindow(): void {
    this.mainWindow.show();
  }

  quit(): void {
    app.quit();
  }

  // CompanionWindowHost ------------------------------------------------------------------------------

  companionConditions(): { paused: boolean; questionDisplayed: boolean; invitationDisplayed: boolean; wanderingAllowed: boolean } {
    return {
      paused: this.controller.companionPaused,
      questionDisplayed: this.controller.questionDisplayed,
      invitationDisplayed: this.controller.isInvitationDisplayed,
      wanderingAllowed: this.settingsService.current.companionWanderingEnabled,
    };
  }

  savePosition(position: CompanionPosition): void {
    try {
      this.settingsService.update({ companionPosition: position });
    } catch (error) {
      console.error('Position du compagnon :', describeError(error));
    }
  }

  moved(): void {
    this.bubble?.followCompanion(this.companion.bounds);
  }

  companionClick(): void {
    if (!this.controller.questionDisplayed && !this.controller.isInvitationDisplayed) {
      this.controller.presentManually();
    }
  }

  companionContextMenu(): void {
    this.tray.showCompanionMenu(this.companion.window);
  }

  get companionWindow(): CompanionWindow {
    return this.companion;
  }

  get bubbleWindow(): BubbleWindow {
    return this.bubble;
  }

  // ReviewControllerHost -----------------------------------------------------------------------------

  showBubble(view: BubbleView): void {
    this.bubble.show(view, this.companion.bounds);
    this.companion.sendState();
  }

  closeBubble(): void {
    this.bubble.close();
    this.imageWindow.close();
    this.companion?.sendState();
  }

  showInvitation(snoozeMinutes: number): void {
    this.invitation.show({ snoozeMinutes });
  }

  closeInvitation(): void {
    this.invitation.close();
  }

  playReaction(reaction: CompanionReaction): void {
    this.companion.playReaction(reaction);
  }

  showError(message: LocalizedMessage, title: Parameters<typeof text>[1] = 'SaveErrorTitle'): void {
    const options: Electron.MessageBoxOptions = {
      type: 'error',
      title: text(this.language, title),
      message: translate(this.language, message),
    };
    void (this.mainWindow?.window.isVisible() ? dialog.showMessageBox(this.mainWindow.window, options) : dialog.showMessageBox(options));
  }

  // MainWindowHost -----------------------------------------------------------------------------------

  hiddenToTray(): void {
    if (!this.settingsService.current.backgroundNoticeShown) {
      this.tray.notify(text(this.language, 'RunningInBackground'));
      this.updateSettingsQuietly({ backgroundNoticeShown: true });
    }
  }

  // -------------------------------------------------------------------------------------------------
  // Preferences

  updatePreferences(patch: PreferencesPatch): void {
    const previous = this.settingsService.current;
    const settings = this.settingsService.update(patch);
    if (patch.launchAtStartup !== undefined && patch.launchAtStartup !== previous.launchAtStartup) {
      try {
        applyStartupRegistration(settings.launchAtStartup);
      } catch (error) {
        this.settingsService.update({ launchAtStartup: previous.launchAtStartup });
        throw new LocalizedError('StartupRegistrationFailure', [describeError(error)]);
      }
    }

    if (patch.theme !== undefined) {
      nativeTheme.themeSource = settings.theme;
    }

    if (patch.pauseDuringTeamsMeetings !== undefined && patch.pauseDuringTeamsMeetings !== previous.pauseDuringTeamsMeetings) {
      this.configureTeamsDetection(settings.pauseDuringTeamsMeetings);
    }

    if (patch.avatarSizePercent !== undefined) {
      this.companion.setSizePercent(settings.avatarSizePercent);
    }

    if (patch.bubbleSizePercent !== undefined) {
      this.bubble.setSizePercent(settings.bubbleSizePercent);
      this.controller.refreshBubble(this.previewCard());
    }

    if (patch.language !== undefined || patch.theme !== undefined) {
      this.broadcastUiPreferences();
    } else {
      this.stateChanged();
    }
  }

  /** "Votre rythme": the other mode keeps its stored values (v1). */
  saveRhythm(rhythm: RhythmSettings): void {
    const current = this.settingsService.current;
    if (!isIntegerIn(rhythm.snoozeMinutes, SettingsLimits.minSnoozeMinutes, SettingsLimits.maxSnoozeMinutes)) {
      throw new LocalizedError('InvalidReviewSettingsMessage');
    }

    let patch;
    if (rhythm.useFixedSchedule) {
      try {
        validateDailySlots(rhythm.dailySlots, true);
      } catch {
        throw new LocalizedError('InvalidDailySchedule');
      }

      patch = { useFixedSchedule: true, dailySlots: rhythm.dailySlots, snoozeMinutes: rhythm.snoozeMinutes };
    } else {
      const valid = isIntegerIn(rhythm.intervalMinutes, SettingsLimits.minIntervalMinutes, SettingsLimits.maxIntervalMinutes)
        && isIntegerIn(rhythm.questionsPerSeries, SettingsLimits.minQuestionsPerSeries, SettingsLimits.maxQuestionsPerSeries);
      if (!valid) {
        throw new LocalizedError('InvalidReviewSettingsMessage');
      }

      patch = {
        useFixedSchedule: false,
        intervalMinutes: rhythm.intervalMinutes,
        questionsPerSeries: rhythm.questionsPerSeries,
        snoozeMinutes: rhythm.snoozeMinutes,
        dailySlots: current.dailySlots,
      };
    }

    this.settingsService.update(patch);
    this.controller.synchronizeWithSettings();
    this.stateChanged();
  }

  // -------------------------------------------------------------------------------------------------
  // Packages and cards

  importPackageFile(): Promise<ImportPreview | null> {
    return this.files.chooseImport();
  }

  createImportedPackage(name: string, cards: readonly CardContent[]): string {
    const record = this.packages.createPackage(name, cards, null);
    this.stateChanged();
    return record.id;
  }

  saveTemplate(): Promise<FileActionResult> {
    return this.files.saveTemplate();
  }

  exportPackage(id: string): Promise<FileActionResult> {
    const exported = this.packages.exportPackage(id);
    return this.files.saveExport(exportFileName(exported.name), exported.json);
  }

  renamePackage(id: string, name: string): void {
    this.packages.rename(id, name);
    this.stateChanged();
  }

  deletePackage(id: string): void {
    this.packages.deletePackage(id);
    this.afterCardsDeleted();
  }

  setPackageSelected(id: string, selected: boolean): void {
    this.packages.setSelected(id, selected);
    this.controller.synchronizeWithSettings();
    this.stateChanged();
  }

  setPackagePercentages(percentages: Record<string, number>): void {
    this.packages.setPercentages(percentages);
    this.stateChanged();
  }

  listCards(packageId: string): CardRow[] {
    return this.packages.cardsWithLevel(packageId).map(toCardRow);
  }

  getCard(cardId: string): CardRow {
    const card = this.packages.getCard(cardId);
    return toCardRow({ ...card, level: this.reviews.stateOf(cardId).level });
  }

  addCard(packageId: string, content: CardContent): string {
    const card = this.packages.addCard(packageId, content);
    this.stateChanged();
    return card.id;
  }

  updateCard(cardId: string, content: CardContent, level: number | null): void {
    this.packages.updateCard(cardId, content, level);
    this.controller.onCardUpdated(cardId);
    this.stateChanged();
  }

  deleteCard(cardId: string): void {
    this.packages.deleteCard(cardId);
    this.afterCardsDeleted();
  }

  chooseCardImage(): Promise<string | null> {
    return this.files.chooseImage();
  }

  /** "Modifier la carte" in the bubble: the editor opens in the main window. */
  editCardFromBubble(cardId: string): void {
    if (this.packages.findCard(cardId)) {
      this.mainWindow.show();
      this.mainWindow.send(Push.openCardEditor, cardId);
    }
  }

  private afterCardsDeleted(): void {
    this.controller.onCardsDeleted();
    this.controller.synchronizeWithSettings();
    this.stateChanged();
  }

  // -------------------------------------------------------------------------------------------------
  // Library and statistics

  async listLibrary(): Promise<LibraryEntryView[]> {
    const entries = await this.library.load();
    this.packages.linkLibraryEntries(entries.map((entry) => ({ id: entry.id, title: entry.content.title })));
    return entries.map((entry) => ({
      id: entry.id,
      title: entry.content.title,
      cardCount: entry.content.cards.length,
      downloaded: this.packages.isLibraryEntryDownloaded(entry.id),
    }));
  }

  async getLibraryCards(id: string): Promise<readonly CardContent[]> {
    return (await this.library.find(id)).content.cards;
  }

  /** Each library entry can be downloaded once, as long as its package exists. */
  async downloadLibraryPackage(id: string): Promise<string> {
    const entry = await this.library.find(id);
    if (!this.packages.isLibraryEntryDownloaded(id)) {
      this.packages.createPackage(entry.content.title, entry.content.cards, id);
      this.stateChanged();
    }

    return entry.content.title;
  }

  getStatistics(query: StatisticsQuery): StatisticsView {
    return this.statistics.build(query);
  }

  // -------------------------------------------------------------------------------------------------
  // Avatar page

  toggleBubblePreview(): void {
    this.controller.toggleBubblePreview(this.previewCard());
  }

  /** Sample card of the bubble preview, in the interface language. */
  private previewCard(): Card {
    return {
      id: 'preview',
      packageId: 'preview',
      position: 0,
      createdAt: 0,
      type: 'card',
      question: text(this.language, 'BubblePreviewQuestion'),
      answer: text(this.language, 'BubblePreviewAnswer'),
      explanation: text(this.language, 'BubblePreviewExplanation'),
      language: null,
      tags: [],
      choices: [],
      image: null,
      answerImage: null,
    };
  }

  // -------------------------------------------------------------------------------------------------
  // Bubble, invitation and image windows

  answer(outcome: ReviewOutcome): void {
    this.controller.answer(outcome);
  }

  closeBubbleWithoutResult(): void {
    this.controller.close();
  }

  showImage(dataUrl: string): void {
    const bounds = this.companion.bounds;
    this.imageWindow.show({ dataUrl }, { x: Math.round(bounds.x), y: Math.round(bounds.y) });
  }

  closeImage(): void {
    this.imageWindow.close();
  }

  acceptInvitation(): void {
    this.controller.acceptInvitation();
  }

  snoozeInvitation(): void {
    this.controller.snoozeInvitation();
  }

  // -------------------------------------------------------------------------------------------------

  private configureTeamsDetection(enabled: boolean): void {
    if (enabled && teamsDetectionAllowed()) {
      this.teams.start();
    } else {
      this.teams.stop();
      this.controller.disableTeamsDetection();
    }
  }

  private applyStartupRegistrationQuietly(enabled: boolean): void {
    try {
      applyStartupRegistration(enabled);
    } catch (error) {
      console.error('Lancement au démarrage :', describeError(error));
    }
  }

  private updateSettingsQuietly(patch: Parameters<SettingsService['update']>[0]): void {
    try {
      this.settingsService.update(patch);
    } catch (error) {
      console.error('Préférences :', describeError(error));
    }
  }
}

export function dataDirectory(): string {
  return path.join(app.getPath('userData'), 'data');
}

function toCardRow(card: CardWithLevel): CardRow {
  return {
    id: card.id,
    packageId: card.packageId,
    type: card.type,
    question: card.question,
    answer: card.answer,
    explanation: card.explanation,
    language: card.language,
    tags: card.tags,
    choices: card.choices,
    image: card.image,
    answerImage: card.answerImage,
    level: card.level,
  };
}
