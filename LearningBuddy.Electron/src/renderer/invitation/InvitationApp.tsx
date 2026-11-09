import { useEffect, useState } from 'react';
import type { InvitationView } from '../../shared/ipc';
import { api } from '../lib/api';
import { t, tf } from '../lib/i18n';
import { usePreferences } from '../react/hooks';

export function InvitationApp() {
  const preferences = usePreferences();
  const [view, setView] = useState<InvitationView>({ snoozeMinutes: 5 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.invitation.onView((next) => {
      setView(next);
      setBusy(false);
    });
  }, []);

  if (!preferences) {
    return null;
  }

  const runOnce = (action: () => void): void => {
    if (!busy) {
      setBusy(true);
      action();
    }
  };

  return (
    <section className="invitation" role="alertdialog" aria-labelledby="invitation-text" data-react-app="invitation">
      <p id="invitation-text">{t('ReviewInvitation')}</p>
      <div className="actions">
        <button className="primary" type="button" disabled={busy} onClick={() => runOnce(api.invitation.show)}>{t('ShowReviewInvitation')}</button>
        <button type="button" disabled={busy} onClick={() => runOnce(api.invitation.snooze)}>{tf('SnoozeReview', view.snoozeMinutes)}</button>
        <button className="ghost" type="button" disabled={busy} onClick={() => runOnce(api.invitation.pause)}>{t('PauseAssistant')}</button>
      </div>
    </section>
  );
}