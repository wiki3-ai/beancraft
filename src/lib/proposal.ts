// Proposals: the LLM only ever returns structured JSON matching PROPOSAL_SCHEMA.
// BeanCraft turns that JSON into Beancount text deterministically, validates it
// with rustledger and shows it as a diff. The model never does arithmetic: it
// copies amounts exactly as they appear, and at most one posting may omit its
// amount so that rustledger interpolates the balancing value.
import { newErrors, validate, type BeancountError } from './engine';

export type ProposalSource = 'chat' | 'voice' | 'image';

export interface ProposedPosting {
  account: string;
  amount: string | null;
  currency: string | null;
}

export interface ProposedTransaction {
  date: string;
  payee: string | null;
  narration: string;
  postings: ProposedPosting[];
}

/** JSON Schema used to constrain model output (Prompt API & OpenAI-compatible APIs). */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          payee: { type: ['string', 'null'] },
          narration: { type: 'string' },
          postings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                account: { type: 'string' },
                amount: {
                  type: ['string', 'null'],
                  description: 'Decimal copied verbatim from the input, or null for the balancing posting',
                },
                currency: { type: ['string', 'null'] },
              },
              required: ['account', 'amount', 'currency'],
              additionalProperties: false,
            },
          },
        },
        required: ['date', 'payee', 'narration', 'postings'],
        additionalProperties: false,
      },
    },
  },
  required: ['transactions'],
  additionalProperties: false,
} as const;

const ACCOUNT_RE = /^(Assets|Liabilities|Equity|Income|Expenses)(:[\p{Lu}\p{N}][\p{L}\p{N}-]*)+$/u;
const CURRENCY_RE = /^[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]$|^[A-Z]$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Normalise a decimal string without doing arithmetic (strip grouping and symbols). */
export function normaliseAmount(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let s = String(raw).trim().replace(/[\s,]/g, '').replace(/^[$€£¥]/, '').replace(/^(-)[$€£¥]/, '$1');
  if (s.startsWith('+')) s = s.slice(1);
  if (!DECIMAL_RE.test(s)) throw new Error(`Invalid amount "${String(raw)}"`);
  return s;
}

/** Extract the first JSON object from model output (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model response did not contain JSON');
  return JSON.parse(body.slice(start, end + 1));
}

/** Validate and normalise model output. Throws with a human-readable message. */
export function parseProposals(raw: unknown): ProposedTransaction[] {
  const txs = (raw as { transactions?: unknown })?.transactions;
  if (!Array.isArray(txs) || txs.length === 0) throw new Error('No transactions proposed');
  return txs.map((t, i) => {
    const tx = t as Record<string, unknown>;
    const where = `Transaction ${i + 1}`;
    const date = String(tx.date ?? '');
    if (!isValidDate(date)) throw new Error(`${where}: invalid date "${date}"`);
    const postingsRaw = tx.postings;
    if (!Array.isArray(postingsRaw) || postingsRaw.length < 2) {
      throw new Error(`${where}: needs at least two postings`);
    }
    const postings = postingsRaw.map((p) => {
      const pr = p as Record<string, unknown>;
      const account = String(pr.account ?? '').trim();
      if (!ACCOUNT_RE.test(account)) throw new Error(`${where}: invalid account "${account}"`);
      const amount = normaliseAmount(pr.amount);
      const currency = amount === null ? null : String(pr.currency ?? '').trim().toUpperCase();
      if (currency !== null && !CURRENCY_RE.test(currency)) {
        throw new Error(`${where}: invalid currency "${String(pr.currency)}"`);
      }
      return { account, amount, currency };
    });
    if (postings.filter((p) => p.amount === null).length > 1) {
      throw new Error(`${where}: only one posting may omit its amount`);
    }
    const payee = tx.payee == null || tx.payee === '' ? null : String(tx.payee);
    return { date, payee, narration: String(tx.narration ?? ''), postings };
  });
}

const quote = (s: string) => `"${s.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Deterministically render a transaction as Beancount text. */
export function renderTransaction(tx: ProposedTransaction): string {
  const header = [tx.date, '*'];
  if (tx.payee !== null) header.push(quote(tx.payee));
  header.push(quote(tx.narration));
  const width = Math.max(...tx.postings.map((p) => p.account.length));
  const lines = tx.postings.map((p) =>
    p.amount === null ? `  ${p.account}` : `  ${p.account.padEnd(width)}  ${p.amount} ${p.currency}`,
  );
  return `${header.join(' ')}\n${lines.join('\n')}\n`;
}

/** Append an entry to the ledger, separated by a blank line. */
export function appendEntry(ledger: string, entry: string): string {
  const base = ledger === '' || ledger.endsWith('\n') ? ledger : `${ledger}\n`;
  const body = entry.endsWith('\n') ? entry : `${entry}\n`;
  return base === '' ? body : `${base}\n${body}`;
}

export interface DiffLine {
  kind: 'context' | 'add';
  line: number;
  text: string;
}

/** Unified-style diff for an append: a few context lines, then the added lines. */
export function appendDiff(ledger: string, entry: string, context = 3): DiffLine[] {
  const before = ledger === '' ? [] : ledger.replace(/\n$/, '').split('\n');
  const after = appendEntry(ledger, entry).replace(/\n$/, '').split('\n');
  const out: DiffLine[] = [];
  for (let i = Math.max(0, before.length - context); i < before.length; i++) {
    out.push({ kind: 'context', line: i + 1, text: before[i] });
  }
  for (let i = before.length; i < after.length; i++) {
    out.push({ kind: 'add', line: i + 1, text: after[i] });
  }
  return out;
}

export interface ProposalCheck {
  ok: boolean;
  errors: BeancountError[];
}

/** Validate an entry against the ledger with rustledger; only errors it introduces count. */
export function checkEntry(ledger: string, entry: string, baseErrors?: BeancountError[]): ProposalCheck {
  if (entry.trim() === '') {
    return { ok: false, errors: [{ message: 'Entry is empty' } as BeancountError] };
  }
  const before = baseErrors ?? validate(ledger).errors;
  const errors = newErrors(before, validate(appendEntry(ledger, entry)).errors);
  return { ok: errors.length === 0, errors };
}
