// Paths, sizes and secure defaults shared by the windows of the main process.
import { app } from 'electron';
import path from 'node:path';

export const APP_TITLE = 'LearningBuddy';
export const APP_USER_MODEL_ID = 'com.learningbuddy.app';

/** Companion size at 100 % (Avatar page, 50–200 %). */
export const COMPANION_BASE_SIZE = 168;
/** Bubble width and maximum height at 100 % (v1 ReviewPromptWindow). */
export const BUBBLE_BASE_WIDTH = 412;
export const BUBBLE_BASE_MAX_HEIGHT = 620;
export const BUBBLE_GAP = 2;

export const ASSISTANT_TICK_MS = 1000;
export const WANDER_TICK_MS = 40;

export type RendererName = 'main' | 'companion' | 'bubble' | 'invitation' | 'image';

export function defaultPackagesDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'default-packages')
    : path.resolve(app.getAppPath(), '..', 'assets', 'default-packages');
}

export function rendererPage(name: RendererName): string {
  return path.join(__dirname, '..', 'renderer', name, 'index.html');
}

export function iconPath(): string {
  return path.join(__dirname, '..', 'assets', 'app.ico');
}

/** Context isolation and sandbox for every window; renderers only see the preload bridge. */
export function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
  };
}

/** Windows never navigate away from their page nor open other windows. */
export function hardenNavigation(window: Electron.BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
}

/** Tests disable the Teams detection with LEARNING_BUDDY_TEAMS_DETECTION=off to stay deterministic. */
export function teamsDetectionAllowed(): boolean {
  return process.env.LEARNING_BUDDY_TEAMS_DETECTION !== 'off';
}
