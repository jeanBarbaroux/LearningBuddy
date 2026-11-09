import { useEffect, useRef, useState, type RefObject } from 'react';
import { allowsMultipleAnswers, evaluateChoice, hasCustomAnswer, type ChoiceEvaluation } from '../../core/cards/cardChoices';
import { RATING_OUTCOMES, type RatingOutcome } from '../../core/model';
import { linkify } from '../../core/text';
import type { TextKey } from '../../shared/i18n/texts';
import type { BubblePlacementView, BubbleView } from '../../shared/ipc';
import { api } from '../lib/api';
import { errorMessage, message, t, tf } from '../lib/i18n';
import { Icon } from '../react/Icon';
import { usePreferences } from '../react/hooks';

const RATING_TEXT: Readonly<Record<RatingOutcome, TextKey>> = {
  again: 'ReviewAgain',
  hard: 'ReviewHard',
  good: 'ReviewGood',
  easy: 'ReviewEasy',
};

const EVALUATION_TEXT: Readonly<Partial<Record<ChoiceEvaluation, TextKey>>> = {
  correctSelected: 'QcmCorrectSelected',
  incorrectSelected: 'QcmIncorrectSelected',
  correctMissed: 'QcmCorrectMissed',
};

export function BubbleApp() {
  const preferences = usePreferences();
  const [view, setView] = useState<BubbleView | null>(null);
  const [placement, setPlacement] = useState<BubblePlacementView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const bubble = useRef<HTMLElement>(null);
  const firstRating = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.bubble.onView((next) => {
      setView(next);
      setRevealed(false);
      setSelected({});
    });
    api.bubble.onPlacement(setPlacement);
  }, []);

  useEffect(() => {
    if (placement) {
      document.body.dataset.side = placement.side;
    }
  }, [placement]);

  useEffect(() => {
    if (bubble.current) {
      const element = bubble.current;
      const reportSize = (): void => {
        requestAnimationFrame(() => api.bubble.resize(element.getBoundingClientRect().height + 2));
      };
      const observer = new ResizeObserver(reportSize);
      observer.observe(element);
      reportSize();
      return () => observer.disconnect();
    }
  }, [view, revealed, preferences]);

  useEffect(() => {
    if (placement && bubble.current) {
      bubble.current.style.setProperty('--tail-y', `${placement.tailY}px`);
    }
  }, [placement, view, revealed]);

  useEffect(() => {
    if (revealed) {
      firstRating.current?.focus();
    }
  }, [revealed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        api.bubble.close();
        return;
      }

      const outcome = RATING_OUTCOMES[Number(event.key) - 1];
      if (revealed && outcome && view?.kind === 'card') {
        rate(view, outcome);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [revealed, view]);

  if (!preferences) {
    return null;
  }

  const title = view?.kind === 'message'
    ? message(view.title)
    : view?.kind === 'card' && view.preview ? t('BubblePreviewTitle') : t('ReviewWindowTitle');

  return (
    <article ref={bubble} className="bubble" aria-live="polite" data-react-app="bubble">
      <header className="bubble-header">
        <h1>{title}</h1>
        <button className="icon ghost" type="button" title={t('CloseBubble')} aria-label={t('CloseBubble')} onClick={() => api.bubble.close()}>
          <Icon name="close" />
        </button>
      </header>
      <div className="bubble-content">
        {view?.kind === 'message' ? (
          <>
            <p className="question pre-line">{message(view.message)}</p>
            <div className="actions"><button className="primary" type="button" onClick={() => api.bubble.close()}>{t('Close')}</button></div>
          </>
        ) : view?.kind === 'card' ? (
          <CardView view={view} revealed={revealed} selected={selected} firstRating={firstRating}
            onSelect={setSelected} onReveal={() => setRevealed(true)} />
        ) : null}
      </div>
    </article>
  );
}

function CardView({
  view,
  revealed,
  selected,
  firstRating,
  onSelect,
  onReveal,
}: {
  readonly view: Extract<BubbleView, { kind: 'card' }>;
  readonly revealed: boolean;
  readonly selected: Record<number, boolean>;
  readonly firstRating: RefObject<HTMLButtonElement | null>;
  readonly onSelect: (update: (previous: Record<number, boolean>) => Record<number, boolean>) => void;
  readonly onReveal: () => void;
}) {
  const { card, preview, packageName } = view;
  const multiple = card.type === 'qcm' && allowsMultipleAnswers(card.choices);
  const showAnswerText = card.type === 'card' || hasCustomAnswer(card.answer, card.choices);
  const close = (): void => api.bubble.close();

  return (
    <>
      {card.question.trim() !== '' && <p className="question pre-line">{card.question}</p>}
      <ImageWithZoom key={card.imageDataUrl ?? 'no-question-image'} source={card.imageDataUrl} alt={t('QuestionCard')} errorText={t('QuestionImageCouldNotBeLoaded')} />
      {packageName && <p className="muted small">{tf('ReviewPackageOrigin', packageName)}</p>}
      {card.type === 'qcm' && (
        <fieldset className="choices">
          <legend className="muted small">{t(multiple ? 'QcmMultipleAnswersHint' : 'QcmSingleAnswerHint')}</legend>
          {card.choices.map((choice, index) => {
            const evaluation = revealed ? evaluateChoice(choice, selected[index] ?? false) : null;
            const evaluationText = evaluation ? EVALUATION_TEXT[evaluation] : undefined;
            return (
              <label className={`choice${evaluation ? ` ${evaluation}` : ''}`} key={index}>
                <input type={multiple ? 'checkbox' : 'radio'} name="choice" checked={selected[index] ?? false} disabled={revealed}
                  onChange={(event) => onSelect((previous) => multiple
                    ? { ...previous, [index]: event.target.checked }
                    : { [index]: event.target.checked })} />
                <span className="choice-text">{choice.text}</span>
                {evaluationText && <span className="evaluation">{t(evaluationText)}</span>}
              </label>
            );
          })}
        </fieldset>
      )}
      <div className="answer-area">
        {revealed && (
          <>
            {(showAnswerText || card.answerImageDataUrl) && <p className="caption">{t('Answer')}</p>}
            {showAnswerText && <LinkedText text={card.answer} className="answer pre-line" />}
            <ImageWithZoom key={card.answerImageDataUrl ?? 'no-answer-image'} source={card.answerImageDataUrl} alt={t('AnswerCard')} errorText={t('AnswerImageCouldNotBeLoaded')} />
            {card.explanation && <LinkedText text={card.explanation} className="explanation pre-line" />}
            {card.type === 'qcm' && <p className="muted small">{t('QcmSelfAssessmentHint')}</p>}
            <div className="ratings">
              {RATING_OUTCOMES.map((outcome, index) => (
                <button className={`rating rating-${outcome}`} type="button" key={outcome}
                  title={`${t(RATING_TEXT[outcome])} (${index + 1})`} ref={index === 0 ? firstRating : undefined}
                  onClick={() => rate(view, outcome)}>
                  <span>{t(RATING_TEXT[outcome])}</span>
                  <span className="level-change">{tf('ReviewLevelChange', card.level, card.nextLevels[outcome])}</span>
                </button>
              ))}
            </div>
            {!preview && <div className="actions">
              <button className="ghost small" type="button" onClick={() => api.bubble.editCard(card.id)}>
                <Icon name="edit" />{t('EditCard')}
              </button>
            </div>}
          </>
        )}
      </div>
      {!revealed ? (
        <>
          <div className="actions"><button className="primary" type="button" onClick={onReveal}>{t('RevealAnswerButton')}</button></div>
          <div className="actions">
            <button type="button" onClick={preview ? close : () => api.bubble.answer('passed')}>{t('PassCard')}</button>
            <button className="ghost" type="button" onClick={preview ? close : () => api.bubble.pause()}>{t('PauseAssistant')}</button>
          </div>
          <p className="muted small">{t('CloseWithoutResultHint')}</p>
        </>
      ) : null}
    </>
  );
}

function LinkedText({ text, className }: { readonly text: string; readonly className: string }) {
  return (
    <p className={className}>
      {linkify(text).map((segment, index) => {
        const url = segment.url;
        return url ? (
          <a href="#" title={url} key={index} onClick={(event) => {
            event.preventDefault();
            void api.app.openExternal(url).catch((error: unknown) => window.alert(errorMessage(error)));
          }}>{segment.text}</a>
        ) : segment.text;
      })}
    </p>
  );
}

function ImageWithZoom({ source, alt, errorText }: { readonly source: string | null; readonly alt: string; readonly errorText: string }) {
  const [failed, setFailed] = useState(false);
  if (!source) {
    return null;
  }

  if (failed) {
    return <p className="field-error">{errorText}</p>;
  }

  return (
    <div className="image-block">
      <img className="bubble-image" src={source} alt={alt} onLoad={() => requestAnimationFrame(() => {
        const bubble = document.querySelector<HTMLElement>('.bubble');
        if (bubble) api.bubble.resize(bubble.getBoundingClientRect().height + 2);
      })} onError={() => setFailed(true)} />
      <button className="icon ghost" type="button" title={t('OpenImageLarger')} aria-label={t('OpenImageLarger')}
        onClick={() => api.bubble.showImage(source)}><Icon name="zoom" /></button>
    </div>
  );
}

function rate(view: Extract<BubbleView, { kind: 'card' }>, outcome: RatingOutcome): void {
  if (view.preview) {
    api.bubble.close();
  } else {
    api.bubble.answer(outcome);
  }
}