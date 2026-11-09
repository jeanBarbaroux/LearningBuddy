import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, fromDateInputValue, startOfDay, toDateInputValue } from '../../../core/statistics/calendar';
import type { TextKey } from '../../../shared/i18n/texts';
import { formatNumber } from '../../../shared/i18n/i18n';
import type { AppStateView, StatisticsView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { errorMessage, language, t } from '../../lib/i18n';
import { activityHeatmap, levelPieChart, levelStackedAreaChart, outcomeBars, presentationLineChart } from '../charts/charts';
import { PageHeader } from './PageHeader';

const GRANULARITY_TEXT: Readonly<Record<StatisticsView['granularity'], TextKey>> = {
  daily: 'StatisticsGranularityDaily',
  weekly: 'StatisticsGranularityWeekly',
  monthly: 'StatisticsGranularityMonthly',
};

export function StatisticsPage({ current, active }: { readonly current: AppStateView; readonly active: boolean }) {
  const [packageId, setPackageId] = useState<string | null>(null);
  const [startValue, setStartValue] = useState(() => toDateInputValue(addDays(startOfDay(Date.now()), -29)));
  const [endValue, setEndValue] = useState(() => toDateInputValue(startOfDay(Date.now())));
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const [view, setView] = useState<StatisticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastValidRange = useRef({ start: fromDateInputValue(startValue)!, end: fromDateInputValue(endValue)! });

  useEffect(() => {
    if (packageId && !current.packages.some((summary) => summary.id === packageId)) {
      setPackageId(null);
    }
  }, [current.packages, packageId]);

  const refresh = useCallback(async (): Promise<void> => {
    const start = fromDateInputValue(startValue);
    const end = fromDateInputValue(endValue);
    const valid = start !== null && end !== null && start <= end;
    setRangeInvalid(!valid);
    if (valid) {
      lastValidRange.current = { start, end };
    }

    setError(null);
    try {
      setView(await api.statistics.get({ packageId, ...(valid ? { start, end } : lastValidRange.current) }));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [endValue, packageId, startValue]);

  useEffect(() => {
    if (active) {
      void refresh();
    }
  }, [active, current.packages, refresh]);

  const activity = useMemo(() => view ? activityHeatmap(view.activity) : null, [view?.activity, language()]);
  const levels = useMemo(() => view && sumOf(view.levels) > 0 ? levelPieChart(view.levels) : null, [view?.levels, language()]);
  const outcomes = useMemo(() => view && sumOf(view.outcomes) > 0 ? outcomeBars(view.outcomes) : null, [view?.outcomes, language()]);
  const timeline = useMemo(() => {
    if (!view) return null;
    const presented = view.presentations.reduce((sum, item) => sum + item.presented, 0);
    return presented > 0 ? presentationLineChart(view.presentations, view.granularity === 'daily') : null;
  }, [view, language()]);
  const levelTimeline = useMemo(() => view && sumOf(view.levels) > 0
    ? levelStackedAreaChart(view.levelTimeline, view.granularity === 'daily')
    : null, [view, language()]);

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('StatisticsHeading')}/>
      <div className="card">
        <h2>{t('StatisticsFiltersHeading')}</h2>
        <div className="row form-row">
          <label className="field">{t('StatisticsScopeLabel')}
            <select value={packageId ?? ''} onChange={(event) => setPackageId(event.target.value || null)}>
              <option value="">{t('StatisticsGlobalScope')}</option>
              {current.packages.map((summary) => <option value={summary.id} key={summary.id}>{summary.name}</option>)}
            </select>
          </label>
          <label className="field">{t('StatisticsStartDate')}
            <input type="date" value={startValue} onChange={(event) => setStartValue(event.target.value)} />
          </label>
          <label className="field">{t('StatisticsEndDate')}
            <input type="date" value={endValue} onChange={(event) => setEndValue(event.target.value)} />
          </label>
          <button className="primary" type="button" onClick={() => void refresh()}>{t('StatisticsApplyFilters')}</button>
        </div>
        {rangeInvalid && <p className="field-error">{t('StatisticsDateRangeInvalid')}</p>}
      </div>
      <section className="card">
        <h2>{t('StatisticsActivityHeading')}</h2>
        {error ? <Failure text={`${t('StatisticsActivityError')} ${error}`} /> : activity}
      </section>
      <section className="card">
        <h2>{t('StatisticsCurrentSummaryHeading')}</h2>
        {error ? <Failure text={`${t('StatisticsNotLoaded')} ${error}`} /> : view && (
          <>
            <div className="figures">
              <Figure label={t('PromptsShown')} value={formatNumber(language(), view.indicators.presentations)} />
              <Figure label={t('AverageReviewLevel')} value={view.indicators.averageLevel === null
                ? '—' : formatNumber(language(), view.indicators.averageLevel, 1, 1)} />
            </div>
            {view.indicators.presentations === 0 && <p className="muted">{t('StatisticsSummaryNoEvents')}</p>}
          </>
        )}
      </section>
      <div className="two-columns">
        <section className="card">
          <h2>{t('StatisticsCardDistributionHeading')}</h2>
          {error ? <Failure text={`${t('StatisticsNotLoaded')} ${error}`} /> : view && (levels
            ? levels
            : <p className="muted">{t('StatisticsCardDistributionNoCards')}</p>)}
        </section>
        <section className="card">
          <h2>{t('StatisticsOutcomeHeading')}</h2>
          {error ? <Failure text={`${t('StatisticsNotLoaded')} ${error}`} /> : !rangeInvalid && view && (outcomes
            ? outcomes
            : <p className="muted">{t('StatisticsNoOutcomes')}</p>)}
        </section>
      </div>
      <section className="card">
        <h2>{t('StatisticsTimelineHeading')}</h2>
        {error ? <Failure text={`${t('StatisticsNotLoaded')} ${error}`} /> : !rangeInvalid && view && (
          <>
            <p className="muted small">{t(GRANULARITY_TEXT[view.granularity])}</p>
            {timeline ?? <p className="muted">{t('StatisticsNoTimelineData')}</p>}
          </>
        )}
      </section>
      <section className="card">
        <h2>{t('StatisticsLevelTimelineHeading')}</h2>
        {error ? <Failure text={`${t('StatisticsNotLoaded')} ${error}`} /> : !rangeInvalid && view && (levelTimeline
          ? levelTimeline
          : <p className="muted">{t('StatisticsCardDistributionNoCards')}</p>)}
      </section>
    </section>
  );
}

function Failure({ text }: { readonly text: string }) {
  return <p className="message error">{text}</p>;
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="figure"><span className="figure-value">{value}</span><span className="muted">{label}</span></div>;
}

function sumOf(values: Readonly<Record<string, number>>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}