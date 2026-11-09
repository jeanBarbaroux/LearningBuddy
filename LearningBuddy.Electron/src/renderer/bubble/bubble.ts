import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BubbleApp } from './BubbleApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Racine React de la bulle introuvable.');
}

createRoot(container).render(createElement(BubbleApp));
