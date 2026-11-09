// Sandboxed preload: exposes a narrow bridge limited to the channels of the IPC contract; renderers never
// get direct access to ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { Invoke, Push, Send, type LearningBuddyBridge, type Result } from '../shared/ipc';

const invokeChannels = new Set<string>(Object.values(Invoke));
const sendChannels = new Set<string>(Object.values(Send));
const pushChannels = new Set<string>(Object.values(Push));

const bridge: LearningBuddyBridge = {
  invoke: (channel, ...args) => {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Canal inconnu : ${channel}`));
    }

    return ipcRenderer.invoke(channel, ...args) as Promise<Result<unknown>>;
  },
  send: (channel, ...args) => {
    if (sendChannels.has(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  on: (channel, listener) => {
    if (pushChannels.has(channel)) {
      ipcRenderer.on(channel, (_event, value: unknown) => listener(value));
    }
  },
};

contextBridge.exposeInMainWorld('learningBuddy', bridge);
