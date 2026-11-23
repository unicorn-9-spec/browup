// Preload (sandboxed, bundled into one CommonJS file by electron-vite).
// 1. The SmartSpectra preload bridge (window.__smartspectraBridge for
//    @smartspectra/node-sdk/renderer).
// 2. A small, explicit app bridge — no generic ipcRenderer access.

import '@smartspectra/node-sdk/preload';
import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api = {
  sdkInfo: () => invoke('sdk:info'),
  key: {
    status: () => invoke('key:status'),
    save: (key: string) => invoke('key:save', key),
    clear: () => invoke('key:clear'),
    forSdk: () => invoke('key:forSdk'),
  },
  readiness: () => invoke('readiness:check'),
  packs: {
    list: () => invoke('packs:list'),
    get: (dir: string) => invoke('packs:get', dir),
  },
  store: {
    read: (name: string) => invoke('store:read', name),
    write: (name: string, data: unknown) => invoke('store:write', name, data),
    deleteProgress: () => invoke('store:deleteProgress'),
    resetCalibration: () => invoke('store:resetCalibration'),
  },
  rec: {
    save: (text: string) => invoke('rec:save', text),
    list: () => invoke('rec:list'),
    read: (name: string) => invoke('rec:read', name),
    remove: (name: string) => invoke('rec:delete', name),
  },
  replayBundled: () => invoke('replay:bundled'),
  probe: { append: (name: string, lines: string[]) => invoke('probe:append', name, lines) },
  exportMarkdown: (text: string, suggested: string) => invoke('export:markdown', text, suggested),
  paths: () => invoke('app:paths'),
  flags: () => invoke('app:flags'),
  demo: {
    start: (ext: 'mp4' | 'webm') => invoke('demo:start', ext),
    chunk: (bytes: Uint8Array) => invoke('demo:chunk', bytes),
    stop: () => invoke('demo:stop'),
    show: (path: string) => invoke('demo:show', path),
  },
  onShutdown: (fn: () => void | Promise<void>) => {
    ipcRenderer.on('app:shutdown', async () => {
      try { await fn(); } finally { ipcRenderer.send('app:shutdown-done'); }
    });
  },
};

contextBridge.exposeInMainWorld('browup', api);
