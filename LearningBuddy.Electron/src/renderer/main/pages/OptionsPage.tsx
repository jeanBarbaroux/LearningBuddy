import type { Language, ThemePreference } from '../../../core/settings';
import type { TextKey } from '../../../shared/i18n/texts';
import type { AppStateView, PreferencesPatch } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog } from '../../lib/dialogs';
import { errorMessage, t } from '../../lib/i18n';
import { PageHeader } from './PageHeader';

type BooleanPreference = 'launchAtStartup' | 'autoHideCompanionAfterSeries' | 'pauseDuringTeamsMeetings';

const THEMES: readonly { value: ThemePreference; label: TextKey }[] = [
  { value: 'system', label: 'ThemeSystem' },
  { value: 'light', label: 'ThemeLight' },
  { value: 'dark', label: 'ThemeDark' },
];

const CHECKBOXES: readonly { key: BooleanPreference; label: TextKey }[] = [
  { key: 'launchAtStartup', label: 'LaunchAtStartup' },
  { key: 'autoHideCompanionAfterSeries', label: 'AutoHideCompanionAfterSeries' },
  { key: 'pauseDuringTeamsMeetings', label: 'PauseDuringTeamsMeetings' },
];

export function OptionsPage({ current, active }: { readonly current: AppStateView; readonly active: boolean }) {
  const save = (patch: PreferencesPatch): void => {
    api.settings.updatePreferences(patch).catch(async (error: unknown) => {
      const title = patch.launchAtStartup !== undefined ? 'ApplicationTitle' : 'SaveErrorTitle';
      await alertDialog(t(title), `${t('PreferencesFailure')}\n${errorMessage(error)}`, 'error');
    });
  };

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('OptionsTitle')}/>
      <div className="card">
        <h2>{t('AppearanceHeading')}</h2>
        <label className="field narrow-field">{t('InterfaceLanguage')}
          <select value={current.settings.language} onChange={(event) => save({ language: event.target.value as Language })}>
            <option value="fr">{t('French')}</option>
            <option value="en">{t('English')}</option>
          </select>
        </label>
        <fieldset className="plain">
          <legend className="item-title">{t('InterfaceTheme')}</legend>
          <div className="row">
            {THEMES.map(({ value, label }) => (
              <label className="check" key={value}>
                <input type="radio" name="theme" value={value} checked={current.settings.theme === value}
                  onChange={() => save({ theme: value })} />
                {t(label)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="card">
        <h2>{t('AssistantHeading')}</h2>
        {CHECKBOXES.map(({ key, label }) => (
          <div className="stack option" key={key}>
            <label className="check">
              <input type="checkbox" checked={current.settings[key]} onChange={(event) => save({ [key]: event.target.checked })} />
              {t(label)}
            </label>
            {key === 'pauseDuringTeamsMeetings' && current.settings.pauseDuringTeamsMeetings && current.assistant.teamsDetectionFailed &&
              <p className="message warning">{t('TeamsDetectionFailure')}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}