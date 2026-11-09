// "Cartes de la bibliothèque — {title}": read-only preview of a library package (v1 LibraryCardsWindow).
import type { LibraryEntryView } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog, openDialog, type DialogHandle } from '../../lib/dialogs';
import { errorMessage, language, t } from '../../lib/i18n';
import { cardCount } from '../../../shared/i18n/i18n';
import { cardDetails, cardLabel } from './cardDetails';

export async function openLibraryCards(entry: LibraryEntryView): Promise<void> {
  try {
    const cards = await api.library.cards(entry.id);
    openDialog({ title: `${t('LibraryCardsTitle')} — ${entry.title}`, size: 'wide' }, (handle) => (
      <LibraryCardsDialog cards={cards} handle={handle} />
    ));
  } catch (failure) {
    await alertDialog(t('LibraryCardsTitle'), errorMessage(failure), 'error');
  }
}

function LibraryCardsDialog({ cards, handle }: { readonly cards: Awaited<ReturnType<typeof api.library.cards>>; readonly handle: DialogHandle }) {
  return (
    <>
      <div className="dialog-body">
        <p className="muted">{cardCount(language(), cards.length)}</p>
        <ol className="card-list">
          {cards.map((card, index) => <li key={index}>{cardDetails(card, { label: cardLabel(index) })}</li>)}
        </ol>
      </div>
      <div className="dialog-footer"><button type="button" className="primary" onClick={handle.close}>{t('Close')}</button></div>
    </>
  );
}