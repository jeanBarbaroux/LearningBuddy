// QCM answer choices (v1 CardChoices).
import { LocalizedError } from '../errors';
import type { CardChoice, CardType } from '../model';
import { foldCase, hasLengthBetween } from '../text';

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 10;
export const MAX_CHOICE_LENGTH = 500;

/** Trims and checks the choices of a card; throws a LocalizedError with the reason. */
export function normalizeChoices(type: CardType, choices: readonly CardChoice[], path?: string): CardChoice[] {
  if (type === 'card') {
    if (choices.length > 0) {
      throw new LocalizedError('ParserChoicesOnlyForQcm', [], path);
    }

    return [];
  }

  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    throw new LocalizedError('ParserChoiceCount', [MIN_CHOICES, MAX_CHOICES], path);
  }

  const seen = new Set<string>();
  const normalized = choices.map((choice) => {
    const text = choice.text.trim();
    if (!hasLengthBetween(text, 1, MAX_CHOICE_LENGTH)) {
      throw new LocalizedError('ParserChoiceLength', [MAX_CHOICE_LENGTH], path);
    }

    if (seen.has(foldCase(text))) {
      throw new LocalizedError('ParserChoiceDuplicate', [], path);
    }

    seen.add(foldCase(text));
    return { text, correct: choice.correct };
  });

  if (!normalized.some((choice) => choice.correct)) {
    throw new LocalizedError('ParserChoiceNoCorrect', [], path);
  }

  return normalized;
}

/** Answer of a QCM whose author did not write one: the correct choices, one per line. */
export function deriveAnswer(choices: readonly CardChoice[]): string {
  return choices.filter((choice) => choice.correct).map((choice) => choice.text).join('\n');
}

/** Whether the author wrote an answer that differs from the correct choices. */
export function hasCustomAnswer(answer: string, choices: readonly CardChoice[]): boolean {
  return answer.trim() !== '' && answer.trim() !== deriveAnswer(choices).trim();
}

/** One correct choice is answered with radio buttons, several with check boxes. */
export function allowsMultipleAnswers(choices: readonly CardChoice[]): boolean {
  return choices.filter((choice) => choice.correct).length > 1;
}

const EDITOR_LINE = /^\[(x|X| )?\]\s*(.*)$/;

/**
 * Reads the card editor format: one choice per line, "[x] text" for a correct choice,
 * "[ ] text", "[] text" or plain text otherwise. Blank lines are ignored.
 */
export function parseChoicesText(value: string): CardChoice[] {
  return value
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const trimmed = line.trim();
      const match = EDITOR_LINE.exec(trimmed);
      return match
        ? { text: match[2]!, correct: match[1]?.toLowerCase() === 'x' }
        : { text: trimmed, correct: false };
    });
}

export function formatChoicesText(choices: readonly CardChoice[]): string {
  return choices.map((choice) => `${choice.correct ? '[x]' : '[ ]'} ${choice.text}`).join('\n');
}

export type ChoiceEvaluation = 'correctSelected' | 'incorrectSelected' | 'correctMissed' | 'incorrectNotSelected';

/** Indicative correction shown after reveal; only the self-assessment is recorded. */
export function evaluateChoice(choice: CardChoice, selected: boolean): ChoiceEvaluation {
  if (choice.correct) {
    return selected ? 'correctSelected' : 'correctMissed';
  }

  return selected ? 'incorrectSelected' : 'incorrectNotSelected';
}
