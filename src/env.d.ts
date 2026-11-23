/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

import type { Pack } from '../content/validate';

export interface KeyStatus { present: boolean; source: 'safeStorage' | 'session' | 'env' | 'none'; encryptionAvailable: boolean }
export interface Readiness { verdict: 'ready' | 'limited' | 'blocked' | 'inconclusive' | string; reason: string }
export interface PackListing {
  dir: string;
  status: 'reviewed' | 'unreviewed' | 'invalid';
  errors: string[];
  loadable: boolean;
  language: string;
  languageName: string;
  reviewer: { name: string; role: string; date: string; credit?: string } | null;
  unreviewedPrompts: number;
}
export interface AppFlags { probe: boolean; e2e: boolean; devUnreviewed: boolean; demoRecorder: boolean }

export interface BrowUpBridge {
  sdkInfo(): Promise<{ available: boolean; error: string; platform: string }>;
  key: {
    status(): Promise<KeyStatus>;
    save(key: string): Promise<{ persisted: boolean }>;
    clear(): Promise<boolean>;
    forSdk(): Promise<string | null>;
  };
  readiness(): Promise<Readiness>;
  packs: {
    list(): Promise<PackListing[]>;
    get(dir: string): Promise<{ pack: Pack; status: string } | null>;
  };
  store: {
    read<T = unknown>(name: 'settings' | 'profile' | 'progress'): Promise<T | null>;
    write(name: 'settings' | 'profile' | 'progress', data: unknown): Promise<boolean>;
    deleteProgress(): Promise<boolean>;
    resetCalibration(): Promise<boolean>;
  };
  rec: {
    save(text: string): Promise<string>;
    list(): Promise<string[]>;
    read(name: string): Promise<string | null>;
    remove(name: string): Promise<boolean>;
  };
  replayBundled(): Promise<string | null>;
  probe: { append(name: string, lines: string[]): Promise<string> };
  exportMarkdown(text: string, suggested: string): Promise<string | null>;
  paths(): Promise<{ dataDir: string; files: string[] }>;
  flags(): Promise<AppFlags>;
  demo: {
    start(ext: 'mp4' | 'webm'): Promise<string>;
    chunk(bytes: Uint8Array): Promise<number | false>;
    stop(): Promise<{ path: string; bytes: number } | null>;
    show(path: string): Promise<boolean>;
  };
  onShutdown(fn: () => void | Promise<void>): void;
}

declare global {
  interface Window {
    browup?: BrowUpBridge;
    __browupTest?: Record<string, unknown>;
  }
}
