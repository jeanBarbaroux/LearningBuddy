import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MainApp } from './MainApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Racine React de la fenêtre principale introuvable.');
}

createRoot(container).render(createElement(MainApp));
