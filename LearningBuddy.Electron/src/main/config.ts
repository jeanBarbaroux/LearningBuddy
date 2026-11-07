import { app } from 'electron';
import path from 'node:path';

export const COMPANION_SIZE = 168;
export const BUBBLE_WIDTH = 380;
export const BUBBLE_GAP = 8;
export const WANDER_TICK_MS = 33;
export const ASSISTANT_TICK_MS = 1000;
export const APP_TITLE = 'LearningBuddy';

export function defaultPackagesDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'default-packages')
    : path.resolve(app.getAppPath(), '..', 'assets', 'default-packages');
}

export function rendererPage(name: 'main' | 'companion' | 'bubble'): string {
  return path.join(__dirname, '..', 'renderer', name, 'index.html');
}

export function iconPath(): string {
  return path.join(__dirname, '..', 'assets', 'app.ico');
}

export function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
  };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
