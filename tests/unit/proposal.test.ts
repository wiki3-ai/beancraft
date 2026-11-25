import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { initEngine, ledgerContext, validate } from '../../src/lib/engine';
import {
  appendDiff,
  appendEntry,
  checkEntry,
  extractJson,
  normaliseAmount,
  parseProposals,
  renderTransaction,
} from '../../src/lib/proposal';
import { SAMPLE_LEDGER } from '../../src/lib/sample';

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await initEngine(readFileSync(require.resolve('@rustledger/wasm/rustledger_wasm_bg.wasm')));
});

const coffee = {
  transactions: [
    {
      date: '2026-02-01',
      payee: 'Blue Bottle',
      narration: 'Client meeting coffee',
      postings: [
        { account: 'Expenses:Meals', amount: '12.50', currency: 'USD' },
        { account: 'Liabilities:CreditCard', amount: null, currency: null },
      ],
    },
  ],
};

describe('engine', () => {
  it('validates the sample ledger and extracts context', () => {
    expect(validate(SAMPLE_LEDGER).valid).toBe(true);
    const ctx = ledgerContext(SAMPLE_LEDGER);
    expect(ctx.title).toBe('Studio Ledger (sample)');
    expect(ctx.operatingCurrencies).toEqual(['USD']);
    expect(ctx.accounts).toContain('Expenses:Art-Supplies');
  });

  it('omits closed accounts from context', () => {
    const ctx = ledgerContext(`${SAMPLE_LEDGER}\n2026-01-10 close Expenses:Travel\n`);
    expect(ctx.accounts).not.toContain('Expenses:Travel');
  });
});

describe('proposals', () => {
  it('renders deterministic Beancount with an interpolated balancing posting', () => {
    const [tx] = parseProposals(coffee);
    expect(renderTransaction(tx)).toBe(
      '2026-02-01 * "Blue Bottle" "Client meeting coffee"\n' +
        '  Expenses:Meals          12.50 USD\n' +
        '  Liabilities:CreditCard\n',
    );
  });

  it('accepts a valid proposal against the ledger', () => {
    const entry = renderTransaction(parseProposals(coffee)[0]);
    expect(checkEntry(SAMPLE_LEDGER, entry)).toEqual({ ok: true, errors: [] });
  });

  it('rejects unopened accounts and unbalanced entries via rustledger', () => {
    const bad = renderTransaction({
      date: '2026-02-01',
      payee: null,
      narration: 'x',
      postings: [
        { account: 'Expenses:Unknown', amount: '5', currency: 'USD' },
        { account: 'Assets:Bank:Checking', amount: null, currency: null },
      ],
    });
    const unopened = checkEntry(SAMPLE_LEDGER, bad);
    expect(unopened.ok).toBe(false);
    expect(unopened.errors[0].message).toMatch(/never opened/);

    const unbalanced = '2026-02-01 * "x"\n  Expenses:Meals  5 USD\n  Assets:Bank:Checking  -4 USD\n';
    expect(checkEntry(SAMPLE_LEDGER, unbalanced).errors[0].message).toMatch(/does not balance/);
  });

  it('ignores errors that already existed in the ledger', () => {
    const broken = `${SAMPLE_LEDGER}\n2026-01-20 * "old"\n  Expenses:Nope  1 USD\n  Assets:Bank:Checking\n`;
    expect(validate(broken).valid).toBe(false);
    const entry = renderTransaction(parseProposals(coffee)[0]);
    expect(checkEntry(broken, entry).ok).toBe(true);
  });

  it('never does arithmetic: amounts are copied, not computed', () => {
    expect(normaliseAmount('1,234.50')).toBe('1234.50');
    expect(normaliseAmount('$7')).toBe('7');
    expect(normaliseAmount(null)).toBeNull();
    expect(() => normaliseAmount('12 + 3')).toThrow(/Invalid amount/);
  });

  it('rejects malformed model output', () => {
    expect(() => parseProposals({})).toThrow(/No transactions/);
    expect(() => parseProposals({ transactions: [{ ...coffee.transactions[0], date: '2026-02-30' }] })).toThrow(
      /invalid date/,
    );
    const twoNull = structuredClone(coffee);
    twoNull.transactions[0].postings[0].amount = null as unknown as string;
    expect(() => parseProposals(twoNull)).toThrow(/only one posting/);
    const lowercase = structuredClone(coffee);
    lowercase.transactions[0].postings[0].account = 'meals';
    expect(() => parseProposals(lowercase)).toThrow(/invalid account/);
  });

  it('escapes quotes and newlines in strings', () => {
    const [tx] = parseProposals(coffee);
    tx.narration = 'He said "hi"\nbye';
    expect(renderTransaction(tx).split('\n')[0]).toBe('2026-02-01 * "Blue Bottle" "He said \\"hi\\" bye"');
  });

  it('extracts JSON from fenced or chatty output', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('{"a":2}')).toEqual({ a: 2 });
    expect(() => extractJson('no json')).toThrow();
  });

  it('builds an append-only diff with context', () => {
    expect(appendDiff('a\nb\nc\nd\n', 'X\n', 2)).toEqual([
      { kind: 'context', line: 3, text: 'c' },
      { kind: 'context', line: 4, text: 'd' },
      { kind: 'add', line: 5, text: '' },
      { kind: 'add', line: 6, text: 'X' },
    ]);
    expect(appendEntry('a', 'X')).toBe('a\n\nX\n');
    expect(appendEntry('', 'X')).toBe('X\n');
  });
});
