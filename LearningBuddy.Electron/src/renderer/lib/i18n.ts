// Interface language and theme of a window. Every window applies the preferences pushed by the main
// process; pages rebuild their texts when the language changes.
import type { LocalizedMessage, MessageArgument } from '../../core/errors';
import type { Language } from '../../core/settings';
import { format, text, translate, type TextKey } from '../../shared/i18n/i18n';
import type { UiPreferences } from '../../shared/ipc';
import { api, UiError } from './api';

let current: UiPreferences = { language: 'fr', theme: 'light' };
const listeners: ((preferences: UiPreferences) => void)[] = [];

export function language(): Language {
  return current.language;
}

export function t(key: TextKey): string {
  return text(current.language, key);
}

export function tf(key: TextKey, ...args: readonly MessageArgument[]): string {
  return format(current.language, key, ...args);
}

export function message(localized: LocalizedMessage): string {
  return translate(current.language, localized);
}

/** Message of any error, translated when it comes from the main process. */
export function errorMessage(error: unknown): string {
  return error instanceof UiError ? message(error.localized) : t('StorageErrorOperationFailed');
}

export function onPreferencesChanged(listener: (preferences: UiPreferences) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

function apply(preferences: UiPreferences): void {
  current = preferences;
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme = preferences.theme;
  for (const listener of listeners) {
    listener(preferences);
  }
}

/** Loads the preferences of the window and follows their changes. */
export async function initializePreferences(): Promise<UiPreferences> {
  api.app.onUiPreferences(apply);
  apply(await api.app.getUiPreferences());
  return current;
}
