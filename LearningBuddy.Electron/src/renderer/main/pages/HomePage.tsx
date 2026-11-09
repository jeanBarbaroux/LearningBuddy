import { useEffect, useState, type FormEvent } from 'react';
import { isValidSlotTime, type DailyReviewSlot } from '../../../core/review/dailySchedule';
import { assistantStateText, nextQuestionText } from '../../../shared/assistantStatus';
import type { AppStateView, RhythmSettings } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog } from '../../lib/dialogs';
import { errorMessage, language, t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { PageHeader } from './PageHeader';
import type { PageId } from './page';

interface RhythmDraft {
  useFixedSchedule: boolean;
  questionsPerSeries: string;
  intervalMinutes: string;
  snoozeMinutes: string;
  dailySlots: { time: string; questions: string }[];
}

export function HomePage({ current, navigate, active }: { readonly current: AppStateView; readonly navigate: (page: PageId) => void; readonly active: boolean }) {
  const [rhythm, setRhythm] = useState<RhythmDraft>(() => toRhythmDraft(current.settings));
  const [rhythmDirty, setRhythmDirty] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!rhythmDirty) {
      setRhythm(toRhythmDraft(current.settings));
    }
  }, [current.settings, rhythmDirty]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updateRhythm = <K extends keyof RhythmDraft,>(key: K, value: RhythmDraft[K]): void => {
    setRhythmDirty(true);
    setRhythm((previous) => ({ ...previous, [key]: value }));
  };

  const updateSlot = (index: number, patch: Partial<RhythmDraft['dailySlots'][number]>): void => {
    updateRhythm('dailySlots', rhythm.dailySlots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot));
  };

  const saveRhythm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const settings: RhythmSettings = {
      useFixedSchedule: rhythm.useFixedSchedule,
      questionsPerSeries: parseDigits(rhythm.questionsPerSeries),
      intervalMinutes: parseDigits(rhythm.intervalMinutes),
      snoozeMinutes: parseDigits(rhythm.snoozeMinutes),
      dailySlots: rhythm.dailySlots.map((slot) => ({
        time: isValidSlotTime(slot.time.trim()) ? slot.time.trim() : '--:--',
        questions: parseDigits(slot.questions),
      })),
    };

    try {
      await api.settings.saveRhythm(settings);
      const updated = await api.app.getState();
      setRhythm(toRhythmDraft(updated.settings));
      setRhythmDirty(false);
    } catch (error) {
      await alertDialog(t('InvalidIntervalTitle'), errorMessage(error), 'error');
      setRhythm(toRhythmDraft(current.settings));
      setRhythmDirty(false);
    }
  };

  const run = (action: () => Promise<void>, title: Parameters<typeof t>[0] = 'SaveErrorTitle'): void => {
    action().catch((error: unknown) => alertDialog(t(title), errorMessage(error), 'error'));
  };

  const assistant = current.assistant;
  const settings = current.settings;
  const packageNames = current.reviewPackages.map((summary) => summary.name);
  const packageStatus = packageNames.length === 0
    ? t('NoActivePackageStatus')
    : packageNames.length === 1
      ? tf('ActivePackageStatus', packageNames[0]!)
      : tf('ReviewPackagesStatus', packageNames.join(', '));

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('HomeTitle')} />
      <div className="card">
        <h2>{t('HomeStatusHeading')}</h2>
        <p className="status-title" role="status">{assistantStateText(language(), assistant)}</p>
        {assistant.teamsDetectionFailed && <p className="message warning">{t('TeamsDetectionFailure')}</p>}
        <p>{packageStatus}</p>
        <p className="muted" aria-live="polite">{nextQuestionText(language(), assistant, current.hasReviewableCards, now)}</p>
        <div className="row">
          <button className="primary" type="button" disabled={assistant.teamsMeeting || assistant.teamsCheckPending || assistant.active || !current.hasReviewableCards}
            onClick={() => run(() => api.assistant.start(), 'ActivationFailed')}>
            <Icon name="play" />{t('StartAssistant')}
          </button>
          <button type="button" disabled={!assistant.active && !assistant.teamsMeeting} onClick={() => run(() => api.assistant.pause())}>
            <Icon name="pause" />{t('PauseAssistant')}
          </button>
          <button type="button" disabled={!assistant.canPresentManually || !current.hasReviewableCards} onClick={() => run(() => api.assistant.presentNow())}>
            {t('PresentReview')}
          </button>
          <button type="button" onClick={() => navigate('packages')}><Icon name="layers" />{t('HomeManagePackages')}</button>
        </div>
      </div>

      <div className="card">
        <h2>{t('HomeSettingsHeading')}</h2>
        <form className="stack" onSubmit={(event) => void saveRhythm(event)}>
          <div className="row" role="radiogroup">
            <label className="check">
              <input type="radio" name="rhythm-mode" checked={!rhythm.useFixedSchedule}
                onChange={() => updateRhythm('useFixedSchedule', false)} />
              {t('IntervalMode')}
            </label>
            <label className="check">
              <input type="radio" name="rhythm-mode" checked={rhythm.useFixedSchedule}
                onChange={() => updateRhythm('useFixedSchedule', true)} />
              {t('FixedScheduleMode')}
            </label>
          </div>
          {!rhythm.useFixedSchedule && (
            <div className="stack">
              <div className="row form-row">
                <label className="field">{t('QuestionsPerSeries')}
                  <input type="text" inputMode="numeric" title={t('QuestionsPerSeriesTooltip')} value={rhythm.questionsPerSeries}
                    onChange={(event) => updateRhythm('questionsPerSeries', event.target.value)} />
                </label>
                <label className="field">{t('AssistantInterval')}
                  <input type="text" inputMode="numeric" title={t('IntervalTooltip')} value={rhythm.intervalMinutes}
                    onChange={(event) => updateRhythm('intervalMinutes', event.target.value)} />
                </label>
              </div>
              <p className="field-help">{t('ReviewIntervalStartHelp')}</p>
            </div>
          )}
          {rhythm.useFixedSchedule && (
            <div className="stack">
              <div className="stack slots">
                {rhythm.dailySlots.map((slot, index) => (
                  <div className="row slot" key={index}>
                    <label className="field">{t('ScheduleTime')}
                      <input type="text" inputMode="numeric" maxLength={5} aria-label={t('ScheduleTime')} placeholder="HH:mm"
                        value={slot.time} onChange={(event) => updateSlot(index, { time: event.target.value })} />
                    </label>
                    <label className="field">{t('QuestionsPerSeries')}
                      <input type="text" inputMode="numeric" title={t('QuestionsPerSeriesTooltip')} value={slot.questions}
                        onChange={(event) => updateSlot(index, { questions: event.target.value })} />
                    </label>
                    <button className="ghost" type="button" aria-label={t('RemoveScheduleSlot')}
                      onClick={() => updateRhythm('dailySlots', rhythm.dailySlots.filter((_item, slotIndex) => slotIndex !== index))}>
                      <Icon name="trash" />{t('RemoveScheduleSlot')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="row">
                <button type="button" onClick={() => updateRhythm('dailySlots', [...rhythm.dailySlots, { time: '09:00', questions: '1' }])}>
                  <Icon name="plus" />{t('AddScheduleSlot')}
                </button>
              </div>
            </div>
          )}
          <label className="field narrow-field">{t('ReviewSnoozeMinutes')}
            <input type="text" inputMode="numeric" title={t('ReviewSnoozeMinutesTooltip')} value={rhythm.snoozeMinutes}
              onChange={(event) => updateRhythm('snoozeMinutes', event.target.value)} />
          </label>
          <div className="row"><button className="primary" type="submit">{t('Save')}</button></div>
        </form>
      </div>

      <div className="card">
        <h2>{t('HomeCompanionHeading')}</h2>
        <div className="row">
          <button type="button" disabled={!current.companionVisible && assistant.teamsMeeting}
            onClick={() => run(() => api.companion.setVisible(!current.companionVisible))}>
            {t(current.companionVisible ? 'HideCompanion' : 'ShowCompanion')}
          </button>
          <button type="button" onClick={() => run(() => api.companion.setWandering(!settings.companionWanderingEnabled))}>
            {t(settings.companionWanderingEnabled ? 'DisableCompanionWandering' : 'EnableCompanionWandering')}
          </button>
        </div>
      </div>
    </section>
  );
}

function toRhythmDraft(settings: RhythmSettings): RhythmDraft {
  return {
    useFixedSchedule: settings.useFixedSchedule,
    questionsPerSeries: String(settings.questionsPerSeries),
    intervalMinutes: String(settings.intervalMinutes),
    snoozeMinutes: String(settings.snoozeMinutes),
    dailySlots: settings.dailySlots.map((slot: DailyReviewSlot) => ({ time: slot.time, questions: String(slot.questions) })),
  };
}

function parseDigits(value: string): number {
  return /^\d{1,15}$/.test(value) ? Number(value) : -1;
}