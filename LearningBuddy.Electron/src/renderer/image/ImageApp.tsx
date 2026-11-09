import { useEffect, useState } from 'react';
import type { ImageView } from '../../shared/ipc';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { usePreferences } from '../react/hooks';

export function ImageApp() {
  const preferences = usePreferences();
  const [view, setView] = useState<ImageView | null>(null);

  useEffect(() => {
    api.image.onView(setView);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        api.image.close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.title = t('ImagePreviewTitle');
  }, [preferences]);

  if (!preferences) {
    return null;
  }

  return (
    <>
      <main className="viewer" data-react-app="image">
        {view && <img src={view.dataUrl} alt={t('ImagePreviewTitle')} />}
      </main>
      <footer className="footer">
        <button className="primary" type="button" title={t('CloseImagePreview')} onClick={() => api.image.close()}>{t('Close')}</button>
      </footer>
    </>
  );
}