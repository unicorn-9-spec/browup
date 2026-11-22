// Privacy and SDK-usage guarantees that can be checked without a camera
// (AGENT_PROMPT §12: no video written anywhere; telemetry off; key absent
// from logs; no audio).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@smartspectra/node-sdk/renderer', () => ({ SmartSpectraSDK: class {}, MetricType: { FACE_LANDMARKS: 11, BLINKING: 12, EXPRESSIONS: 14 } }));
vi.mock('@smartspectra/node-sdk/messages', () => ({ decodeMetrics: () => ({}) }));

import { redact } from '../../electron/redact';
import { isVirtualCamera, requestedMetrics, sdkOptions } from '../../src/sensing/sdk';
import { Recorder } from '../../src/sensing/record';
import { decodeMetricsLike } from '../../src/sensing/decode';
import { teacherExport } from '../../src/lesson/progress';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|vue)$/.test(f) ? [p] : [];
  });
}
const code = (p: string) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
const all = [...sources('src'), ...sources('electron')].map((p) => ({ p, c: code(p) }));

describe('SDK usage', () => {
  test('telemetry is off; only face landmarks, blinking (and expressions unless dropped) are requested', () => {
    const o = sdkOptions('test-key', 'pending');
    expect(o.enableTelemetry).toBe(false);
    expect([...o.requestedMetrics!].sort()).toEqual([11, 12, 14]);
    expect(requestedMetrics('off')).toEqual([11, 12]);
    expect(requestedMetrics('on')).toEqual([11, 12, 14]);
  });

  test('every SmartSpectraSDK constructed in the app turns telemetry off', () => {
    let n = 0;
    for (const { p, c } of all) {
      for (const m of c.matchAll(/new\s+(?:sdkMod\.)?SmartSpectraSDK\(([\s\S]*?)\)\s*;/g)) {
        n++;
        const arg = m[1]!;
        expect(arg.includes('enableTelemetry: false') || arg.includes('sdkOptions('), `${p}: ${arg.slice(0, 80)}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test('requestInsight is never called', () => {
    for (const { p, c } of all) expect(/\.requestInsight\s*\(/.test(c), p).toBe(false);
  });

  test('no audio anywhere: the microphone is never requested and nothing plays sound', () => {
    for (const { p, c } of all) {
      expect(/audio\s*:\s*true/.test(c), p).toBe(false);
      expect(/new\s+(Audio|AudioContext)\b|speechSynthesis/.test(c), p).toBe(false);
      if (c.includes('getUserMedia(')) expect(c, p).toMatch(/audio:\s*false/);
    }
  });
});

describe('camera choice', () => {
  test('virtual cameras are skipped when no camera was chosen', () => {
    for (const v of ['TranScreen Camera', 'OBS Virtual Camera', 'ManyCam Virtual Webcam', 'Snap Camera']) expect(isVirtualCamera(v), v).toBe(true);
    for (const r of ['HP Wide Vision HD Camera (0408:5482)', 'Integrated Webcam', 'Logitech BRIO', 'FaceTime HD Camera']) expect(isVirtualCamera(r), r).toBe(false);
  });
});

describe('no video is written anywhere', () => {
  test('no MediaRecorder, canvas export or image capture in the app', () => {
    for (const { p, c } of all) {
      expect(/MediaRecorder|toDataURL|toBlob|ImageCapture|captureStream|getImageData/.test(c), p).toBe(false);
    }
  });

  test('main-process writes are limited to known JSON/JSONL/Markdown files', () => {
    const main = code('electron/main.ts');
    const writes = [...main.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1]!.trim());
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w, w).toMatch(/file\(|join\(recDir|join\(probeDir|r\.filePath|^p$|key\.bin/);
  });

  test('recordings hold the 19 kept points only — no full mesh, no pixels', () => {
    const rec = new Recorder({ kind: 'header', format: 'browup-replay', version: 1, createdAt: 'x', synthetic: true, description: '', frameSize: { w: 1280, h: 720 }, profile: null });
    rec.start();
    const pts = Array.from({ length: 478 }, (_, i) => ({ x: 100 + i, y: 200 + i }));
    const d = decodeMetricsLike({ face: { landmarks: [{ value: pts, timestamp: 5, stable: true }] } }, { frameW: 1280, frameH: 720, keepAll: true });
    expect(d.allLandmarks).toHaveLength(478);
    rec.push({ kind: 'face', recvUs: 6, sample: d.faces[0]! });
    rec.push({ kind: 'expr', recvUs: 6, sample: { t: 5, surprise: 50, anger: 2 } });
    const lines = rec.stop().trim().split('\n');
    expect(lines).toHaveLength(2); // header + face; expressions dropped unless asked for
    const face = JSON.parse(lines[1]!);
    expect(face.p).toHaveLength(38); // 19 points × (x, y)
    expect(lines[1]).not.toContain('allLandmarks');
  });
});

describe('the API key stays out of logs and renderer storage', () => {
  test('redact removes the key and apiKey-shaped values', () => {
    const key = 'sk_live_ABCDEF123456';
    expect(redact(`failed with ${key} at start`, key)).not.toContain(key);
    expect(redact('{"apiKey":"zzz-secret-zzz"}', null)).not.toContain('zzz-secret-zzz');
    expect(redact('api_key=hunter22', null)).toContain('[redacted]');
  });

  test('renderer code never touches browser storage', () => {
    for (const { p, c } of all.filter((x) => x.p.startsWith('src'))) {
      expect(/localStorage|sessionStorage|indexedDB/.test(c), p).toBe(false);
    }
  });

  test('main never logs the key directly', () => {
    const main = code('electron/main.ts');
    expect(/console\.(log|warn|error)\([^)]*key/i.test(main)).toBe(false);
  });
});

describe('teacher export', () => {
  test('numbers and verdicts only', () => {
    const md = teacherExport([
      { at: '2026-11-22T10:00:00.000Z', promptId: 'yn-01', marker: 'yn', verdict: 'HELD', coveragePct: 91, validPct: 97, mode: 'lesson' },
      { at: '2026-11-22T10:01:00.000Z', promptId: 'wh-01', marker: 'wh', verdict: 'MISSING', coveragePct: 4, validPct: 88, mode: 'review', pickedRight: false },
    ], { language: 'ASL', packVersion: '0.1.0', reviewed: false, now: new Date('2026-11-22T11:00:00Z') });
    expect(md).toContain('| yn-01 | Yes/no question | HELD | 91% | 97% |');
    expect(md).toContain('UNREVIEWED');
    expect(md).not.toMatch(/data:image|<img|surprise|anger/i);
  });
});
