// Demo recorder — developer flag `--demo-recorder` only (`npm run demo:record`).
//
// This is the ONLY place in BrowUp that records video. It exists so the
// developer can record the challenge demo from inside the app. It is never
// available in a learner's build: the button is not rendered and the main
// process refuses window capture unless the flag is set.
//
// What it records: the BrowUp window only (the main process hands over that
// one source; no other windows, no screen, no audio). Encoded with the
// browser's MediaRecorder (MP4/H.264 where supported, else WebM) and streamed
// to a local file in one-second chunks — nothing is uploaded, and memory
// stays flat however long the take.

export type RecorderState = 'idle' | 'starting' | 'recording' | 'saving';

const MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export class DemoRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  state: RecorderState = 'idle';
  startedAt = 0;
  path = '';

  constructor(private readonly onChange: (r: DemoRecorder) => void) {}

  private set(s: RecorderState): void {
    this.state = s;
    this.onChange(this);
  }

  async start(): Promise<void> {
    const bridge = window.browup;
    if (!bridge || this.state !== 'idle') return;
    this.set('starting');
    try {
      // The main process answers this with the BrowUp window as the only source.
      this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const mimeType = MIME_PREFERENCE.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      this.path = await bridge.demo.start(mimeType.startsWith('video/mp4') ? 'mp4' : 'webm');
      const rec = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8_000_000 });
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        // Keep chunks in order; each is written to disk as it arrives.
        this.queue = this.queue.then(async () => bridge.demo.chunk(new Uint8Array(await e.data.arrayBuffer())));
      };
      // If the capture ends on its own (window closed), save what we have.
      this.stream.getVideoTracks()[0]?.addEventListener('ended', () => { void this.stop(); });
      rec.start(1000);
      this.rec = rec;
      this.startedAt = Date.now();
      this.set('recording');
    } catch (err) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.set('idle');
      throw err;
    }
  }

  async stop(): Promise<{ path: string; bytes: number } | null> {
    const rec = this.rec;
    if (!rec || this.state !== 'recording') return null;
    this.set('saving');
    this.rec = null;
    await new Promise<void>((done) => {
      rec.addEventListener('stop', () => done(), { once: true });
      rec.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.queue;
    const saved = (await window.browup?.demo.stop()) ?? null;
    this.set('idle');
    return saved;
  }
}
