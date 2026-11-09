// Draw percentages of the selected packages (v1 PackageFrequencyWindow): one slider and one field per
// package; changing one value rebalances the others so that the total stays 100 %.
import { useState } from 'react';
import {
  changePercentage,
  createEqualDistribution,
  isValidDistribution,
  maximumPercentage,
} from '../../../core/packages/packageFrequency';
import type { PackageSummaryView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { openDialog, type DialogHandle } from '../../lib/dialogs';
import { errorMessage, t } from '../../lib/i18n';
import { state } from '../state';

export function openPackageFrequencies(packages: readonly PackageSummaryView[]): void {
  const ids = packages.map((summary) => summary.id);
  const saved = state().settings.packagePercentages;
  const percentages = saved && isValidDistribution(ids, saved) ? { ...saved } : createEqualDistribution(ids);
  openDialog({ title: t('PackageFrequencies') }, (handle) => (
    <PackageFrequencyDialog packages={packages} ids={ids} maximum={maximumPercentage(ids.length)} initial={percentages} handle={handle} />
  ));
}

function PackageFrequencyDialog({ packages, ids, maximum, initial, handle }: {
  readonly packages: readonly PackageSummaryView[];
  readonly ids: readonly string[];
  readonly maximum: number;
  readonly initial: Record<string, number>;
  readonly handle: DialogHandle;
}) {
  const [percentages, setPercentages] = useState(initial);
  const [fieldValues, setFieldValues] = useState(() => Object.fromEntries(ids.map((id) => [id, String(initial[id])])));
  const [validation, setValidation] = useState<string | null>(null);

  const updateFields = (next: Record<string, number>, preserveId?: string): void => {
    setFieldValues((current) => Object.fromEntries(ids.map((id) => [id, id === preserveId ? current[id] ?? String(next[id]) : String(next[id])])));
  };

  const updateFromSlider = (id: string, value: number): void => {
    const next = changePercentage(ids, percentages, id, value);
    setPercentages(next);
    updateFields(next);
  };

  const updateFromField = (id: string, value: string): void => {
    setFieldValues((current) => ({ ...current, [id]: value }));
    const percentage = /^\d{1,3}$/.test(value) ? Number(value) : Number.NaN;
    const valid = percentage >= 1 && percentage <= maximum;
    setValidation(valid ? null : t('PackageFrequencyValidation'));
    if (valid) {
      const next = changePercentage(ids, percentages, id, percentage);
      setPercentages(next);
      updateFields(next, id);
    }
  };

  const save = async (): Promise<void> => {
    if (!isValidDistribution(ids, percentages)) {
      setValidation(t('PackageFrequencyValidation'));
      return;
    }

    try {
      await api.packages.setPercentages(percentages);
      handle.close();
    } catch (failure) {
      setValidation(errorMessage(failure));
    }
  };

  return (
    <>
      <div className="dialog-body">
        <p className="muted">{t('PackageFrequencyHelp')}</p>
        {packages.map((summary) => (
          <div className="frequency-row" key={summary.id}>
            <span className="grow item-title">{summary.name}</span>
            <input type="range" min={1} max={maximum} step={1} aria-label={summary.name} value={percentages[summary.id]}
              onChange={(event) => updateFromSlider(summary.id, Number(event.target.value))} />
            <input type="text" inputMode="numeric" aria-label={`${summary.name} (%)`} className="percent-field" value={fieldValues[summary.id] ?? ''}
              onChange={(event) => updateFromField(summary.id, event.target.value)}
              onBlur={() => setFieldValues((current) => ({ ...current, [summary.id]: String(percentages[summary.id]) }))} />
            <span>%</span>
          </div>
        ))}
        {validation && <p className="field-error">{validation}</p>}
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={handle.close}>{t('Cancel')}</button>
        <button type="button" className="primary" onClick={() => void save()}>{t('Save')}</button>
      </div>
    </>
  );
}