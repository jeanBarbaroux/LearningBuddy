import type { LearningBuddyApi } from '../shared/ipc';

declare global {
  interface Window {
    readonly learningBuddy: LearningBuddyApi;
  }
}

export { };
