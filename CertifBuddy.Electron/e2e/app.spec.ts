import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let userData: string;

async function windowFor(name: 'main' | 'companion' | 'bubble'): Promise<Page> {
  await expect.poll(() => app.windows().some((page) => page.url().includes(`/renderer/${name}/`)), {
    message: `fenêtre ${name}`,
  }).toBe(true);
  return app.windows().find((page) => page.url().includes(`/renderer/${name}/`))!;
}

test.beforeEach(async () => {
  userData = mkdtempSync(path.join(tmpdir(), 'certif-buddy-e2e-'));
  app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, CERTIF_BUDDY_USER_DATA: userData },
  });
});

test.afterEach(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('downloads a library package, reviews a card and the companion reacts', async () => {
  const main = await windowFor('main');
  await expect(main.getByRole('heading', { name: 'Accueil' })).toBeVisible();

  const companion = await windowFor('companion');
  await expect(companion.locator('body')).toHaveAttribute('data-backend', /webgpu|webgl2/);
  // The assistant is paused at first launch: after appearing, the companion sleeps.
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'sleep');

  await main.getByRole('button', { name: 'Bibliothèque' }).click();
  const firstEntry = main.locator('#library-list li').first();
  await expect(main.locator('#library-list li')).toHaveCount(39);
  await firstEntry.getByRole('button', { name: 'Ajouter' }).click();
  await expect(firstEntry.getByRole('button', { name: 'Ajouté' })).toBeDisabled();

  await main.getByRole('button', { name: 'Accueil' }).click();
  await expect(main.locator('#stat-packages')).toHaveText('1');

  // The first start presents a card immediately; the awake companion can then react.
  await main.getByRole('button', { name: 'Démarrer l’assistant' }).click();
  const bubble = await windowFor('bubble');
  await expect(bubble.locator('.question')).not.toBeEmpty();
  await expect(bubble.locator('#bubble-heading')).toContainText('question 1/1');
  await companion.screenshot({ path: path.join(__dirname, '..', 'test-results', 'companion-request.png') });
  await bubble.getByRole('button', { name: 'Afficher la réponse' }).click();
  await expect(bubble.locator('.answer')).toBeVisible();
  await bubble.getByRole('button', { name: 'Correct' }).click();

  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'celebrate');
  await expect(main.locator('#stat-today')).toHaveText('1');
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'idle');
});

test('keeps the companion asleep during a manual review while the assistant is paused', async () => {
  const main = await windowFor('main');
  const companion = await windowFor('companion');
  await main.getByRole('button', { name: 'Bibliothèque' }).click();
  await main.locator('#library-list li').first().getByRole('button', { name: 'Ajouter' }).click();
  await main.getByRole('button', { name: 'Accueil' }).click();
  await main.getByRole('button', { name: 'Réviser maintenant' }).click();
  const bubble = await windowFor('bubble');
  await bubble.getByRole('button', { name: 'Afficher la réponse' }).click();
  await bubble.getByRole('button', { name: 'Facile' }).click();
  await expect(main.locator('#stat-today')).toHaveText('1');
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'sleep');
});

test('starts the assistant and wakes the companion', async () => {
  const main = await windowFor('main');
  const companion = await windowFor('companion');
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'sleep');
  await main.getByRole('button', { name: 'Démarrer l’assistant' }).click();
  // No package yet: the first presentation shows a message and the companion is awake.
  const bubble = await windowFor('bubble');
  await expect(bubble.getByText('Aucune carte à réviser', { exact: false })).toBeVisible();
  await expect(companion.locator('body')).toHaveAttribute('data-animation', 'idle');
  await expect(main.locator('#assistant-status')).toContainText('Assistant actif');
  await companion.screenshot({ path: path.join(__dirname, '..', 'test-results', 'companion-idle.png') });
});
