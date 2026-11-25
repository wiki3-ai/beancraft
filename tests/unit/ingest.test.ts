import { describe, expect, it, vi } from 'vitest';
import type { AiProvider, AiRequest } from '../../src/lib/ai/types';
import { propose } from '../../src/lib/ingest';

const ctx = {
  title: null,
  operatingCurrencies: ['USD'],
  accounts: ['Expenses:Art-Supplies', 'Assets:Bank:Checking'],
  currencies: ['USD'],
  directiveCount: 2,
};
const tx = {
  date: '2026-03-04',
  payee: 'Zen Supplies',
  narration: 'Ink',
  postings: [
    { account: 'Expenses:Art-Supplies', amount: '22.40', currency: 'USD' },
    { account: 'Assets:Bank:Checking', amount: null, currency: null },
  ],
};

function provider(responses: string[]): AiProvider {
  return {
    label: 'test',
    remote: false,
    capabilities: async () => ({ text: true, image: true, audio: true }),
    complete: vi.fn(async () => responses.shift()!),
  };
}

describe('ingest', () => {
  it('retries an incomplete model response with the original audio and validation feedback', async () => {
    const audio = new Blob(['voice']);
    const p = provider([
      JSON.stringify({ transactions: [{ ...tx, postings: tx.postings.slice(0, 1) }] }),
      JSON.stringify({ question: 'Which account paid for the ink?', transactions: [] }),
    ]);
    const result = await propose(p, ctx, { source: 'voice', text: '', audio });
    expect(result).toEqual({ kind: 'question', question: 'Which account paid for the ink?' });
    const calls = vi.mocked(p.complete).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].audio).toBe(audio);
    expect(calls[1][0].text).toContain('needs at least two postings');
  });

  it('includes the original input, image and previous question and answer in a follow-up', async () => {
    const image = new Blob(['receipt']);
    const p = provider([JSON.stringify({ question: null, transactions: [tx] })]);
    const result = await propose(p, ctx, {
      source: 'image', text: 'Ink at Zen', image,
      answers: [{ question: 'How did you pay?', answer: 'Checking' }],
    });
    expect(result.kind).toBe('proposals');
    const request: AiRequest = vi.mocked(p.complete).mock.calls[0][0];
    expect(request.image).toBe(image);
    expect(request.text).toContain('Ink at Zen');
    expect(request.text).toContain('Question: How did you pay?\nUser\'s answer: Checking');
  });

  it('asks for help after two invalid responses but propagates provider errors', async () => {
    const p = provider(['not json', 'still not json']);
    expect((await propose(p, ctx, { source: 'chat', text: 'ink' })).kind).toBe('question');
    expect(vi.mocked(p.complete)).toHaveBeenCalledTimes(2);
    const failing = provider([]);
    vi.mocked(failing.complete).mockRejectedValue(new Error('offline'));
    await expect(propose(failing, ctx, { source: 'chat', text: 'ink' })).rejects.toThrow('offline');
  });
});
