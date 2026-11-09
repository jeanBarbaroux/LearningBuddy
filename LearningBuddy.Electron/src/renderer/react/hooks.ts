import { useEffect, useState } from 'react';
import type { UiPreferences } from '../../shared/ipc';
import { initializePreferences, onPreferencesChanged } from '../lib/i18n';

export function usePreferences(): UiPreferences | null {
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onPreferencesChanged((next) => {
      if (active) {
        setPreferences(next);
      }
    });
    void initializePreferences().then((initial) => {
      if (active) {
        setPreferences(initial);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return preferences;
}