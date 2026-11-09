// Status texts of the assistant, shared by the home page and the countdown item of the menus
// (v1 MainWindow.Assistant "next series" line).
import type { Language } from '../core/settings';
import type { AssistantView } from './ipc';
import { format, formatCountdown, text } from './i18n/i18n';

export function assistantStateText(language: Language, assistant: AssistantView): string {
  if (assistant.teamsMeeting) {
    return text(language, 'AssistantPausedForTeams');
  }

  return text(language, assistant.active ? 'AssistantRunning' : 'AssistantStopped');
}

/** Line describing the next question; checked in the v1 order. */
export function nextQuestionText(language: Language, assistant: AssistantView, hasReviewableCards: boolean, now: number): string {
  if (assistant.teamsMeeting) {
    return text(language, 'AssistantPausedForTeams');
  }

  if (!hasReviewableCards) {
    return text(language, 'SelectPackageForReview');
  }

  if (!assistant.active) {
    return text(language, 'AssistantStopped');
  }

  return activeAssistantText(language, assistant, now);
}

/** Countdown item of the companion and tray menus; null when the assistant is not running. */
export function countdownMenuText(language: Language, assistant: AssistantView, hasReviewableCards: boolean, now: number): string | null {
  return assistant.active && !assistant.teamsMeeting && hasReviewableCards ? activeAssistantText(language, assistant, now) : null;
}

function activeAssistantText(language: Language, assistant: AssistantView, now: number): string {
  if (assistant.questionDisplayed) {
    return assistant.series && !assistant.manualInProgress
      ? format(language, 'SeriesInProgress', assistant.series.presented + 1, assistant.series.target)
      : text(language, 'ManualReviewInProgress');
  }

  if (assistant.series) {
    return text(language, 'NextSeriesQuestionAvailable');
  }

  if (assistant.nextPresentationAt <= now) {
    return text(language, 'NextSeriesAvailable');
  }

  return format(language, 'NextQuestionScheduled', formatCountdown(assistant.nextPresentationAt - now));
}
