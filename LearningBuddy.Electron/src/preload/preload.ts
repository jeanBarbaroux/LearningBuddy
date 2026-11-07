// Sandboxed preload: exposes a narrow, typed API; renderers never get direct access to ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { Channels, type LearningBuddyApi } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (value: T) => void): void {
  ipcRenderer.on(channel, (_event, value: T) => listener(value));
}

const api: LearningBuddyApi = {
  getState: () => ipcRenderer.invoke(Channels.getState),
  onStateChanged: (listener) => subscribe(Channels.stateChanged, listener),
  listLibrary: () => ipcRenderer.invoke(Channels.listLibrary),
  downloadLibraryPackage: (id) => ipcRenderer.invoke(Channels.downloadLibraryPackage, id),
  importPackageFile: () => ipcRenderer.invoke(Channels.importPackageFile),
  deletePackage: (id) => ipcRenderer.invoke(Channels.deletePackage, id),
  setPackageSelected: (id, selected) => ipcRenderer.invoke(Channels.setPackageSelected, id, selected),
  setAssistantActive: (active) => ipcRenderer.invoke(Channels.setAssistantActive, active),
  reviewNow: () => ipcRenderer.invoke(Channels.reviewNow),
  updateSettings: (patch) => ipcRenderer.invoke(Channels.updateSettings, patch),
  setCompanionVisible: (visible) => ipcRenderer.invoke(Channels.setCompanionVisible, visible),

  onCompanionState: (listener) => subscribe(Channels.companionState, listener),
  onCompanionReaction: (listener) => subscribe(Channels.companionReaction, listener),
  companionClick: () => ipcRenderer.send(Channels.companionClick),
  companionContextMenu: () => ipcRenderer.send(Channels.companionContextMenu),
  companionDragStart: () => ipcRenderer.send(Channels.companionDragStart),
  companionDragMove: () => ipcRenderer.send(Channels.companionDragMove),
  companionDragEnd: () => ipcRenderer.send(Channels.companionDragEnd),
  companionHidden: () => ipcRenderer.send(Channels.companionHidden),
  companionSetInteractive: (interactive) => ipcRenderer.send(Channels.companionSetInteractive, interactive),

  onBubbleView: (listener) => subscribe(Channels.bubbleView, listener),
  bubbleAnswer: (outcome) => ipcRenderer.send(Channels.bubbleAnswer, outcome),
  bubbleClose: () => ipcRenderer.send(Channels.bubbleClose),
  bubbleResize: (height) => ipcRenderer.send(Channels.bubbleResize, height),
};

contextBridge.exposeInMainWorld('learningBuddy', api);
