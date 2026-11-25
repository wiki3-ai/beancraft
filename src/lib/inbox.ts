import { appendEntry, checkEntry, renderTransaction, type ProposalSource, type ProposedTransaction } from './proposal';

export interface InboxItem {
  id: number;
  source: ProposalSource;
  summary: string;
  /** Beancount text that will be appended on approval (editable by the user). */
  entry: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Object URL of the source image, for receipts. */
  preview?: string;
}

let nextId = 1;

export function toInboxItem(tx: ProposedTransaction, source: ProposalSource, preview?: string): InboxItem {
  const amount = tx.postings.find((p) => p.amount !== null && !p.amount.startsWith('-'));
  return {
    id: nextId++,
    source,
    summary: [tx.date, tx.payee ?? tx.narration, amount ? `${amount.amount} ${amount.currency}` : '']
      .filter(Boolean)
      .join(' · '),
    entry: renderTransaction(tx),
    status: 'pending',
    preview,
  };
}

/**
 * The only path by which BeanCraft modifies a ledger. Re-validates against the
 * current ledger text (which may have changed since the proposal was made)
 * and returns the new ledger, or throws if rustledger reports new errors.
 */
export function approve(ledger: string, item: InboxItem): string {
  const check = checkEntry(ledger, item.entry);
  if (!check.ok) throw new Error(check.errors.map((e) => e.message).join('; '));
  return appendEntry(ledger, item.entry);
}
