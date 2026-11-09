// "Lancer LearningBuddy au démarrage de Windows": Windows starts the application in the background
// (--startup), showing only the companion and the notification area icon.
import { app } from 'electron';

export const STARTUP_ARGUMENT = '--startup';

export function isStartupLaunch(argv: readonly string[]): boolean {
  return argv.some((argument) => argument.toLowerCase() === STARTUP_ARGUMENT || argument === '--background');
}

/**
 * Registers or removes the launch at session start. It is rewritten at every launch so that it follows
 * the location of the executable. Development builds are never registered: the entry would point to the
 * Electron binary of the working copy.
 */
export function applyStartupRegistration(enabled: boolean): void {
  if (!app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [STARTUP_ARGUMENT] });
}
