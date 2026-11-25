// Any OpenAI-compatible chat-completions endpoint: OpenRouter, Ollama,
// LM Studio, llama.cpp server, OpenAI, etc. Requests go only to the
// endpoint the user configured.
import type { AiCapabilities, AiProvider, AiRequest } from './types';

export interface OpenAiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly config: OpenAiConfig) {}

  get label(): string {
    return `${this.config.model} @ ${new URL(this.config.baseUrl).host}`;
  }

  get remote(): boolean {
    return !isLocalUrl(this.config.baseUrl);
  }

  async capabilities(): Promise<AiCapabilities> {
    // Audio is transcribed in the browser first; images depend on the model.
    return { text: true, image: true, audio: false };
  }

  async complete(req: AiRequest): Promise<string> {
    const content: unknown[] = [{ type: 'text', text: req.text }];
    if (req.image) content.push({ type: 'image_url', image_url: { url: await blobToDataUrl(req.image) } });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers.Authorization = ['Bearer', this.config.apiKey].join(' ');
    const res = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: req.signal,
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'beancraft_proposal', schema: req.schema },
        },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Provider returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Provider returned an empty response');
    return text;
  }
}
