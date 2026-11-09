import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { isValidPackageName } from '../../../core/packages/importReview';
import { MAX_PACKAGE_NAME_LENGTH } from '../../../core/packages/packageFormat';
import type { PackageSummaryView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { errorMessage, t } from '../../lib/i18n';

export function RenamePackageDialog({ summary, onClose }: {
  readonly summary: PackageSummaryView;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(summary.name);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.select();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isValidPackageName(name)) {
      setError(t('PackageNameValidation'));
      setInvalid(true);
      return;
    }

    setSaving(true);
    try {
      await api.packages.rename(summary.id, name);
      onClose();
    } catch (failure) {
      setError(`${t('RenameFailed')} : ${errorMessage(failure)}`);
      setSaving(false);
    }
  };

  return createPortal(
    <dialog ref={dialog} className="narrow" aria-label={t('Rename')}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form onSubmit={(event) => void save(event)}>
        <div className="dialog-header"><h2>{t('Rename')}</h2></div>
        <div className="dialog-body">
          <label className="field">{t('PackageName')}
            <input ref={input} type="text" maxLength={MAX_PACKAGE_NAME_LENGTH} title={t('PackageNameTooltip')}
              value={name} aria-invalid={invalid || undefined} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-footer">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
