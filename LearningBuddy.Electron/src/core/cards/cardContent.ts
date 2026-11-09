// Validation and normalisation of card content before it is stored (v1 CardContentValidator).
import { LocalizedError, type MessageArgument } from '../errors';
import type { CardContent } from '../model';
import type { TextKey } from '../../shared/i18n/texts';
import { foldCase, hasLengthBetween, isBlank, trimToNull } from '../text';
import { isValidLanguageTag } from './bcp47';
import { deriveAnswer, normalizeChoices } from './cardChoices';
import { checkImage } from './images';

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 64;

export type CardField = 'question' | 'answer' | 'image' | 'answerImage' | 'language' | 'tags' | 'choices';

/** A card value that cannot be stored, with the field to highlight in the editor. */
export class CardValidationError extends LocalizedError {
  constructor(readonly field: CardField, key: TextKey, args: readonly MessageArgument[] = []) {
    super(key, args);
    this.name = 'CardValidationError';
  }
}

/**
 * Returns the content as it must be stored: trimmed tags and choices, null for blank optional texts and
 * the derived answer of a QCM without one. Throws a CardValidationError for the first invalid field.
 */
export function normalizeCardContent(content: CardContent): CardContent {
  for (const field of ['image', 'answerImage'] as const) {
    const image = content[field];
    if (image !== null && checkImage(image) !== null) {
      throw new CardValidationError(field, 'CardImageInvalid');
    }
  }

  if (isBlank(content.question) && content.image === null) {
    throw new CardValidationError('question', 'QuestionRequired');
  }

  let choices;
  try {
    choices = normalizeChoices(content.type, content.choices);
  } catch (error) {
    if (error instanceof LocalizedError) {
      throw new CardValidationError('choices', error.localized.key, error.localized.args);
    }

    throw error;
  }

  let answer = content.answer;
  if (isBlank(answer)) {
    if (content.type === 'card') {
      throw new CardValidationError('answer', 'AnswerRequired');
    }

    answer = deriveAnswer(choices);
  }

  const language = trimToNull(content.language);
  if (language !== null && !isValidLanguageTag(language)) {
    throw new CardValidationError('language', 'ParserInvalidLanguageTag');
  }

  return {
    type: content.type,
    question: content.question,
    answer,
    explanation: isBlank(content.explanation) ? null : content.explanation,
    language,
    tags: normalizeTags(content.tags),
    choices,
    image: content.image,
    answerImage: content.answerImage,
  };
}

/** Trims tags and removes case-insensitive duplicates, keeping the first occurrence. */
export function normalizeTags(tags: readonly string[]): string[] {
  if (tags.length > MAX_TAGS) {
    throw new CardValidationError('tags', 'ParserMaxTags', [MAX_TAGS]);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of tags) {
    const tag = value.trim();
    if (!hasLengthBetween(tag, 1, MAX_TAG_LENGTH)) {
      throw new CardValidationError('tags', 'ParserTagLength');
    }

    if (!seen.has(foldCase(tag))) {
      seen.add(foldCase(tag));
      result.push(tag);
    }
  }

  return result;
}
