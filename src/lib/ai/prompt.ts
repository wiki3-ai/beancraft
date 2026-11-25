import type { LedgerContext } from '../engine';
import type { ProposalSource } from '../proposal';

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** System prompt grounding the model in the user's own accounts. */
export function systemPrompt(ctx: LedgerContext, date = today()): string {
  const currency = ctx.operatingCurrencies[0] ?? ctx.currencies[0] ?? 'USD';
  return [
    'You turn receipts, invoices, and short descriptions of purchases or income into Beancount transactions.',
    'Respond with JSON only, matching: {"transactions":[{"date":"YYYY-MM-DD","payee":string|null,"narration":string,"postings":[{"account":string,"amount":string|null,"currency":string|null}]}]}.',
    'Rules:',
    '- Use ONLY accounts from the list below. Pick the closest match.',
    '- Copy amounts exactly as written in the input. Never add, subtract, multiply, convert, or compute any number.',
    '- Use the total shown on a receipt or invoice, not line items, unless asked otherwise.',
    '- Expenses are positive amounts. Leave the amount and currency of the paying account (Assets or Liabilities) as null so the ledger computes it.',
    '- Exactly one posting may have a null amount.',
    `- If no date is given, use ${date}. If no currency is given, use ${currency}.`,
    '',
    `Operating currency: ${currency}`,
    'Accounts:',
    ...ctx.accounts.map((a) => `- ${a}`),
  ].join('\n');
}

export function userPrompt(source: ProposalSource, text: string): string {
  switch (source) {
    case 'image':
      return `Propose a transaction for this receipt or invoice image.${text ? ` Notes: ${text}` : ''}`;
    case 'voice':
      return `Propose a transaction for what is said in this audio recording.${text ? ` Notes: ${text}` : ''}`;
    default:
      return text;
  }
}
