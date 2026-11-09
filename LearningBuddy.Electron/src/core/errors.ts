// Errors carrying a translatable message, so that the main process and the renderers can display them
// in the interface language chosen by the user.
import type { TextKey } from '../shared/i18n/texts';

export type MessageArgument = string | number;

/** A message identified by its text key, with the values of its {0}, {1}… placeholders. */
export interface LocalizedMessage {
  readonly key: TextKey;
  readonly args?: readonly MessageArgument[];
  /** JSON path of the faulty value of an imported file, displayed as "$.cards[2].answer : …". */
  readonly path?: string;
}

export class LocalizedError extends Error {
  readonly localized: LocalizedMessage;

  constructor(key: TextKey, args: readonly MessageArgument[] = [], path?: string) {
    super(path ? `${path} : ${key}` : key);
    this.name = 'LocalizedError';
    this.localized = path === undefined ? { key, args } : { key, args, path };
  }
}

export function isLocalizedError(error: unknown): error is LocalizedError {
  return error instanceof LocalizedError;
}
