import { useEffect, useRef, useState } from 'react';
import { SettingsLimits } from '../../../core/settings';
import type { AppStateView, PreferencesPatch } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { errorMessage, t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { state } from '../state';
import { PageHeader } from './PageHeader';

type SizeKey = 'avatarSizePercent' | 'bubbleSizePercent';

export function AvatarPage({ current, active }: { readonly current: AppStateView; readonly active: boolean }) {
  const [values, setValues] = useState<Record<SizeKey, string>>(() => sizeValues(current));
  const [messages, setMessages] = useState<Partial<Record<SizeKey, string>>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    setValues(sizeValues(current));
  }, [current.settings.avatarSizePercent, current.settings.bubbleSizePercent]);

  useEffect(() => {
    if (wasActive.current && !active && state().bubblePreviewOpen) {
      void api.avatar.toggleBubblePreview();
    }
    wasActive.current = active;
  }, [active, current.bubblePreviewOpen]);

  const save = (key: SizeKey, value: number): void => {
    if (current.settings[key] === value) {
      return;
    }

    const patch: PreferencesPatch = key === 'avatarSizePercent'
      ? { avatarSizePercent: value }
      : { bubbleSizePercent: value };
    api.settings.updatePreferences(patch).catch((error: unknown) => {
      setMessages((previous) => ({ ...previous, [key]: errorMessage(error) }));
    });
  };

  const commit = (key: SizeKey): void => {
    const text = values[key].trim();
    if (!/^\d{1,6}$/.test(text)) {
      setMessages((previous) => ({ ...previous, [key]: t('SizeInvalidNumber') }));
      return;
    }

    const requested = Number(text);
    const value = Math.min(Math.max(requested, SettingsLimits.minSizePercent), SettingsLimits.maxSizePercent);
    setValues((previous) => ({ ...previous, [key]: String(value) }));
    setMessages((previous) => ({
      ...previous,
      [key]: value === requested ? undefined : tf('SizeAdjusted', value),
    }));
    save(key, value);
  };

  const togglePreview = async (): Promise<void> => {
    setPreviewError(null);
    try {
      await api.avatar.toggleBubblePreview();
    } catch (error) {
      setPreviewError(errorMessage(error));
    }
  };

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('AvatarTitle')}/>
      <div className="card">
        <h2>{t('AvatarSizeHeading')}</h2>
        <SizeRow label={t('AvatarSizeShortLabel')} accessibleLabel={t('AvatarSizeLabel')}
          value={values.avatarSizePercent} message={messages.avatarSizePercent} onValueChange={(value) => {
            setValues((previous) => ({ ...previous, avatarSizePercent: value }));
            setMessages((previous) => ({ ...previous, avatarSizePercent: undefined }));
          }} onCommit={() => commit('avatarSizePercent')} onSliderCommit={() => save('avatarSizePercent', Number(values.avatarSizePercent))} />
        <SizeRow label={t('BubbleSizeShortLabel')} accessibleLabel={t('BubbleSizeLabel')}
          value={values.bubbleSizePercent} message={messages.bubbleSizePercent} onValueChange={(value) => {
            setValues((previous) => ({ ...previous, bubbleSizePercent: value }));
            setMessages((previous) => ({ ...previous, bubbleSizePercent: undefined }));
          }} onCommit={() => commit('bubbleSizePercent')} onSliderCommit={() => save('bubbleSizePercent', Number(values.bubbleSizePercent))} />
      </div>
      <div className="card">
        <h2>{t('BubblePreviewTitle')}</h2>
        <p className="muted">{t('BubblePreviewHint')}</p>
        <div className="row">
          <button type="button" onClick={() => void togglePreview()}>
            <Icon name="eye" />{t(current.bubblePreviewOpen ? 'BubblePreviewHide' : 'BubblePreviewShow')}
          </button>
        </div>
        {previewError && <p className="field-error">{previewError}</p>}
      </div>
    </section>
  );
}

function SizeRow({
  label,
  accessibleLabel,
  value,
  message,
  onValueChange,
  onCommit,
  onSliderCommit,
}: {
  readonly label: string;
  readonly accessibleLabel: string;
  readonly value: string;
  readonly message?: string;
  readonly onValueChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onSliderCommit: () => void;
}) {
  const sliderRef = useRef<HTMLInputElement>(null);

  return (
    <div className="stack">
      <div className="row size-row">
        <span className="size-label">{label}</span>
        <input ref={sliderRef} type="range" min={SettingsLimits.minSizePercent} max={SettingsLimits.maxSizePercent} step={1}
          aria-label={accessibleLabel} value={value} onChange={(event) => onValueChange(event.target.value)} onMouseUp={onSliderCommit}
          onTouchEnd={onSliderCommit} />
        <input className="percent-field" type="text" inputMode="numeric" aria-label={tf('SizeValueFieldName', accessibleLabel)}
          value={value} onChange={(event) => onValueChange(event.target.value)} onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommit();
            if (event.key === 'Escape') onValueChange(sliderRef.current?.value ?? value);
          }} />
        <span>%</span>
      </div>
      {message && <p className="field-help" role="status">{message}</p>}
    </div>
  );
}

function sizeValues(current: AppStateView): Record<SizeKey, string> {
  return {
    avatarSizePercent: String(current.settings.avatarSizePercent),
    bubbleSizePercent: String(current.settings.bubbleSizePercent),
  };
}