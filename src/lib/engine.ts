// Thin wrapper around the rustledger WebAssembly engine.
// All parsing and validation happens locally in the browser.
import initWasm, {
  parse,
  validateSource,
  type BeancountError,
  type DirectiveJson,
  type InitInput,
  type LedgerJson,
} from '@rustledger/wasm';

export type { BeancountError };

let ready: Promise<void> | null = null;

/** Initialise the engine once. `input` is the wasm URL (browser) or bytes (tests). */
export function initEngine(input: InitInput): Promise<void> {
  ready ??= initWasm({ module_or_path: input }).then(() => undefined);
  return ready;
}

export interface LedgerContext {
  title: string | null;
  operatingCurrencies: string[];
  /** Accounts that are open (and not closed). */
  accounts: string[];
  currencies: string[];
  directiveCount: number;
}

export function validate(source: string): { valid: boolean; errors: BeancountError[] } {
  return validateSource(source) as { valid: boolean; errors: BeancountError[] };
}

/** Facts about the ledger used to ground LLM proposals. */
export function ledgerContext(source: string): LedgerContext {
  const result = parse(source) as { ledger: LedgerJson | null; errors: BeancountError[] };
  const directives: DirectiveJson[] = result.ledger?.directives ?? [];
  const open = new Set<string>();
  const currencies = new Set<string>(result.ledger?.options.operating_currencies ?? []);
  for (const d of directives) {
    if (d.type === 'open') {
      open.add(d.account);
      d.currencies.forEach((c) => currencies.add(c));
    } else if (d.type === 'close') {
      open.delete(d.account);
    } else if (d.type === 'commodity') {
      currencies.add(d.currency);
    }
  }
  return {
    title: result.ledger?.options.title ?? null,
    operatingCurrencies: result.ledger?.options.operating_currencies ?? [],
    accounts: [...open].sort(),
    currencies: [...currencies].sort(),
    directiveCount: directives.length,
  };
}

const errorKey = (e: BeancountError) => `${e.code}|${e.line}|${e.message}`;

/**
 * Errors present in `after` but not in `before`. Proposals are only ever
 * appended, so line numbers of pre-existing errors are unchanged and a
 * multiset difference isolates the errors introduced by the proposal.
 */
export function newErrors(before: BeancountError[], after: BeancountError[]): BeancountError[] {
  const counts = new Map<string, number>();
  for (const e of before) counts.set(errorKey(e), (counts.get(errorKey(e)) ?? 0) + 1);
  return after.filter((e) => {
    const n = counts.get(errorKey(e)) ?? 0;
    if (n > 0) {
      counts.set(errorKey(e), n - 1);
      return false;
    }
    return true;
  });
}
