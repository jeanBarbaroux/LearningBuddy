import { app, dialog } from 'electron';
import { APP_TITLE, describeError } from './config';
import { LearningBuddyApplication } from './application';

if (process.env.CERTIF_BUDDY_USER_DATA) {
  app.setPath('userData', process.env.CERTIF_BUDDY_USER_DATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let application: LearningBuddyApplication | null = null;
  app.on('second-instance', () => application?.showMainWindow());
  app.on('before-quit', () => application?.markQuitting());
  app.on('window-all-closed', () => {});
  app.whenReady().then(() => {
    app.setAppUserModelId('com.learningBuddy.electron');
    application = new LearningBuddyApplication();
    application.start();
  }).catch((error: unknown) => {
    dialog.showErrorBox(APP_TITLE, `Le démarrage a échoué.\n${describeError(error)}`);
    app.exit(1);
  });
}
