// Converts any error into a message that can be shown to the user in the interface language.
import { isLocalizedError, type LocalizedMessage } from '../core/errors';
import { LocalStorageError, type StorageErrorKind } from './data/dataStore';
import type { TextKey } from '../shared/i18n/texts';

const STORAGE_MESSAGES: Readonly<Record<StorageErrorKind, TextKey>> = {
  corrupted: 'StorageErrorCorrupted',
  incompatibleVersion: 'StorageErrorIncompatibleVersion',
  writeFailed: 'StorageErrorWriteFailed',
  inaccessible: 'StorageErrorInaccessible',
};

/** Message of an error; `fallback` describes the operation that failed when the cause is unexpected. */
export function toLocalizedMessage(error: unknown, fallback: TextKey = 'StorageErrorOperationFailed'): LocalizedMessage {
  if (isLocalizedError(error)) {
    return error.localized;
  }

  if (error instanceof LocalStorageError) {
    return { key: STORAGE_MESSAGES[error.kind] };
  }

  return { key: fallback };
}

/** Technical details logged for diagnosis; never contains user content. */
export function describeError(error: unknown): string {
  if (error instanceof LocalStorageError) {
    return `${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ''}`;
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
