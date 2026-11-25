import type { LedgerContext } from './engine';
import { systemPrompt, userPrompt } from './ai/prompt';
import type { AiProvider } from './ai/types';
import { extractJson, parseProposals, PROPOSAL_SCHEMA, type ProposalSource, type ProposedTransaction } from './proposal';

export interface IngestInput {
  source: ProposalSource;
  text: string;
  image?: Blob;
  audio?: Blob;
  answers?: { question: string; answer: string }[];
}

export type IngestResult =
  | { kind: 'proposals'; transactions: ProposedTransaction[] }
  | { kind: 'question'; question: string };

/** Ask for proposals or a clarification, retrying malformed model output once. */
export async function propose(
  provider: AiProvider,
  ctx: LedgerContext,
  input: IngestInput,
  options: { signal?: AbortSignal; onDownloadProgress?: (f: number) => void; date?: string } = {},
): Promise<IngestResult> {
  const text = [
    userPrompt(input.source, input.text),
    ...(input.answers ?? []).map(({ question, answer }) => `Question: ${question}\nUser's answer: ${answer}`),
  ].join('\n');
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete({
      system: systemPrompt(ctx, options.date),
      text: text + correction,
      image: input.image,
      audio: input.audio,
      schema: PROPOSAL_SCHEMA,
      signal: options.signal,
      onDownloadProgress: options.onDownloadProgress,
    });
    try {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === 'object' && 'question' in parsed) {
        const question = parsed.question;
        if (typeof question === 'string' && question.trim()) return { kind: 'question', question: question.trim() };
      }
      return { kind: 'proposals', transactions: parseProposals(parsed) };
    } catch (e) {
      correction = `\nYour previous response was invalid: ${e instanceof Error ? e.message : String(e)}. Correct it, or ask the user for missing information.`;
    }
  }
  return {
    kind: 'question',
    question: 'I could not make a complete entry yet. Could you add any missing details, such as the amount or the account used to pay or receive the money?',
  };
}
