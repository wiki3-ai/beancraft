// Browser built-in AI (Prompt API: Gemini Nano in Chrome, Phi/Aion in Edge).
// Inference runs on-device; the browser may download the model on first use.
import type { AiCapabilities, AiProvider, AiRequest } from './types';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type Modality = { type: 'text' | 'image' | 'audio'; languages?: string[] };

interface LanguageModelSession {
  prompt(input: unknown, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(options?: { expectedInputs?: Modality[]; expectedOutputs?: Modality[] }): Promise<Availability>;
  create(options?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    expectedInputs?: Modality[];
    expectedOutputs?: Modality[];
    signal?: AbortSignal;
    monitor?: (m: EventTarget) => void;
  }): Promise<LanguageModelSession>;
}

const TEXT: Modality = { type: 'text', languages: ['en'] };

function api(): LanguageModelStatic | undefined {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

async function supported(inputs: Modality[]): Promise<boolean> {
  const lm = api();
  if (!lm) return false;
  try {
    return (await lm.availability({ expectedInputs: inputs, expectedOutputs: [TEXT] })) !== 'unavailable';
  } catch {
    return false;
  }
}

export class BuiltinProvider implements AiProvider {
  readonly label = 'Built-in browser AI';
  readonly remote = false;

  static isPresent(): boolean {
    return api() !== undefined;
  }

  async capabilities(): Promise<AiCapabilities> {
    const [text, image, audio] = await Promise.all([
      supported([TEXT]),
      supported([TEXT, { type: 'image' }]),
      supported([TEXT, { type: 'audio' }]),
    ]);
    return { text, image: text && image, audio: text && audio };
  }

  async complete(req: AiRequest): Promise<string> {
    const lm = api();
    if (!lm) throw new Error('Built-in AI is not available in this browser');
    const expectedInputs: Modality[] = [TEXT];
    const content: { type: string; value: unknown }[] = [{ type: 'text', value: req.text }];
    if (req.image) {
      expectedInputs.push({ type: 'image' });
      content.push({ type: 'image', value: req.image });
    }
    if (req.audio) {
      expectedInputs.push({ type: 'audio' });
      content.push({ type: 'audio', value: req.audio });
    }
    const session = await lm.create({
      initialPrompts: [{ role: 'system', content: req.system }],
      expectedInputs,
      expectedOutputs: [TEXT],
      signal: req.signal,
      monitor: (m) =>
        m.addEventListener('downloadprogress', (e) => req.onDownloadProgress?.((e as ProgressEvent).loaded)),
    });
    try {
      return await session.prompt([{ role: 'user', content }], {
        responseConstraint: req.schema,
        signal: req.signal,
      });
    } finally {
      session.destroy();
    }
  }
}
