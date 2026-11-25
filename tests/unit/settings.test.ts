import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../../src/lib/ai/prompt';
import { isLocalUrl } from '../../src/lib/ai/openai';
import { defaultSettings, loadSettings, providerFor } from '../../src/lib/ai/settings';

const ctx = {
  title: null,
  operatingCurrencies: ['EUR'],
  accounts: ['Assets:Bank', 'Expenses:Food'],
  currencies: ['EUR'],
  directiveCount: 2,
};

describe('prompt', () => {
  it('grounds the model in ledger accounts and forbids arithmetic', () => {
    const p = systemPrompt(ctx, '2026-03-04');
    expect(p).toContain('- Expenses:Food');
    expect(p).toContain('use 2026-03-04');
    expect(p).toContain('Operating currency: EUR');
    expect(p).toMatch(/Never add, subtract/);
  });
});

describe('settings', () => {
  it('defaults to built-in AI when present, otherwise OpenRouter free (needs a key)', () => {
    expect(defaultSettings(true).provider).toBe('builtin');
    const s = defaultSettings(false);
    expect(s.provider).toBe('openai');
    expect(s.openai.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(s.openai.model).toBe('openrouter/free');
    expect(providerFor(s)).toMatch(/API key/);
  });

  it('uses a configured OpenAI-compatible provider and flags remote endpoints', () => {
    const s = defaultSettings(false);
    s.openai.apiKey = 'test-key';
    const p = providerFor(s);
    expect(typeof p).toBe('object');
    expect((p as { remote: boolean }).remote).toBe(true);
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLocalUrl('https://openrouter.ai/api/v1')).toBe(false);
  });

  it('survives corrupt storage', () => {
    const s = loadSettings({ getItem: () => '{not json' });
    expect(['builtin', 'openai']).toContain(s.provider);
  });
});
