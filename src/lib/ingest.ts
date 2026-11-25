import type { LedgerContext } from './engine';
import { systemPrompt, userPrompt } from './ai/prompt';
import type { AiProvider } from './ai/types';
import { extractJson, parseProposals, PROPOSAL_SCHEMA, type ProposalSource, type ProposedTransaction } from './proposal';

export interface IngestInput {
  source: ProposalSource;
  text: string;
  image?: Blob;
  audio?: Blob;
}

/** Ask the provider for proposals. Returns normalised, not-yet-validated transactions. */
export async function propose(
  provider: AiProvider,
  ctx: LedgerContext,
  input: IngestInput,
  options: { signal?: AbortSignal; onDownloadProgress?: (f: number) => void; date?: string } = {},
): Promise<ProposedTransaction[]> {
  const raw = await provider.complete({
    system: systemPrompt(ctx, options.date),
    text: userPrompt(input.source, input.text),
    image: input.image,
    audio: input.audio,
    schema: PROPOSAL_SCHEMA,
    signal: options.signal,
    onDownloadProgress: options.onDownloadProgress,
  });
  return parseProposals(extractJson(raw));
}
