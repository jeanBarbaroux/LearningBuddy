import type { AppStateView, LibraryEntryView, PackageView } from '../../shared/ipc';

const api = window.learningBuddy;
let state: AppStateView | null = null;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Élément introuvable : ${id}`);
  }

  return found as T;
}

function navigate(page: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.nav-item')) {
    if (button.dataset.page === page) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }

  for (const section of document.querySelectorAll<HTMLElement>('.page')) {
    section.hidden = section.id !== `page-${page}`;
  }

  if (page === 'library') {
    void refreshLibrary();
  }
}

function render(next: AppStateView): void {
  state = next;
  renderHome(next);
  renderPackages(next.packages);
  renderOptions(next);
}

function renderHome(view: AppStateView): void {
  const status = element('assistant-status');
  if (!view.assistant.active) {
    status.textContent = 'Assistant en pause : le compagnon dort.';
  } else if (view.assistant.series) {
    status.textContent = `Série en cours : question ${view.assistant.series.presented + 1} sur ${view.assistant.series.target}.`;
  } else {
    status.textContent = `Assistant actif. Prochaine question ${formatCountdown(view.assistant.nextPresentationAt)}.`;
  }

  element('assistant-toggle').textContent = view.assistant.active ? 'Mettre en pause' : 'Démarrer l’assistant';
  element('companion-toggle').textContent = view.settings.companionVisible ? 'Masquer le compagnon' : 'Afficher le compagnon';
  element('stat-packages').textContent = String(view.statistics.packageCount);
  element('stat-cards').textContent = String(view.statistics.cardCount);
  element('stat-due').textContent = String(view.statistics.dueCount);
  element('stat-today').textContent = String(view.statistics.reviewedToday);
}

function formatCountdown(at: number): string {
  const seconds = Math.max(0, Math.round((at - Date.now()) / 1000));
  if (seconds === 0) {
    return 'imminente';
  }

  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `dans ${minutes} min ${seconds % 60} s` : `dans ${seconds} s`;
}

function renderPackages(packages: readonly PackageView[]): void {
  const list = element<HTMLUListElement>('package-list');
  list.replaceChildren();
  if (packages.length === 0) {
    list.append(emptyItem('Aucun paquet. Ajoutez-en un depuis la bibliothèque ou importez un fichier.'));
    return;
  }

  for (const item of packages) {
    const row = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.selected;
    checkbox.setAttribute('aria-label', `Réviser ${item.name}`);
    checkbox.addEventListener('change', () => void api.setPackageSelected(item.id, checkbox.checked));

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.name;

    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = `${item.cardCount} cartes`;

    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Supprimer';
    remove.addEventListener('click', () => {
      if (confirm(`Supprimer le paquet « ${item.name} » et son historique de révision ?`)) {
        void api.deletePackage(item.id).then(refreshLibrary);
      }
    });

    row.append(checkbox, title, count, remove);
    list.append(row);
  }
}

async function refreshLibrary(): Promise<void> {
  const list = element<HTMLUListElement>('library-list');
  let entries: LibraryEntryView[];
  try {
    entries = await api.listLibrary();
  } catch (error) {
    list.replaceChildren(emptyItem(`Bibliothèque indisponible : ${(error as Error).message}`));
    return;
  }

  list.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = entry.title;

    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = `${entry.cardCount} cartes`;

    const add = document.createElement('button');
    add.textContent = entry.downloaded ? 'Ajouté' : 'Ajouter';
    add.disabled = entry.downloaded;
    add.addEventListener('click', async () => {
      add.disabled = true;
      await api.downloadLibraryPackage(entry.id);
      add.textContent = 'Ajouté';
    });

    row.append(title, count, add);
    list.append(row);
  }
}

function renderOptions(view: AppStateView): void {
  const form = element<HTMLFormElement>('options-form');
  // Do not overwrite values the user is currently editing.
  if (form.contains(document.activeElement)) {
    return;
  }

  element<HTMLInputElement>('option-interval').value = String(view.settings.intervalMinutes);
  element<HTMLInputElement>('option-questions').value = String(view.settings.questionsPerSeries);
  element<HTMLInputElement>('option-wandering').checked = view.settings.companionWanderingEnabled;
}

function emptyItem(text: string): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'empty';
  item.textContent = text;
  return item;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.nav-item')) {
  button.addEventListener('click', () => navigate(button.dataset.page ?? 'home'));
}

element('assistant-toggle').addEventListener('click', () => void api.setAssistantActive(!state?.assistant.active));
element('review-now').addEventListener('click', () => void api.reviewNow());
element('companion-toggle').addEventListener('click', () =>
  void api.setCompanionVisible(!state?.settings.companionVisible));

element('import-package').addEventListener('click', async () => {
  const output = element('import-result');
  const result = await api.importPackageFile();
  output.className = result.status === 'error' ? 'error' : 'success';
  output.textContent = result.status === 'imported'
    ? `Paquet « ${result.name} » importé (${result.cardCount} cartes).`
    : result.status === 'error'
      ? `Import impossible : ${result.message}`
      : '';
});

element<HTMLFormElement>('options-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const output = element('options-result');
  try {
    await api.updateSettings({
      intervalMinutes: Number(element<HTMLInputElement>('option-interval').value),
      questionsPerSeries: Number(element<HTMLInputElement>('option-questions').value),
      companionWanderingEnabled: element<HTMLInputElement>('option-wandering').checked,
    });
    output.textContent = 'Options enregistrées.';
  } catch (error) {
    output.textContent = `Enregistrement impossible : ${(error as Error).message}`;
  }
});

api.onStateChanged(render);
void api.getState().then(render);
setInterval(() => {
  if (state) {
    renderHome(state);
  }
}, 1000);
