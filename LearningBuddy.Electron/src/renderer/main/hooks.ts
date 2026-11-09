import { useEffect, useState } from 'react';
import type { AppStateView } from '../../shared/ipc';
import { loadState, onStateChanged } from './state';

export function useAppState(): AppStateView | null {
  const [current, setCurrent] = useState<AppStateView | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onStateChanged((next) => {
      if (active) {
        setCurrent(next);
      }
    });
    void loadState().then((initial) => {
      if (active) {
        setCurrent(initial);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return current;
}