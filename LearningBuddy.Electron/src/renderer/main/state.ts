// Application state of the main window, pushed by the main process after every change.
import type { AppStateView } from '../../shared/ipc';
import { api } from '../lib/api';

let current: AppStateView | null = null;
const listeners: ((state: AppStateView) => void)[] = [];

export function state(): AppStateView {
  if (!current) {
    throw new Error('L’état de l’application n’est pas encore chargé.');
  }

  return current;
}

export function onStateChanged(listener: (state: AppStateView) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

function publish(next: AppStateView): void {
  current = next;
  for (const listener of listeners) {
    listener(next);
  }
}

export async function loadState(): Promise<AppStateView> {
  api.app.onState(publish);
  const initial = await api.app.getState();
  current ??= initial;
  return current;
}
