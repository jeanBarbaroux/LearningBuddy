import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { InvitationApp } from './InvitationApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Racine React de la fenêtre d’invitation introuvable.');
}

createRoot(container).render(createElement(InvitationApp));
