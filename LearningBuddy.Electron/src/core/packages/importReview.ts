// Review of an imported file before the package is created (v1 PackageImportReview): the question and
// the answer of each card can be corrected, and cards can be excluded.
import { deriveAnswer } from '../cards/cardChoices';
import type { CardContent, PackageContent } from '../model';
import { hasLengthBetween, isBlank } from '../text';
import { MAX_PACKAGE_NAME_LENGTH } from './packageFormat';

export interface ImportCardDraft {
  /** The card as read from the file. */
  readonly original: CardContent;
  readonly question: string;
  readonly answer: string;
  readonly excluded: boolean;
}

export type ImportCardStatus = 'valid' | 'corrected' | 'excluded' | 'invalid';
export type ImportCardProblem = 'questionRequired' | 'answerRequired';

export interface ImportSummaryCounts {
  readonly total: number;
  /** Valid and corrected cards, which will be created. */
  readonly accepted: number;
  readonly valid: number;
  readonly corrected: number;
  readonly excluded: number;
  readonly invalid: number;
}

export function isValidPackageName(name: string): boolean {
  return hasLengthBetween(name.trim(), 1, MAX_PACKAGE_NAME_LENGTH);
}

export function createDrafts(content: PackageContent): ImportCardDraft[] {
  return content.cards.map((card) => ({ original: card, question: card.question, answer: card.answer, excluded: false }));
}

/** What prevents the card from being created, whether it is excluded or not. */
export function draftProblems(draft: ImportCardDraft): ImportCardProblem[] {
  const problems: ImportCardProblem[] = [];
  if (isBlank(draft.question) && draft.original.image === null) {
    problems.push('questionRequired');
  }

  if (isBlank(draft.answer) && draft.original.type !== 'qcm') {
    problems.push('answerRequired');
  }

  return problems;
}

export function draftStatus(draft: ImportCardDraft): ImportCardStatus {
  if (draft.excluded) {
    return 'excluded';
  }

  if (draftProblems(draft).length > 0) {
    return 'invalid';
  }

  return draft.question !== draft.original.question || draft.answer !== draft.original.answer ? 'corrected' : 'valid';
}

export function summarize(drafts: readonly ImportCardDraft[]): ImportSummaryCounts {
  const counts = { valid: 0, corrected: 0, excluded: 0, invalid: 0 };
  for (const draft of drafts) {
    counts[draftStatus(draft)] += 1;
  }

  return { ...counts, total: drafts.length, accepted: counts.valid + counts.corrected };
}

export function canConfirm(counts: ImportSummaryCounts): boolean {
  return counts.accepted > 0 && counts.invalid === 0;
}

/** Contents of the cards to create; a QCM whose answer was cleared gets the correct choices back. */
export function acceptedCards(drafts: readonly ImportCardDraft[]): CardContent[] {
  return drafts
    .filter((draft) => !draft.excluded)
    .map((draft) => ({
      ...draft.original,
      question: draft.question,
      answer: draft.original.type === 'qcm' && isBlank(draft.answer) ? deriveAnswer(draft.original.choices) : draft.answer,
    }));
}
