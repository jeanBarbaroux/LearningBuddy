// Reading and saving the user preferences.
import { validateSettings, type AppSettings } from '../../core/settings';
import type { DataStore } from '../data/dataStore';

export class SettingsService {
  constructor(private readonly store: DataStore) {}

  get current(): AppSettings {
    return this.store.settings.settings;
  }

  /** Validates the complete preferences before saving them; throws a LocalizedError when invalid. */
  update(patch: Partial<AppSettings>): AppSettings {
    const next = validateSettings({ ...this.current, ...patch });
    this.store.transact(['settings'], () => {
      this.store.settings.settings = next;
    });
    return next;
  }
}
