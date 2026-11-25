<script lang="ts">
  import type { BeancountError } from '../lib/engine';
  import { appendDiff, checkEntry } from '../lib/proposal';
  import type { InboxItem } from '../lib/inbox';

  interface Props {
    item: InboxItem;
    ledger: string;
    baseErrors: BeancountError[];
    onapprove: (item: InboxItem) => void;
    onreject: (item: InboxItem) => void;
  }

  let { item = $bindable(), ledger, baseErrors, onapprove, onreject }: Props = $props();
  let editing = $state(false);

  const pending = $derived(item.status === 'pending');
  const check = $derived(pending ? checkEntry(ledger, item.entry, baseErrors) : { ok: true, errors: [] });
  const diff = $derived(pending ? appendDiff(ledger, item.entry) : []);
  const sourceLabel = { chat: 'Chat', voice: 'Voice', image: 'Receipt' } as const;
</script>

<article class="card {item.status}" data-testid="proposal">
  <header>
    <span class="badge">{sourceLabel[item.source]}</span>
    <span class="summary">{item.summary}</span>
    {#if !pending}<span class="status">{item.status}</span>{/if}
  </header>

  {#if item.preview}
    <img src={item.preview} alt="Receipt" class="preview" />
  {/if}

  {#if pending}
    {#if editing}
      <textarea bind:value={item.entry} rows={Math.max(4, item.entry.split('\n').length + 1)} aria-label="Edit entry"
      ></textarea>
    {/if}
    <pre class="diff" aria-label="Proposed change">{#each diff as d (d.line)}<span class={d.kind}
          ><span class="ln">{d.line}</span>{d.kind === 'add' ? '+' : ' '} {d.text}
</span>{/each}</pre>

    {#if check.ok}
      <p class="ok" data-testid="valid">✓ rustledger: valid against your ledger</p>
    {:else}
      <ul class="error" data-testid="invalid">
        {#each check.errors as e, i (i)}<li>{e.message}{e.hint ? ` — ${e.hint}` : ''}</li>{/each}
      </ul>
    {/if}

    <footer>
      <button onclick={() => onapprove(item)} disabled={!check.ok}>Approve</button>
      <button class="muted" onclick={() => (editing = !editing)}>{editing ? 'Done editing' : 'Edit'}</button>
      <button class="muted" onclick={() => onreject(item)}>Reject</button>
    </footer>
  {:else}
    <pre class="entry">{item.entry}</pre>
  {/if}
</article>

<style>
  .card {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    background: var(--background);
  }

  .card.approved {
    border-left: 4px solid var(--diff-green);
  }

  .card.rejected {
    opacity: 0.6;
    border-left: 4px solid var(--diff-red);
  }

  header {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }

  .summary {
    flex: 1;
  }

  .badge,
  .status {
    font-size: 0.8em;
    padding: 0.1em 0.5em;
    border-radius: 3px;
    background: var(--background-darkest);
    text-transform: uppercase;
  }

  .preview {
    max-height: 160px;
    max-width: 100%;
    display: block;
    margin-bottom: 0.5rem;
  }

  textarea {
    width: 100%;
    margin-bottom: 0.5rem;
  }

  pre {
    margin: 0 0 0.5rem;
    padding: 0.5rem;
    overflow-x: auto;
    background: var(--background-darker);
    border-radius: 3px;
  }

  .diff .add {
    color: var(--diff-green);
    display: block;
  }

  .diff .context {
    color: var(--text-color-lightest);
    display: block;
  }

  .ln {
    display: inline-block;
    min-width: 3em;
    margin-right: 0.5em;
    text-align: right;
    color: var(--text-color-lightest);
  }

  .ok {
    color: var(--green);
    margin: 0 0 0.5rem;
  }

  ul.error {
    margin: 0 0 0.5rem;
    padding-left: 1.2rem;
  }

  footer {
    display: flex;
    gap: 0.5rem;
  }
</style>
