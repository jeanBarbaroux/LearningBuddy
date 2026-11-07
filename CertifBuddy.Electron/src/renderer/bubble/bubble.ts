import type { ReviewOutcome } from '../../core/types';
import type { BubbleView, CardView } from '../../shared/ipc';

const api = window.certifBuddy;
const bubble = document.getElementById('bubble')!;
const heading = document.getElementById('bubble-heading')!;
const content = document.getElementById('content')!;

const OUTCOMES: readonly { outcome: ReviewOutcome; label: string; key: string }[] = [
  { outcome: 'again', label: 'À revoir', key: '1' },
  { outcome: 'hard', label: 'Difficile', key: '2' },
  { outcome: 'good', label: 'Correct', key: '3' },
  { outcome: 'easy', label: 'Facile', key: '4' },
];

let revealed = false;
let reveal: (() => void) | null = null;

function render(view: BubbleView): void {
  revealed = false;
  reveal = null;
  content.replaceChildren();
  if (view.kind === 'message') {
    heading.textContent = 'CertifBuddy';
    content.append(paragraph(view.text, 'question'), actions(button('Fermer', () => api.bubbleClose(), 'primary')));
  } else {
    heading.textContent = view.series
      ? `${view.packageName} · question ${view.series.index}/${view.series.target}`
      : view.packageName;
    renderCard(view.card);
  }

  queueMicrotask(() => content.querySelector<HTMLElement>('input, button.primary')?.focus());
}

function renderCard(card: CardView): void {
  if (card.question) {
    content.append(paragraph(card.question, 'question'));
  }

  if (card.imageDataUrl) {
    content.append(image(card.imageDataUrl, 'Illustration de la question'));
  }

  const choiceInputs = card.type === 'qcm' ? renderChoices(card) : [];
  const answerArea = document.createElement('div');
  const toolbar = actions(
    button('Passer', () => api.bubbleAnswer('passed')),
    button(card.type === 'qcm' ? 'Valider' : 'Afficher la réponse', () => reveal?.(), 'primary'),
  );
  content.append(answerArea, toolbar);

  reveal = () => {
    if (revealed) {
      return;
    }

    revealed = true;
    choiceInputs.forEach(({ input, row, correct }) => {
      input.disabled = true;
      row.classList.add(correct
        ? input.checked ? 'correct-selected' : 'correct-missed'
        : input.checked ? 'incorrect-selected' : 'incorrect-not-selected');
    });
    if (card.type === 'card' || card.answer.trim() !== correctChoicesText(card)) {
      answerArea.append(paragraph(card.answer, 'answer'));
    }

    if (card.answerImageDataUrl) {
      answerArea.append(image(card.answerImageDataUrl, 'Illustration de la réponse'));
    }

    if (card.explanation) {
      answerArea.append(paragraph(card.explanation, 'explanation'));
    }

    const outcomes = actions(...OUTCOMES.map(({ outcome, label, key }) => {
      const result = button(label, () => api.bubbleAnswer(outcome));
      result.classList.add(`outcome-${outcome}`);
      result.title = `Raccourci : ${key}`;
      return result;
    }));
    outcomes.classList.add('outcomes');
    toolbar.replaceWith(outcomes);
    outcomes.querySelector('button')?.focus();
  };
}

function renderChoices(card: CardView): { input: HTMLInputElement; row: HTMLLabelElement; correct: boolean }[] {
  const multiple = card.choices.filter((choice) => choice.correct).length > 1;
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'choices';
  const legend = document.createElement('legend');
  legend.className = 'muted';
  legend.textContent = multiple ? 'Plusieurs réponses attendues' : 'Une seule réponse attendue';
  fieldset.append(legend);
  const inputs = card.choices.map((choice) => {
    const row = document.createElement('label');
    row.className = 'choice';
    const input = document.createElement('input');
    input.type = multiple ? 'checkbox' : 'radio';
    input.name = 'choice';
    const text = document.createElement('span');
    text.textContent = choice.text;
    row.append(input, text);
    fieldset.append(row);
    return { input, row, correct: choice.correct };
  });
  content.append(fieldset);
  return inputs;
}

function correctChoicesText(card: CardView): string {
  return card.choices.filter((choice) => choice.correct).map((choice) => choice.text).join('\n');
}

function paragraph(text: string, className: string): HTMLParagraphElement {
  const result = document.createElement('p');
  result.className = className;
  result.textContent = text;
  return result;
}

function image(source: string, alt: string): HTMLImageElement {
  const result = document.createElement('img');
  result.src = source;
  result.alt = alt;
  return result;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.textContent = label;
  result.className = className;
  result.addEventListener('click', onClick);
  return result;
}

function actions(...buttons: HTMLButtonElement[]): HTMLDivElement {
  const result = document.createElement('div');
  result.className = 'actions';
  result.append(...buttons);
  return result;
}

document.getElementById('close')!.addEventListener('click', () => api.bubbleClose());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    api.bubbleClose();
    return;
  }

  const shortcut = OUTCOMES.find(({ key }) => key === event.key);
  if (revealed && shortcut) {
    api.bubbleAnswer(shortcut.outcome);
  }
});

// The main process sizes the window to the natural bubble height (content + borders + body margin).
const reportSize = (): void => api.bubbleResize(bubble.scrollHeight + 5 + 12);
const resizeObserver = new ResizeObserver(reportSize);
resizeObserver.observe(content);
resizeObserver.observe(heading);
api.onBubbleView(render);
