import { useCallback, useEffect, useRef, useState } from 'react';
import { containsIgnoringCase } from '../../../core/text';
import { cardCount } from '../../../shared/i18n/i18n';
import type { AppStateView, LibraryEntryView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { errorMessage, language, t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { openLibraryCards } from '../dialogs/libraryCards';
import { PageHeader } from './PageHeader';

type LibraryLoad =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; entries: LibraryEntryView[] }
  | { status: 'failed'; message: string };

export function LibraryPage({ current, active }: { readonly current: AppStateView; readonly active: boolean }) {
  const [load, setLoad] = useState<LibraryLoad>({ status: 'idle' });
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const lastPackageCount = useRef(current.packages.length);

  const refresh = useCallback(async (): Promise<void> => {
    setLoad((previous) => previous.status === 'loaded' ? previous : { status: 'loading' });
    try {
      setLoad({ status: 'loaded', entries: await api.library.list() });
    } catch (error) {
      setLoad({ status: 'failed', message: tf('LibraryLoadFailed', errorMessage(error)) });
    }
  }, []);

  useEffect(() => {
    if (active) {
      void refresh();
    }
  }, [active, refresh]);

  useEffect(() => {
    if (lastPackageCount.current !== current.packages.length) {
      lastPackageCount.current = current.packages.length;
      if (load.status === 'loaded') {
        void refresh();
      }
    }
  }, [current.packages.length, load.status, refresh]);

  const download = async (entry: LibraryEntryView): Promise<void> => {
    setDownloading(entry.id);
    try {
      const title = await api.library.download(entry.id);
      setFeedback({ text: tf('LibraryDownloadCompleted', title), kind: 'success' });
    } catch (error) {
      setFeedback({ text: errorMessage(error), kind: 'error' });
    } finally {
      setDownloading(null);
      await refresh();
    }
  };

  const entries = load.status === 'loaded'
    ? load.entries.filter((entry) => search.trim() === '' || containsIgnoringCase(entry.title, search.trim()))
    : [];

  return (
    <section className="page" hidden={!active}>
      <PageHeader title={t('LibraryHeading')}/>
      <div className="card">
        <div className="row spread">
          <h2>{t('LibraryPackagesHeading')}{load.status === 'loaded' ? ` (${load.entries.length})` : ''}</h2>
          <input type="search" placeholder={t('SearchLibrary')} aria-label={t('SearchLibrary')} value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </div>
        {feedback && <p className={`message ${feedback.kind}`} role="status">{feedback.text}</p>}
        <ul className="list" aria-live="polite">
          {load.status !== 'loaded' ? (
            <li className={`empty ${load.status === 'failed' ? 'error' : ''}`}>
              {load.status === 'failed' ? load.message : t('LibraryLoading')}
            </li>
          ) : load.entries.length === 0 ? (
            <li className="empty">{t('LibraryEmpty')}</li>
          ) : entries.length === 0 ? (
            <li className="empty">{t('LibraryNoMatch')}</li>
          ) : entries.map((entry) => (
            <li key={entry.id}>
              <div className="grow">
                <p className="item-title">{entry.title}</p>
                <p className="muted small">{cardCount(language(), entry.cardCount)}</p>
              </div>
              <button type="button" title={tf('LibraryViewCardsOf', entry.title)} onClick={() => void openLibraryCards(entry)}>
                <Icon name="eye" />{t('LibraryViewCards')}
              </button>
              {entry.downloaded ? (
                <button type="button" disabled title={tf('LibraryDownloadedOf', entry.title)}><Icon name="check" />{t('LibraryDownloaded')}</button>
              ) : (
                <button type="button" className="primary" disabled={downloading === entry.id} title={tf('LibraryDownloadOf', entry.title)}
                  onClick={() => void download(entry)}>
                  <Icon name="download" />{t('LibraryDownload')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}