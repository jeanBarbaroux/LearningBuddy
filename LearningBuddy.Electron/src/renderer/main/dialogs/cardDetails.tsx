// Read-only display of a card, shared by the library, the package questions and the import preview.
import { useState } from 'react';
import { imageDataUrl } from '../../../core/cards/images';
import type { CardContent } from '../../../core/model';
import { openDialog } from '../../lib/dialogs';
import { t, tf } from '../../lib/i18n';
import { Icon } from '../../react/Icon';
import { linkedText } from '../../lib/linkText';

export interface CardDetailsOptions {
  /** "Carte 3" label. */
  readonly label?: string;
  /** Current review level, shown in the package questions. */
  readonly level?: number;
}

export function cardDetails(card: CardContent, options: CardDetailsOptions = {}) {
  const meta: string[] = [];
  if (options.level !== undefined) {
    meta.push(`${t('CardReviewLevelPrefix')}${options.level}`);
  }

  if (card.language) {
    meta.push(`${t('LanguagePrefix')}${card.language}`);
  }

  if (card.tags.length > 0) {
    meta.push(`Tags : ${card.tags.join(', ')}`);
  }

  return (
    <div className="card-details">
      {options.label && <p className="card-label">{options.label}</p>}
      {card.question.trim() !== '' && <p className="card-question pre-line">{card.question}</p>}
      <CardImageBlock base64={card.image} alt={t('QuestionCard')} errorText={t('QuestionImageCouldNotBeLoaded')} />
      {card.type === 'qcm' && (
        <ul className="choice-list">
          {card.choices.map((choice, index) => <li className={choice.correct ? 'correct' : ''} key={index}>{choice.correct ? '✓' : '○'} {choice.text}</li>)}
        </ul>
      )}
      {linkedText(card.answer, 'card-answer pre-line', `${t('Answer')} : `)}
      <CardImageBlock base64={card.answerImage} alt={t('AnswerCard')} errorText={t('AnswerImageCouldNotBeLoaded')} />
      {card.explanation && linkedText(card.explanation, 'muted pre-line', t('ExplanationPrefix'))}
      {meta.length > 0 && <p className="muted small">{meta.join('  |  ')}</p>}
    </div>
  );
}

/** Thumbnail with an "enlarge" button, or an error text when the image cannot be decoded. */
function CardImageBlock({ base64, alt, errorText }: { readonly base64: string | null; readonly alt: string; readonly errorText: string }) {
  const [failed, setFailed] = useState(false);
  if (!base64) {
    return null;
  }

  const source = imageDataUrl(base64);
  if (!source || failed) {
    return <p className="field-error">{errorText}</p>;
  }

  return (
    <div className="image-block">
      <img className="image-thumbnail" src={source} alt={alt} onError={() => setFailed(true)} />
      <button type="button" className="icon ghost" title={t('OpenImageLarger')} onClick={() => openImagePreview(source, alt)}>
        <Icon name="zoom" />
      </button>
    </div>
  );
}

export function openImagePreview(source: string, alt: string): void {
  openDialog({ title: t('ImagePreviewTitle'), size: 'wide' }, (handle) => (
    <>
      <div className="dialog-body"><img className="image-full" src={source} alt={alt} /></div>
      <div className="dialog-footer">
        <button type="button" className="primary" title={t('CloseImagePreview')} onClick={handle.close}>{t('Close')}</button>
      </div>
    </>
  ));
}

export function cardLabel(index: number): string {
  return tf('CardLabel', index + 1);
}