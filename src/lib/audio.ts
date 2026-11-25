// Microphone capture and browser speech recognition (fallback for providers
// without audio input). Dictation is only used when the browser can recognise
// speech on-device: server-based recognition would send audio to the browser
// vendor, a party the user never chose.

export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) return reject(new Error('Not recording'));
      rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }));
        this.recorder = null;
      };
      rec.stop();
    });
  }
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  processLocally?: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface SpeechOptions {
  langs: string[];
  processLocally: true;
}
type SpeechCtor = (new () => SpeechRecognitionLike) & {
  available?: (o: SpeechOptions) => Promise<SpeechAvailability>;
  install?: (o: SpeechOptions) => Promise<boolean>;
};

function speechCtor(): SpeechCtor | undefined {
  const g = globalThis as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

const lang = () => navigator.language || 'en-US';

/**
 * True if on-device speech recognition can be used, installing the language
 * pack if the browser offers it (call from a user gesture).
 */
export async function onDeviceDictationReady(): Promise<boolean> {
  const Ctor = speechCtor();
  if (!Ctor?.available) return false;
  const opts: SpeechOptions = { langs: [lang()], processLocally: true };
  try {
    const status = await Ctor.available(opts);
    if (status === 'available') return true;
    if (status === 'unavailable' || !Ctor.install) return false;
    return await Ctor.install(opts);
  } catch {
    return false;
  }
}

/** Start on-device dictation; resolves with the transcript when `stop()` is called or speech ends. */
export function dictate(): { stop: () => void; result: Promise<string> } {
  const Ctor = speechCtor();
  if (!Ctor) throw new Error('Speech recognition is not available in this browser');
  const rec = new Ctor();
  rec.lang = lang();
  rec.processLocally = true;
  rec.interimResults = false;
  let transcript = '';
  const result = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      transcript = Array.from(e.results, (r) => r[0].transcript).join(' ');
    };
    rec.onerror = (e) => reject(new Error(`Speech recognition failed: ${e.error}`));
    rec.onend = () => resolve(transcript.trim());
  });
  rec.start();
  return { stop: () => rec.stop(), result };
}
