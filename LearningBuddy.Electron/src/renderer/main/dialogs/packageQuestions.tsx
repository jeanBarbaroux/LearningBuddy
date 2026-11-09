// Cards of a package: search, level filter, add, edit and delete (v1 PackageQuestionsWindow).
import { useCallback, useEffect, useState } from 'react';
import { MAX_CARDS_PER_PACKAGE } from '../../../core/packages/packageFormat';
import { containsIgnoringCase } from '../../../core/text';
import type { CardRow } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog, confirmDialog, openDialog, type DialogHandle } from '../../lib/dialogs';
import { errorMessage, t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { state } from '../state';
import { openCardEditor } from './cardEditor';
import { cardDetails, cardLabel } from './cardDetails';

/** "all", a level 0–4, or "5" for 5 and more. */
type LevelFilter = 'all' | '0' | '1' | '2' | '3' | '4' | '5';

export async function openPackageQuestions(packageId: string): Promise<void> {
  const summary = state().packages.find((candidate) => candidate.id === packageId);
  if (!summary) {
    await alertDialog(t('PackageCardsHeading'), t('PackageMissing'), 'error');
    return;
  }

  openDialog({ title: `${t('PackageCardsHeading')} — ${summary.name}`, size: 'wide' }, (handle) => (
    <PackageQuestionsDialog packageId={packageId} handle={handle} />
  ));
}

function PackageQuestionsDialog({ packageId, handle }: { readonly packageId: string; readonly handle: DialogHandle }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setCards(await api.cards.list(packageId));
      setLoadError(null);
    } catch (failure) {
      setCards([]);
      setLoadError(`${t('PackageCardsNotLoaded')} ${errorMessage(failure)}`);
    }
  }, [packageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const matches = (card: CardRow): boolean => {
    const levelMatches = level === 'all' || (level === '5' ? card.level >= 5 : card.level === Number(level));
    const texts = [card.question, card.answer, card.explanation, card.language, ...card.tags, ...card.choices.map((choice) => choice.text)];
    return levelMatches && (search.trim() === '' || texts.some((value) => containsIgnoringCase(value, search.trim())));
  };

  const visible = cards.map((card, index) => ({ card, index })).filter(({ card }) => matches(card));
  const add = async (): Promise<void> => {
    if (cards.length >= MAX_CARDS_PER_PACKAGE) {
      await alertDialog(t('AddCard'), t('CardLimitReached'), 'error');
      return;
    }

    if (await openCardEditor({ packageId })) {
      await reload();
    }
  };

  const remove = async (card: CardRow, index: number): Promise<void> => {
    const name = card.question.trim() || cardLabel(index);
    if (!await confirmDialog(t('ConfirmDeleteTitle'), tf('ConfirmDeleteCardMessage', name))) {
      return;
    }

    try {
      await api.cards.delete(card.id);
      await reload();
    } catch (failure) {
      await alertDialog(t('CardNotDeleted'), errorMessage(failure), 'error');
    }
  };

  const listContent = loadError
    ? <li className="empty">{loadError}</li>
    : cards.length === 0
      ? <li className="empty">{t('PackageHasNoCards')}</li>
      : visible.length === 0
        ? <li className="empty">{t('NoCardsMatchSearch')}</li>
        : visible.map(({ card, index }) => (
          <li key={card.id}>
            {cardDetails(card, { label: cardLabel(index), level: card.level })}
            <div className="row">
              <button type="button" onClick={() => void openCardEditor({ packageId, card }).then(async (saved) => {
                if (saved) {
                  await reload();
                }
              })}>
                <Icon name="edit" />{t('EditCardTitle')}
              </button>
              <button type="button" className="danger" onClick={() => void remove(card, index)}><Icon name="trash" />{t('Delete')}</button>
            </div>
          </li>
        ));

  return (
    <>
      <div className="dialog-body">
        <div className="row">
          <input type="search" placeholder={t('SearchCards')} aria-label={t('SearchCards')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label={t('FilterCardsByLevel')} value={level} onChange={(event) => setLevel(event.target.value as LevelFilter)}>
            <option value="all">{t('AllCardLevels')}</option>
            {['0', '1', '2', '3', '4'].map((value) => <option value={value} key={value}>{tf('StatisticsCardLevel', value)}</option>)}
            <option value="5">{t('CardReviewLevel5Plus')}</option>
          </select>
          <span className="grow" />
          <button type="button" className="primary" disabled={cards.length >= MAX_CARDS_PER_PACKAGE} onClick={() => void add()}>
            <Icon name="plus" />{t('AddCard')}
          </button>
        </div>
        <p className="muted small" role="status">{visible.length} / {cards.length}</p>
        <ol className="card-list selectable">{listContent}</ol>
      </div>
      <div className="dialog-footer"><button type="button" className="primary" onClick={handle.close}>{t('Close')}</button></div>
    </>
  );
}