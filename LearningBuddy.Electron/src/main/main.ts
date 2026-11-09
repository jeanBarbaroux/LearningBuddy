// Entry point of the main process: single instance, data folder and application start.
import { app, dialog } from 'electron';
import { translate } from '../shared/i18n/i18n';
import { LearningBuddyApplication, dataDirectory } from './application';
import { APP_TITLE, APP_USER_MODEL_ID } from './config';
import { LocalStorageError } from './data/dataStore';
import { describeError, toLocalizedMessage } from './errors';
import { registerIpc } from './ipc/ipcRouter';
import { isStartupLaunch } from './system/startupRegistration';

// Tests use an isolated profile.
if (process.env.LEARNING_BUDDY_USER_DATA) {
  app.setPath('userData', process.env.LEARNING_BUDDY_USER_DATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let application: LearningBuddyApplication | null = null;
  // A second launch brings the running instance to the front.
  app.on('second-instance', () => application?.showMainWindow());
  app.on('before-quit', () => application?.prepareQuit());
  // The application keeps running in the notification area when its windows are closed.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    application = new LearningBuddyApplication({ dataDirectory: dataDirectory(), background: isStartupLaunch(process.argv) });
    registerIpc(application);
    application.start();
  }).catch((error: unknown) => {
    const message = translate('fr', toLocalizedMessage(error, 'StartupFailure'));
    const location = error instanceof LocalStorageError ? `\n\n${error.filePath}` : '';
    dialog.showErrorBox(APP_TITLE, `${message}${location}\n\n${describeError(error)}`);
    app.exit(1);
  });
}
