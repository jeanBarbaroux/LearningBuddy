import type { CertifBuddyApi } from '../shared/ipc';

declare global {
  interface Window {
    readonly certifBuddy: CertifBuddyApi;
  }
}

export {};
