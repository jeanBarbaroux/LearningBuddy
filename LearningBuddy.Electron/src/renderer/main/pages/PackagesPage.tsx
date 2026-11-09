import { useState } from 'react';
import { containsIgnoringCase } from '../../../core/text';
import { cardCount, format, formatDateTime } from '../../../shared/i18n/i18n';
import type { AppStateView, PackageSummaryView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog, confirmDialog } from '../../lib/dialogs';
import { errorMessage, language, t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { openImportPreview } from '../dialogs/importPreview';
import { openPackageFrequencies } from '../dialogs/packageFrequency';
import { openPackageQuestions } from '../dialogs/packageQuestions';
import { PageHeader } from './PageHeader';
import { RenamePackageDialog } from './RenamePackageDialog';

export function PackagesPage({ current, active }: { readonly current: AppStateView; readonly active: boolean }) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PackageSummaryView | null>(null);
  const selected = current.reviewPackages;
  const filtered = current.packages.filter((summary) =>
    (!selectedOnly || summary.selected) && (search.trim() === '' || containsIgnoringCase(summary.name, search.trim())));

  const setPackageSelected = (summary: PackageSummaryView, isSelected: boolean): void => {
    api.packages.setSelected(summary.id, isSelected)
      .catch((error: unknown) => alertDialog(t('PackageSelectionNotSaved'), errorMessage(error), 'error'));
  };

  const importPackage = async (): Promise<void> => {
    let preview;
    try {
      preview = await api.packages.importFile();
    } catch (error) {
      await alertDialog(t('ImportFailedTitle'), errorMessage(error), 'error');
      return;
    }

    if (preview) {
      const created = await openImportPreview(preview);
      if (created) {
        await alertDialog(t('ImportCompletedTitle'), tf('ImportCompletedMessage', created.name, created.cardCount), 'success');
      }
    }
  };

  const saveTemplate = async (): Promise<void> => {
    try {
      const result = await api.packages.saveTemplate();
      if (result.status === 'saved') {
        await alertDialog(t('TemplateSavedTitle'), format(language(), 'TemplateSavedMessage', '\n', result.filePath), 'success');
      }
    } catch (error) {
      await alertDialog(t('TemplateSaveTitle'), tf('TemplateSaveFailed', errorMessage(error)), 'error');
    }
  };

  const exportPackage = async (summary: PackageSummaryView): Promise<void> => {
    setExportingId(summary.id);
    try {
      const result = await api.packages.export(summary.id);
      if (result.status === 'saved') {
        await alertDialog(t('PackageExportSavedTitle'), format(language(), 'PackageExportSavedMessage', '\n', result.filePath), 'success');
      }
    } catch (error) {
      await alertDialog(t('PackageExportFailedTitle'), tf('PackageExportFailedMessage', errorMessage(error)), 'error');
    } finally {
      setExportingId(null);
    }
  };

  const deletePackage = async (summary: PackageSummaryView): Promise<void> => {
    if (!await confirmDialog(t('ConfirmDeleteTitle'), tf('ConfirmDeleteMessage', summary.name))) {
      return;
    }

    try {
      await api.packages.delete(summary.id);
    } catch (error) {
      await alertDialog(t('DeleteFailed'), errorMessage(error), 'error');
    }
  };

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('PackagesHeading')}/>
      <div className="row">
        <button className="primary" type="button" onClick={() => void importPackage()}><Icon name="upload" />{t('ImportPackage')}</button>
        <button type="button" onClick={() => void saveTemplate()}><Icon name="download" />{t('DownloadTemplate')}</button>
      </div>
      <div className="card">
        <div className="row spread">
          <div className="row chips">
            {selected.length === 0 ? (
              <span className="muted">{t('NoReviewPackagesSelected')}</span>
            ) : selected.map((summary) => (
              <button className="chip" type="button" key={summary.id} title={t('RemovePackageFromReviews')}
                aria-label={`${t('RemovePackageFromReviews')} : ${summary.name}`} onClick={() => setPackageSelected(summary, false)}>
                {summary.name}<Icon name="close" />
              </button>
            ))}
          </div>
          <button type="button" hidden={selected.length < 2} onClick={() => openPackageFrequencies(selected)}>
            <Icon name="sliders" />{t('PackageFrequencies')}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="row spread">
          <h2>{t('SavedPackages')} ({current.packages.length})</h2>
          <div className="row">
            <input type="search" placeholder={t('SearchPackages')} aria-label={t('SearchPackages')} value={search}
              onChange={(event) => setSearch(event.target.value)} />
            <button type="button" disabled={selected.length === 0 && !selectedOnly} onClick={() => setSelectedOnly((value) => !value)}>
              {t(selectedOnly ? 'ShowAllPackages' : 'ShowSelectedPackagesOnly')}
            </button>
          </div>
        </div>
        <ul className="list">
          {current.packages.length === 0 ? (
            <li className="empty">{t('NoPackagesAvailable')}</li>
          ) : filtered.length === 0 ? (
            <li className="empty">{t(selectedOnly && search.trim() === '' ? 'NoReviewPackagesSelected' : 'NoPackagesMatchSearch')}</li>
          ) : filtered.map((summary) => (
            <li className={summary.selected ? 'selected' : ''} key={summary.id}>
              <button type="button" className={summary.selected ? 'icon selected-toggle' : 'icon'}
                aria-label={t(summary.selected ? 'RemovePackageFromReviews' : 'AddPackageToReviews')}
                title={t(summary.selected ? 'RemovePackageFromReviews' : 'AddPackageToReviews')}
                aria-pressed={summary.selected} disabled={!summary.selected && summary.cardCount === 0}
                onClick={() => setPackageSelected(summary, !summary.selected)}>
                <Icon name={summary.selected ? 'check' : 'plus'} />
              </button>
              <div className="grow">
                <p className="item-title">{summary.name}</p>
                <p className="muted small">{cardCount(language(), summary.cardCount)} · {tf('PackageLastModified', formatDateTime(language(), summary.updatedAt))}</p>
                {summary.selected && <span className="badge">{t('ReviewPackageSelected')}</span>}
              </div>
              <button type="button" title={t('ManageQuestions')} onClick={() => void openPackageQuestions(summary.id)}>
                <Icon name="list" />{t('PackageCardsAction')}
              </button>
              <button type="button" className="icon" aria-label={t('ExportPackage')} title={t('ExportPackage')}
                disabled={exportingId === summary.id} onClick={() => void exportPackage(summary)}>
                <Icon name="download" />
              </button>
              <button type="button" className="icon" aria-label={t('Rename')} title={t('Rename')} onClick={() => setRenaming(summary)}>
                <Icon name="edit" />
              </button>
              <button type="button" className="icon danger" aria-label={t('Delete')} title={t('Delete')} onClick={() => void deletePackage(summary)}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {renaming && <RenamePackageDialog summary={renaming} onClose={() => setRenaming(null)} />}
    </section>
  );
}