import type { LearningBuddyApi } from '../shared/ipc';

declare global {
  interface Window {
    readonly LearningBuddy: LearningBuddyApi;
  }
}

export { };
