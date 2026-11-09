// Card editor (v1 CardEditorWindow): type, question, images, answer, QCM choices, explanation, language,
// tags and, for an existing card, its review level.
import { useEffect, useRef, useState } from 'react';
import { formatChoicesText, hasCustomAnswer, parseChoicesText } from '../../../core/cards/cardChoices';
import { CardValidationError, normalizeCardContent, type CardField } from '../../../core/cards/cardContent';
import { imageDataUrl } from '../../../core/cards/images';
import type { CardContent, CardType } from '../../../core/model';
import type { TextKey } from '../../../shared/i18n/texts';
import type { CardRow } from '../../../shared/ipc';
import { api } from '../../lib/api';
import { alertDialog, openDialog, type DialogHandle } from '../../lib/dialogs';
import { errorMessage, t } from '../../lib/i18n';
import { Icon } from '../../react/Icon';

const FIELD_MESSAGES: Readonly<Record<CardField, TextKey>> = {
  question: 'QuestionRequired',
  answer: 'AnswerRequired',
  image: 'CardImageInvalid',
  answerImage: 'CardImageInvalid',
  language: 'CardEditorLanguageInvalid',
  tags: 'CardEditorTagsInvalid',
  choices: 'CardEditorChoicesInvalid',
};

export interface CardEditorOptions {
  readonly packageId: string;
  /** Card to edit; a new card is created when absent. */
  readonly card?: CardRow;
}

/** Opens the card shown in the review bubble ("Modifier la carte"). */
export async function openCardEditorById(cardId: string): Promise<void> {
  try {
    const card = await api.cards.get(cardId);
    await openCardEditor({ packageId: card.packageId, card });
  } catch (error) {
    await alertDialog(t('EditCardTitle'), errorMessage(error), 'error');
  }
}

/** Resolves to true when the card was saved. */
export function openCardEditor(options: CardEditorOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let saved = false;
    const existing = options.card;
    openDialog({ title: t(existing ? 'EditCardTitle' : 'CreateCardTitle'), size: 'wide', onClose: () => resolve(saved) }, (handle) => (
      <CardEditorDialog options={options} handle={handle} onSaved={() => { saved = true; }} />
    ));
  });
}

function CardEditorDialog({ options, handle, onSaved }: { readonly options: CardEditorOptions; readonly handle: DialogHandle; readonly onSaved: () => void }) {
  const existing = options.card;
  const [type, setType] = useState<CardType>(existing?.type ?? 'card');
  const [question, setQuestion] = useState(existing?.question ?? '');
  const [answer, setAnswer] = useState(existing && !(existing.type === 'qcm' && !hasCustomAnswer(existing.answer, existing.choices)) ? existing.answer : '');
  const [choices, setChoices] = useState(existing ? formatChoicesText(existing.choices) : '');
  const [explanation, setExplanation] = useState(existing?.explanation ?? '');
  const [language, setLanguage] = useState(existing?.language ?? '');
  const [tags, setTags] = useState(existing?.tags.join('\n') ?? '');
  const [level, setLevel] = useState(existing ? String(existing.level) : '');
  const [questionImage, setQuestionImage] = useState<string | null>(existing?.image ?? null);
  const [answerImage, setAnswerImage] = useState<string | null>(existing?.answerImage ?? null);
  const [errors, setErrors] = useState<Partial<Record<CardField | 'level', string>>>({});
  const [saving, setSaving] = useState(false);
  const errorRefs = useRef<Partial<Record<CardField | 'level', HTMLParagraphElement | null>>>({});

  useEffect(() => {
    const firstError = Object.keys(errors)[0] as CardField | 'level' | undefined;
    if (firstError) {
      errorRefs.current[firstError]?.scrollIntoView({ block: 'nearest' });
    }
  }, [errors]);

  const showError = (field: CardField | 'level', message: string): void => setErrors({ [field]: message });
  const error = (field: CardField | 'level') => errors[field] && (
    <p className="field-error" ref={(element) => { errorRefs.current[field] = element; }}>{errors[field]}</p>
  );

  const save = async (): Promise<void> => {
    setErrors({});
    const content: CardContent = {
      type,
      question,
      answer,
      explanation,
      language,
      tags: tags.split(/\r?\n/).filter((tag) => tag.trim() !== ''),
      choices: type === 'qcm' ? parseChoicesText(choices) : [],
      image: questionImage,
      answerImage,
    };
    try {
      normalizeCardContent(content);
    } catch (failure) {
      if (failure instanceof CardValidationError) {
        showError(failure.field, t(FIELD_MESSAGES[failure.field]));
        return;
      }

      throw failure;
    }

    let newLevel: number | null = null;
    if (existing) {
      if (!/^\d{1,9}$/.test(level.trim())) {
        showError('level', t('CardEditorLevelInvalid'));
        return;
      }

      newLevel = Number(level.trim());
    }

    setSaving(true);
    try {
      if (existing) {
        await api.cards.update(existing.id, content, newLevel === existing.level ? null : newLevel);
      } else {
        await api.cards.add(options.packageId, content);
      }

      onSaved();
      handle.close();
    } catch (failure) {
      setSaving(false);
      await alertDialog(t('CardEditorInvalidTitle'), `${t('CardNotSaved')}\n${errorMessage(failure)}`, 'error');
    }
  };

  const levelOptions = new Set([0, 1, 2, 3, 4, 5, existing?.level ?? 0]);
  return (
    <>
      <div className="dialog-body">
        <label className="field">{t('CardTypeLabel')}
          <select value={type} onChange={(event) => setType(event.target.value as CardType)}>
            <option value="card">{t('CardTypeCard')}</option>
            <option value="qcm">{t('CardTypeQcm')}</option>
          </select>
        </label>
        <label className="field">{t('Question')}
          <textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} autoFocus />
          {error('question')}
        </label>
        <ImagePicker value={questionImage} label={t('CardImageLabel')} hint={t('CardImageHint')} onChange={setQuestionImage} />
        {error('image')}
        <label className="field">{t('Answer')}
          <textarea rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          {type === 'qcm' && <span className="field-help">{t('CardQcmAnswerHint')}</span>}
          {error('answer')}
        </label>
        <ImagePicker value={answerImage} label={t('AnswerImageLabel')} hint={t('AnswerImageHint')} onChange={setAnswerImage} />
        {error('answerImage')}
        {type === 'qcm' && (
          <label className="field">{t('CardChoicesLabel')}
            <textarea rows={5} value={choices} onChange={(event) => setChoices(event.target.value)} />
            <span className="field-help">{t('CardChoicesHint')}</span>
            {error('choices')}
          </label>
        )}
        <label className="field">{t('CardExplanationLabel')}
          <textarea rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
        </label>
        <label className="field">{t('CardLanguageLabel')}
          <input type="text" maxLength={255} value={language} onChange={(event) => setLanguage(event.target.value)} />
          {error('language')}
        </label>
        <label className="field">{t('CardTagsLabel')}
          <textarea rows={3} value={tags} onChange={(event) => setTags(event.target.value)} />
          <span className="field-help">{t('CardTagsHint')}</span>
          {error('tags')}
        </label>
        {existing && (
          <label className="field narrow-field">{t('CardReviewLevelLabel')}
            <input type="text" inputMode="numeric" list="card-levels" value={level} onChange={(event) => setLevel(event.target.value)} />
            <datalist id="card-levels">{[...levelOptions].sort((a, b) => a - b).map((value) => <option value={value} key={value} />)}</datalist>
            <span className="field-help">{t('CardReviewLevelHint')}</span>
            {error('level')}
          </label>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={handle.close}>{t('Cancel')}</button>
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{t('Save')}</button>
      </div>
    </>
  );
}

function ImagePicker({ value, label, hint, onChange }: { readonly value: string | null; readonly label: string; readonly hint: string; readonly onChange: (image: string | null) => void }) {
  const source = imageDataUrl(value);
  const choose = async (): Promise<void> => {
    try {
      const base64 = await api.cards.chooseImage();
      if (base64) {
        onChange(base64);
      }
    } catch (failure) {
      await alertDialog(label, errorMessage(failure), 'error');
    }
  };

  return (
    <div className="field">
      <span>{label}</span>
      <span className="field-help">{hint}</span>
      <div className="image-block">{source && <img className="image-thumbnail" src={source} alt={label} />}</div>
      <div className="row">
        <button type="button" onClick={() => void choose()}><Icon name="upload" />{t('CardImageChoose')}</button>
        <button type="button" className="ghost" hidden={!value} onClick={() => onChange(null)}><Icon name="trash" />{t('CardImageRemove')}</button>
      </div>
    </div>
  );
}