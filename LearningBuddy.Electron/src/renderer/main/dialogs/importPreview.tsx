// Import preview (v1 ImportPreviewWindow): the package name and every card can be corrected, and cards
// can be excluded, before the package is created.
import { useState } from 'react';
import {
  acceptedCards,
  canConfirm,
  createDrafts,
  draftProblems,
  draftStatus,
  isValidPackageName,
  summarize,
  type ImportCardDraft,
  type ImportCardStatus,
} from '../../../core/packages/importReview';
import { MAX_PACKAGE_NAME_LENGTH } from '../../../core/packages/packageFormat';
import { pluralSuffix } from '../../../shared/i18n/i18n';
import type { ImportPreview } from '../../../shared/ipc';
import type { TextKey } from '../../../shared/i18n/texts';
import { api } from '../../lib/api';
import { openDialog, type DialogHandle } from '../../lib/dialogs';
import { errorMessage, t, tf } from '../../lib/i18n';
import { cardLabel } from './cardDetails';

const STATUS_TEXT: Readonly<Record<ImportCardStatus, TextKey>> = {
  valid: 'CardValid',
  corrected: 'CardCorrected',
  excluded: 'CardExcluded',
  invalid: 'CardInvalid',
};

export interface CreatedPackage {
  readonly name: string;
  readonly cardCount: number;
}

/** Resolves to the created package, or null when the user cancels. */
export function openImportPreview(preview: ImportPreview): Promise<CreatedPackage | null> {
  return new Promise((resolve) => {
    let created: CreatedPackage | null = null;
    openDialog({ title: `${t('PreviewTitle')} — ${preview.fileName}`, size: 'wide', onClose: () => resolve(created) }, (handle) => (
      <ImportPreviewDialog preview={preview} handle={handle} onCreated={(value) => { created = value; }} />
    ));
  });
}

function ImportPreviewDialog({ preview, handle, onCreated }: { readonly preview: ImportPreview; readonly handle: DialogHandle; readonly onCreated: (created: CreatedPackage) => void }) {
  const [drafts, setDrafts] = useState(() => createDrafts({ title: preview.title, cards: preview.cards }));
  const [name, setName] = useState(preview.title);
  const [nameError, setNameError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counts = summarize(drafts);

  const updateDraft = (index: number, patch: Partial<Pick<ImportCardDraft, 'question' | 'answer' | 'excluded'>>): void => {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft));
  };

  const save = async (): Promise<void> => {
    if (!isValidPackageName(name)) {
      setNameError(true);
      return;
    }

    setSaving(true);
    setSaveError(null);
    const cards = acceptedCards(drafts);
    try {
      await api.packages.createImported(name, cards);
      onCreated({ name: name.trim(), cardCount: cards.length });
      handle.close();
    } catch (failure) {
      setSaveError(errorMessage(failure));
      setSaving(false);
    }
  };

  const summary = tf('ImportSummary',
    counts.accepted, pluralSuffix(counts.accepted), counts.valid, pluralSuffix(counts.valid),
    counts.corrected, pluralSuffix(counts.corrected), counts.excluded, pluralSuffix(counts.excluded),
    counts.invalid, pluralSuffix(counts.invalid), counts.total, pluralSuffix(counts.total));

  return (
    <>
      <div className="dialog-body">
        <label className="field">{t('PackageName')}
          <input type="text" maxLength={MAX_PACKAGE_NAME_LENGTH} title={t('PackageNameTooltip')} aria-label={t('PackageName')} value={name}
            aria-invalid={nameError || undefined}
            onChange={(event) => { setName(event.target.value); setNameError(!isValidPackageName(event.target.value)); }} />
        </label>
        {nameError && <p className="field-error">{t('PackageNameValidation')}</p>}
        <p className="muted small">{tf(preview.cards.length === 1 ? 'CardCountInSourceSingular' : 'CardCountInSourcePlural', preview.cards.length)}</p>
        <p className={`message ${counts.invalid > 0 ? 'warning' : ''}`} role="status">{summary}</p>
        <p className="muted small">{t('FixOrExcludeCards')}</p>
        {saveError && <p className="message error">{saveError}</p>}
        <h3>{t('PreviewCards')}</h3>
        <ol className="card-list">
          {drafts.map((draft, index) => (
            <DraftRow key={index} draft={draft} index={index} onChange={(patch) => updateDraft(index, patch)} />
          ))}
        </ol>
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={handle.close}>{t('Cancel')}</button>
        <button type="button" className="primary" disabled={saving || !canConfirm(counts)} onClick={() => void save()}>{t('CreatePackage')}</button>
      </div>
    </>
  );
}

function DraftRow({ draft, index, onChange }: {
  readonly draft: ImportCardDraft;
  readonly index: number;
  readonly onChange: (patch: Partial<Pick<ImportCardDraft, 'question' | 'answer' | 'excluded'>>) => void;
}) {
  const status = draftStatus(draft);
  const problems = draft.excluded ? [] : draftProblems(draft);
  const problemText = problems
    .map((problem) => `$.cards[${index}].${problem === 'questionRequired' ? 'question' : 'answer'} : ${t(problem === 'questionRequired' ? 'QuestionRequired' : 'AnswerRequired')}`)
    .join('\n');
  const details: string[] = [];
  if (draft.original.type === 'qcm') {
    details.push(`${t('QcmTypePrefix')}${draft.original.choices.map((choice) => `${choice.correct ? '✓' : '○'} ${choice.text}`).join(' · ')}`);
  }

  if (draft.original.explanation) details.push(`${t('ExplanationPrefix')}${draft.original.explanation}`);
  if (draft.original.language) details.push(`${t('LanguagePrefix')}${draft.original.language}`);
  if (draft.original.tags.length > 0) details.push(`Tags : ${draft.original.tags.join(', ')}`);
  if (draft.original.image) details.push(t('CardImageAttached'));
  if (draft.original.answerImage) details.push(t('AnswerImageAttached'));

  return (
    <li className={`import-card${draft.excluded ? ' excluded' : ''}`}>
      <div className="row spread"><strong>{cardLabel(index)}</strong><span className={`badge status-${status}`}>{t(STATUS_TEXT[status])}</span></div>
      <label className="field">{t('Question')}
        <textarea rows={2} aria-label={`${cardLabel(index)} — ${t('Question')}`} value={draft.question} aria-invalid={problems.includes('questionRequired') || undefined}
          onChange={(event) => onChange({ question: event.target.value })} />
      </label>
      <label className="field">{t('Answer')}
        <textarea rows={2} aria-label={`${cardLabel(index)} — ${t('Answer')}`} value={draft.answer} aria-invalid={problems.includes('answerRequired') || undefined}
          onChange={(event) => onChange({ answer: event.target.value })} />
      </label>
      {details.length > 0 && <p className="muted small pre-line">{details.join('\n')}</p>}
      <p className="field-error">{problemText}</p>
      <label className="check"><input type="checkbox" checked={draft.excluded} onChange={(event) => onChange({ excluded: event.target.checked })} />{t('ExcludeCard')}</label>
    </li>
  );
}