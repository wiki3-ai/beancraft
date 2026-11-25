// Provider settings live only in this browser's localStorage.
import { BuiltinProvider } from './builtin';
import { OpenAiCompatibleProvider, type OpenAiConfig } from './openai';
import type { AiProvider } from './types';

export interface Preset extends Omit<OpenAiConfig, 'apiKey'> {
  id: string;
  label: string;
  needsKey: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter (cloud, free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    needsKey: true,
  },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'gemma3', needsKey: false },
  { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', model: 'local-model', needsKey: false },
  { id: 'custom', label: 'Custom OpenAI-compatible', baseUrl: 'http://localhost:8080/v1', model: 'model', needsKey: false },
];

export interface AiSettings {
  provider: 'builtin' | 'openai';
  preset: string;
  openai: OpenAiConfig;
}

const KEY = 'beancraft.ai';

export function defaultSettings(builtinPresent = BuiltinProvider.isPresent()): AiSettings {
  const p = PRESETS[0];
  return {
    provider: builtinPresent ? 'builtin' : 'openai',
    preset: p.id,
    openai: { baseUrl: p.baseUrl, model: p.model, apiKey: '' },
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage): AiSettings {
  const fallback = defaultSettings();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider: s.provider === 'openai' || s.provider === 'builtin' ? s.provider : fallback.provider,
      preset: typeof s.preset === 'string' ? s.preset : fallback.preset,
      openai: { ...fallback.openai, ...s.openai },
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: AiSettings, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(KEY, JSON.stringify(s));
}

/** Returns the configured provider, or a reason it cannot be used yet. */
export function providerFor(s: AiSettings): AiProvider | string {
  if (s.provider === 'builtin') {
    return BuiltinProvider.isPresent()
      ? new BuiltinProvider()
      : 'This browser has no built-in AI. Choose another provider in Settings.';
  }
  try {
    new URL(s.openai.baseUrl);
  } catch {
    return 'Set a valid provider URL in Settings.';
  }
  const preset = PRESETS.find((p) => p.id === s.preset);
  if (preset?.needsKey && !s.openai.apiKey) return `Add your ${preset.label.split(' ')[0]} API key in Settings.`;
  if (!s.openai.model) return 'Set a model name in Settings.';
  return new OpenAiCompatibleProvider(s.openai);
}
