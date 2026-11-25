// Microphone capture and browser speech recognition (fallback for providers
// without audio input). Recognition is whatever the user's browser provides.

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
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | undefined {
  const g = globalThis as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

export const speechRecognitionAvailable = () => speechCtor() !== undefined;

/** Start dictation; resolves with the transcript when `stop()` is called or speech ends. */
export function dictate(): { stop: () => void; result: Promise<string> } {
  const Ctor = speechCtor();
  if (!Ctor) throw new Error('Speech recognition is not available in this browser');
  const rec = new Ctor();
  rec.lang = navigator.language || 'en-US';
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
