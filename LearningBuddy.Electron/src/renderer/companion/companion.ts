import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanionApp } from './CompanionApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Racine React de la fenêtre compagnon introuvable.');
}

createRoot(container).render(createElement(CompanionApp));
