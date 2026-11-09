import { useEffect, useRef, useState } from 'react';
import { accessKey } from '../../shared/i18n/i18n';
import type { TextKey } from '../../shared/i18n/texts';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { Icon } from '../react/Icon';
import { usePreferences } from '../react/hooks';
import { openCardEditorById } from './dialogs/cardEditor';
import { useAppState } from './hooks';
import { AvatarPage } from './pages/AvatarPage';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { OptionsPage } from './pages/OptionsPage';
import { PackagesPage } from './pages/PackagesPage';
import { StatisticsPage } from './pages/StatisticsPage';
import type { PageId } from './pages/page';

interface NavigationEntry {
  readonly id: PageId;
  readonly label: TextKey;
  readonly icon: 'home' | 'library' | 'layers' | 'chart' | 'user' | 'settings';
}

const NAVIGATION: readonly NavigationEntry[] = [
  { id: 'home', label: 'NavigationHome', icon: 'home' },
  { id: 'library', label: 'NavigationLibrary', icon: 'library' },
  { id: 'packages', label: 'NavigationPackages', icon: 'layers' },
  { id: 'statistics', label: 'NavigationStatistics', icon: 'chart' },
  { id: 'avatar', label: 'NavigationAvatar', icon: 'user' },
  { id: 'options', label: 'NavigationOptions', icon: 'settings' },
];

export function MainApp() {
  const preferences = usePreferences();
  const current = useAppState();
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const content = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = t('ApplicationTitle');
  }, [preferences]);

  useEffect(() => {
    api.app.onOpenCardEditor((cardId) => void openCardEditorById(cardId));
  }, []);

  useEffect(() => {
    const activate = (entry: NavigationEntry): void => setCurrentPage(entry.id);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) {
        return;
      }

      const entry = NAVIGATION.find((candidate) => accessKey(t(candidate.label)) === event.key.toLowerCase());
      if (entry) {
        event.preventDefault();
        activate(entry);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [preferences]);

  useEffect(() => {
    if (content.current) {
      content.current.scrollTop = 0;
    }
  }, [currentPage]);

  if (!preferences || !current) {
    return null;
  }

  const optionsIndex = NAVIGATION.findIndex((entry) => entry.id === 'options');
  const renderNavigationItem = (entry: NavigationEntry) => {
    const label = t(entry.label);
    const key = accessKey(label);
    return (
      <button className="nav-item" type="button" key={entry.id} data-page={entry.id}
        aria-current={entry.id === currentPage ? 'page' : undefined}
        aria-keyshortcuts={key ? `Alt+${key.toUpperCase()}` : undefined}
        onClick={() => setCurrentPage(entry.id)}>
        <Icon name={entry.icon} />
        <NavigationLabel label={label} />
      </button>
    );
  };

  return (
    <>
      <nav id="navigation" className="sidenav" aria-label={t('NavigationHeading')} data-react-app="main">
        <div className="brand"><span>{t('ApplicationTitle')}</span></div>
        <div className="nav-items">{NAVIGATION.slice(0, optionsIndex).map(renderNavigationItem)}</div>
        <div className="nav-items bottom">{NAVIGATION.slice(optionsIndex).map(renderNavigationItem)}</div>
      </nav>
      <main id="content" ref={content}>
        <HomePage current={current} navigate={setCurrentPage} active={currentPage === 'home'} />
        <LibraryPage current={current} active={currentPage === 'library'} />
        <PackagesPage current={current} active={currentPage === 'packages'} />
        <StatisticsPage current={current} active={currentPage === 'statistics'} />
        <AvatarPage current={current} active={currentPage === 'avatar'} />
        <OptionsPage current={current} active={currentPage === 'options'} />
      </main>
    </>
  );
}

function NavigationLabel({ label }: { readonly label: string }) {
  const index = label.indexOf('_');
  if (index < 0) {
    return <span className="nav-label">{label}</span>;
  }

  return (
    <span className="nav-label">
      {label.slice(0, index)}<u>{label[index + 1] ?? ''}</u>{label.slice(index + 2)}
    </span>
  );
}