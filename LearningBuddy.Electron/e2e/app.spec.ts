// End-to-end scenarios on the real application (Electron + Playwright), with an isolated profile.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let userData: string;

type WindowName = 'main' | 'companion' | 'bubble' | 'invitation' | 'image';

async function windowFor(name: WindowName): Promise<Page> {
  await expect.poll(() => app.windows().some((page) => page.url().includes(`/renderer/${name}/`)), {
    message: `fenêtre ${name}`,
  }).toBe(true);
  return app.windows().find((page) => page.url().includes(`/renderer/${name}/`))!;
}

async function openPage(main: Page, name: string): Promise<void> {
  await main.locator('.sidenav').getByRole('button', { name, exact: true }).click();
}

/** Downloads the first library package and selects it for the reviews. */
async function prepareReviewPackage(main: Page): Promise<void> {
  await openPage(main, 'Bibliothèque');
  const entry = main.locator('.list li').filter({ hasText: 'Géographie' });
  await entry.getByRole('button', { name: 'Télécharger' }).click();
  await expect(entry.getByRole('button', { name: 'Téléchargé' })).toBeDisabled();
  await openPage(main, 'Paquets & questions');
  await main.getByRole('button', { name: 'Inclure ce paquet dans les révisions' }).click();
  await expect(main.locator('.badge', { hasText: 'Inclus dans les révisions' })).toBeVisible();
  await openPage(main, 'Accueil');
}

/** Replaces the native file dialogs, which cannot be driven by Playwright. */
async function stubOpenDialog(filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [selected] })) as typeof dialog.showOpenDialog;
  }, filePath);
}

test.beforeEach(async () => {
  userData = mkdtempSync(path.join(tmpdir(), 'learning-buddy-e2e-'));
  app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, LEARNING_BUDDY_USER_DATA: userData, LEARNING_BUDDY_TEAMS_DETECTION: 'off' },
  });
});

test.afterEach(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('hides the home page while another page is open', async () => {
  const main = await windowFor('main');
  const homePage = main.locator('#content > .page').nth(0);
  await expect(homePage).toBeVisible();

  await openPage(main, 'Bibliothèque');

  await expect(homePage).toBeHidden();
  await expect(main.locator('#content > .page').nth(1)).toBeVisible();
});

test('reviews a series from a library package and the companion reacts', async () => {
  const main = await windowFor('main');
  const companion = await windowFor('companion');
  await expect(companion.locator('body')).toHaveAttribute('data-backend', /webgpu|webgl2/, { timeout: 30_000 });
  // The assistant is stopped at first launch: once it has appeared, the companion sleeps.
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'sleep');
  await expect(main.getByRole('button', { name: 'Démarrer l’assistant' })).toBeDisabled();

  await prepareReviewPackage(main);
  await expect(main.getByText('Paquet actif pour les révisions : Géographie')).toBeVisible();

  // The first start presents a card immediately.
  await main.getByRole('button', { name: 'Démarrer l’assistant' }).click();
  const bubble = await windowFor('bubble');
  await expect(bubble.locator('.question')).not.toBeEmpty();
  await expect(main.getByText('Série en cours : question 1 sur 1.')).toBeVisible();
  await bubble.getByRole('button', { name: 'Révéler la réponse' }).click();
  await expect(bubble.locator('.answer')).toBeVisible();
  await expect(bubble.getByRole('button', { name: /Correct\s*Niv\. 0 → 1/ })).toBeVisible();
  await bubble.getByRole('button', { name: /Correct/ }).click();

  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'celebrate');
  await expect(main.getByText(/Prochaine question dans 00:(09|10):/)).toBeVisible();
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'idle');

  await openPage(main, 'Statistiques');
  await expect(main.locator('.figure').first()).toContainText('1');
  await expect(main.getByText('Niveau 1 : 1', { exact: false })).toBeVisible();
});

test('pausing closes the question without result and puts the companion to sleep', async () => {
  const main = await windowFor('main');
  const companion = await windowFor('companion');
  await prepareReviewPackage(main);
  await main.getByRole('button', { name: 'Démarrer l’assistant' }).click();
  const bubble = await windowFor('bubble');
  await bubble.getByRole('button', { name: 'Mettre en pause' }).click();
  await expect(main.getByText('Assistant arrêté').first()).toBeVisible();
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'sleep');
  await expect(main.getByRole('button', { name: 'Présenter une question' })).toBeDisabled();
});

test('imports a package with a correction and manages its cards', async () => {
  const main = await windowFor('main');
  const file = path.join(userData, 'paquet.json');
  writeFileSync(file, JSON.stringify({
    format: 'learning-buddy',
    schemaVersion: 1,
    title: 'Paquet de test',
    cards: [
      { question: 'Capitale de la France ?', answer: 'Paris' },
      { question: '   ', answer: 'Sans question' },
    ],
  }));
  await stubOpenDialog(file);
  await openPage(main, 'Paquets & questions');
  await main.getByRole('button', { name: 'Importer un paquet JSON' }).click();

  const preview = main.locator('dialog[open]');
  await expect(preview.getByText('Invalide — corrigez la question')).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Créer le paquet' })).toBeDisabled();
  await preview.getByRole('textbox', { name: 'Carte 2 — Question' }).fill('Capitale de l’Italie ?');
  await expect(preview.locator('.badge.status-corrected')).toHaveText('Corrigée');
  await preview.getByRole('button', { name: 'Créer le paquet' }).click();
  await expect(main.getByText('Le paquet « Paquet de test » et ses 2 cartes ont été importés.')).toBeVisible();
  await main.getByRole('button', { name: 'Fermer' }).click();

  await main.locator('.list li', { hasText: 'Paquet de test' }).getByRole('button', { name: 'Cartes' }).click();
  const questions = main.locator('dialog[open]');
  await expect(questions.locator('.card-list > li')).toHaveCount(2);
  await questions.getByRole('button', { name: 'Ajouter une carte' }).click();
  const editor = main.locator('dialog[open]').last();
  await editor.locator('select').first().selectOption('qcm');
  await editor.getByRole('textbox', { name: 'Question' }).fill('2 + 2 ?');
  await editor.getByRole('textbox', { name: 'Choix de réponse' }).fill('[ ] 3\n[x] 4');
  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(questions.locator('.card-list > li')).toHaveCount(3);
  await expect(questions.getByText('✓ 4')).toBeVisible();

  await questions.getByPlaceholder('Rechercher dans les cartes').fill('Italie');
  await expect(questions.locator('.card-list > li')).toHaveCount(1);
  await questions.locator('.card-list > li').getByRole('button', { name: 'Supprimer' }).click();
  await main.locator('dialog[open]').last().getByRole('button', { name: 'Supprimer' }).click();
  await questions.getByPlaceholder('Rechercher dans les cartes').fill('');
  await expect(questions.locator('.card-list > li')).toHaveCount(2);
});

test('opens links in revealed answers and explanations through Electron', async () => {
  const main = await windowFor('main');
  const file = path.join(userData, 'links.json');
  writeFileSync(file, JSON.stringify({
    format: 'learning-buddy',
    schemaVersion: 1,
    title: 'Liens',
    cards: [{
      question: 'Question ?',
      answer: 'Voir https://example.com/answer.',
      explanation: 'Plus sur www.example.com/details.',
    }],
  }));
  await app.evaluate(({ shell }) => {
    const trackedShell = shell as typeof shell & { openedUrls: string[] };
    trackedShell.openedUrls = [];
    shell.openExternal = async (url: string) => { trackedShell.openedUrls.push(url); };
  });
  await stubOpenDialog(file);
  await openPage(main, 'Paquets & questions');
  await main.getByRole('button', { name: 'Importer un paquet JSON' }).click();
  await main.locator('dialog[open]').getByRole('button', { name: 'Créer le paquet' }).click();
  await main.locator('dialog[open]').getByRole('button', { name: 'Fermer' }).click();
  await main.locator('.list li', { hasText: 'Liens' }).getByRole('button', { name: 'Inclure ce paquet dans les révisions' }).click();
  await openPage(main, 'Accueil');
  await main.getByRole('button', { name: 'Démarrer l’assistant' }).click();
  const bubble = await windowFor('bubble');
  await bubble.getByRole('button', { name: 'Révéler la réponse' }).click();
  await bubble.getByRole('link', { name: 'https://example.com/answer' }).click();
  await bubble.getByRole('link', { name: 'www.example.com/details' }).click();
  await expect.poll(() => app.evaluate(({ shell }) =>
    (shell as typeof shell & { openedUrls: string[] }).openedUrls)).toEqual([
    'https://example.com/answer',
    'https://www.example.com/details',
  ]);
});

test('renames a package with validation and keyboard controls', async () => {
  const main = await windowFor('main');
  await prepareReviewPackage(main);
  await openPage(main, 'Paquets & questions');
  const entry = main.locator('.list li', { hasText: 'Géographie' });
  await entry.getByRole('button', { name: 'Renommer' }).click();
  const dialog = main.getByRole('dialog', { name: 'Renommer' });
  const name = dialog.getByRole('textbox', { name: 'Nom du paquet' });
  await name.fill('  ');
  await name.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('Le nom du paquet doit contenir entre 1 et 100 caractères.');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.press('Escape');
  await expect(dialog).toHaveCount(0);
  await entry.getByRole('button', { name: 'Renommer' }).click();
  await main.getByRole('dialog', { name: 'Renommer' }).getByRole('textbox', { name: 'Nom du paquet' }).fill('Nouveau nom');
  await main.getByRole('dialog', { name: 'Renommer' }).getByRole('textbox', { name: 'Nom du paquet' }).press('Enter');
  await expect(main.getByRole('dialog', { name: 'Renommer' })).toHaveCount(0);
  await expect(main.locator('.list li', { hasText: 'Nouveau nom' })).toBeVisible();
});

test('rejects an invalid fixed schedule and saves a valid one', async () => {
  const main = await windowFor('main');
  await main.getByRole('radio', { name: 'Horaires fixes' }).check();
  await main.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(main.getByText('Ajoutez au moins un horaire au format HH:mm')).toBeVisible();
  await main.getByRole('button', { name: 'Fermer' }).click();

  await main.getByRole('radio', { name: 'Horaires fixes' }).check();
  await main.getByRole('button', { name: 'Ajouter un horaire' }).click();
  await main.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(main.getByRole('radio', { name: 'Horaires fixes' })).toBeChecked();
  await expect(main.getByRole('textbox', { name: 'Heure (HH:mm)' })).toHaveValue('09:00');
});

test('switches the interface to English and the dark theme', async () => {
  const main = await windowFor('main');
  await openPage(main, 'Options');
  await main.getByRole('radio', { name: 'Sombre' }).check();
  await expect(main.locator('html')).toHaveAttribute('data-theme', 'dark');
  await main.getByRole('combobox', { name: 'Langue de l’interface' }).selectOption('en');
  await expect(main.getByRole('heading', { name: 'Options' })).toBeVisible();
  await expect(main.getByRole('combobox', { name: 'Interface language' })).toBeVisible();
  await openPage(main, 'Home');
  await expect(main.getByRole('heading', { name: 'Your review space' })).toBeVisible();
});

test('shows and hides the bubble preview from the Avatar page', async () => {
  const main = await windowFor('main');
  await openPage(main, 'Avatar');
  await main.getByRole('button', { name: 'Aperçu de la bulle' }).click();
  const bubble = await windowFor('bubble');
  await expect(bubble.getByRole('heading', { name: 'Aperçu de la bulle' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Masquer l’aperçu' })).toBeVisible();
  await bubble.getByRole('button', { name: 'Révéler la réponse' }).click();
  await bubble.getByRole('button', { name: /Facile/ }).click();
  await expect(main.getByRole('button', { name: 'Aperçu de la bulle' })).toBeVisible();
});
