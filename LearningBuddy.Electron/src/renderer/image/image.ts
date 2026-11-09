import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageApp } from './ImageApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Racine React de la fenêtre image introuvable.');
}

createRoot(container).render(createElement(ImageApp));
