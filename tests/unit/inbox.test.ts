import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { initEngine } from '../../src/lib/engine';
import { approve, toInboxItem } from '../../src/lib/inbox';
import { SAMPLE_LEDGER } from '../../src/lib/sample';

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await initEngine(readFileSync(require.resolve('@rustledger/wasm/rustledger_wasm_bg.wasm')));
});

const tx = (account: string) => ({
  date: '2026-03-04',
  payee: 'Blick',
  narration: 'Brushes',
  postings: [
    { account, amount: '42.10', currency: 'USD' },
    { account: 'Liabilities:CreditCard', amount: null, currency: null },
  ],
});

describe('inbox', () => {
  it('summarises a proposal and renders its entry', () => {
    const item = toInboxItem(tx('Expenses:Art-Supplies'), 'chat');
    expect(item.status).toBe('pending');
    expect(item.summary).toBe('2026-03-04 · Blick · 42.10 USD');
    expect(item.entry).toContain('2026-03-04 * "Blick" "Brushes"');
  });

  it('approve appends a valid entry and nothing else', () => {
    const item = toInboxItem(tx('Expenses:Art-Supplies'), 'voice');
    const next = approve(SAMPLE_LEDGER, item);
    expect(next.startsWith(SAMPLE_LEDGER.replace(/\n*$/, ''))).toBe(true);
    expect(next).toContain(item.entry);
  });

  it('approve refuses an entry rustledger rejects', () => {
    const item = toInboxItem(tx('Expenses:Unknown'), 'image');
    expect(() => approve(SAMPLE_LEDGER, item)).toThrow();
  });

  it('approve refuses an entry edited into an unbalanced state', () => {
    const item = toInboxItem(tx('Expenses:Art-Supplies'), 'chat');
    item.entry = item.entry.replace(/Liabilities:CreditCard.*/, 'Liabilities:CreditCard  -40.00 USD');
    expect(() => approve(SAMPLE_LEDGER, item)).toThrow();
  });
});
