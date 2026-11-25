<script lang="ts">
  import { onMount } from 'svelte';
  import wasmUrl from '@rustledger/wasm/rustledger_wasm_bg.wasm?url';
  import ProposalCard from './components/ProposalCard.svelte';
  import Settings from './components/Settings.svelte';
  import { loadSettings, providerFor, saveSettings, type AiSettings } from './lib/ai/settings';
  import type { AiCapabilities } from './lib/ai/types';
  import { dictate, onDeviceDictationReady, Recorder } from './lib/audio';
  import { initEngine, ledgerContext, validate } from './lib/engine';
  import {
    download,
    fromDataTransferItem,
    isImageFile,
    isLedgerFile,
    pickLedger,
    saveToHandle,
    type OpenedLedger,
  } from './lib/files';
  import { approve, toInboxItem, type InboxItem } from './lib/inbox';
  import { propose, type IngestInput } from './lib/ingest';
  import { SAMPLE_LEDGER } from './lib/sample';

  interface Ledger extends OpenedLedger {
    dirty: boolean;
  }

  let engineReady = $state(false);
  let engineError = $state('');
  let ledger = $state<Ledger | null>(null);
  let items = $state<InboxItem[]>([]);
  let settings = $state<AiSettings>(loadSettings());
  let showSettings = $state(false);
  let caps = $state<AiCapabilities | null>(null);
  let chat = $state('');
  let busy = $state('');
  let message = $state<{ kind: 'error' | 'info'; text: string } | null>(null);
  let recording = $state<{ stop: () => Promise<void> } | null>(null);
  let dragging = $state(false);
  let ledgerInput = $state<HTMLInputElement | undefined>();
  let imageInput = $state<HTMLInputElement | undefined>();

  const provider = $derived(providerFor(settings));
  const validation = $derived(engineReady && ledger ? validate(ledger.text) : null);
  const ctx = $derived(engineReady && ledger ? ledgerContext(ledger.text) : null);
  const pendingCount = $derived(items.filter((i) => i.status === 'pending').length);

  onMount(() => {
    initEngine(wasmUrl).then(
      () => (engineReady = true),
      (e) => (engineError = `Could not load the rustledger engine: ${String(e)}`),
    );
  });

  $effect(() => {
    const p = provider;
    caps = null;
    if (typeof p !== 'string') p.capabilities().then((c) => provider === p && (caps = c));
  });

  $effect(() => {
    if (!ledger?.dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  });

  const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  function openLedger(opened: OpenedLedger) {
    if ((ledger?.dirty || pendingCount > 0) && !confirm('Discard unsaved changes and pending proposals?')) return;
    ledger = { ...opened, dirty: false };
    items = [];
    message = null;
  }

  async function chooseLedger() {
    try {
      const opened = await pickLedger();
      if (opened) openLedger(opened);
      else if (!('showOpenFilePicker' in globalThis)) ledgerInput?.click();
    } catch (e) {
      message = { kind: 'error', text: errorText(e) };
    }
  }

  async function onLedgerInput(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) openLedger({ name: file.name, text: await file.text(), handle: null });
    (e.currentTarget as HTMLInputElement).value = '';
  }

  async function ingest(input: IngestInput, preview?: string) {
    if (!ledger || !ctx) return;
    const p = provider;
    if (typeof p === 'string') {
      message = { kind: 'error', text: p };
      showSettings = true;
      return;
    }
    message = null;
    busy = p.remote ? `Asking ${p.label}…` : 'Thinking on-device…';
    try {
      const txs = await propose(p, ctx, input, {
        onDownloadProgress: (f) => (busy = `Downloading the on-device model… ${Math.round(f * 100)}%`),
      });
      items = [...txs.map((t) => toInboxItem(t, input.source, preview)), ...items];
    } catch (e) {
      message = { kind: 'error', text: `Could not create a proposal: ${errorText(e)}` };
    } finally {
      busy = '';
    }
  }

  async function sendChat() {
    const text = chat.trim();
    if (!text) return;
    chat = '';
    await ingest({ source: 'chat', text });
  }

  async function ingestImage(file: File) {
    if (caps && !caps.image) {
      message = { kind: 'error', text: 'The selected AI provider cannot read images. Choose another in Settings.' };
      return;
    }
    const notes = chat.trim();
    chat = '';
    await ingest({ source: 'image', text: notes, image: file }, URL.createObjectURL(file));
  }

  async function toggleVoice() {
    if (recording) {
      const r = recording;
      recording = null;
      await r.stop();
      return;
    }
    message = null;
    try {
      if (caps?.audio) {
        const rec = new Recorder();
        await rec.start();
        recording = {
          stop: async () => {
            const audio = await rec.stop();
            const notes = chat.trim();
            chat = '';
            await ingest({ source: 'voice', text: notes, audio });
          },
        };
      } else if (await onDeviceDictationReady()) {
        const d = dictate();
        recording = { stop: async () => d.stop() };
        d.result.then(
          (text) => {
            recording = null;
            if (text) ingest({ source: 'voice', text });
          },
          (e) => {
            recording = null;
            message = { kind: 'error', text: errorText(e) };
          },
        );
      } else {
        message = {
          kind: 'error',
          text: 'Voice input needs an AI provider with audio input or on-device speech recognition, which this browser does not offer. Type instead, or choose another provider.',
        };
      }
    } catch (e) {
      recording = null;
      message = { kind: 'error', text: `Microphone unavailable: ${errorText(e)}` };
    }
  }

  function onApprove(item: InboxItem) {
    if (!ledger) return;
    try {
      ledger.text = approve(ledger.text, item);
      ledger.dirty = true;
      item.status = 'approved';
    } catch (e) {
      message = { kind: 'error', text: `Not approved: ${errorText(e)}` };
    }
  }

  function onReject(item: InboxItem) {
    item.status = 'rejected';
  }

  async function save() {
    if (!ledger) return;
    try {
      if (ledger.handle) await saveToHandle(ledger.handle, ledger.text);
      else download(ledger.name, ledger.text);
      ledger.dirty = false;
      message = { kind: 'info', text: ledger.handle ? `Saved ${ledger.name}.` : `Downloaded ${ledger.name}.` };
    } catch (e) {
      message = { kind: 'error', text: `Save failed: ${errorText(e)}` };
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    for (const item of Array.from(e.dataTransfer?.items ?? [])) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      if (isImageFile(file)) {
        if (ledger) ingestImage(file);
        else message = { kind: 'error', text: 'Open a ledger before adding receipts.' };
      } else if (isLedgerFile(file)) {
        fromDataTransferItem(item).then((o) => o && openLedger(o));
      } else {
        message = { kind: 'error', text: `Unsupported file: ${file.name}` };
      }
      return;
    }
  }
</script>

<svelte:window
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => e.relatedTarget === null && (dragging = false)}
  ondrop={onDrop}
/>

<header class="top">
  <h1>BeanCraft <small>Accounting for Creatives</small></h1>
  <button class="provider muted" onclick={() => (showSettings = true)} data-testid="provider">
    {#if typeof provider === 'string'}
      AI: not configured
    {:else}
      AI: {provider.label}{provider.remote ? ' (cloud)' : ''}
    {/if}
  </button>
</header>

<input type="file" accept=".beancount,.bean,.txt" hidden bind:this={ledgerInput} onchange={onLedgerInput} data-testid="ledger-input" />
<input
  type="file"
  accept="image/*"
  hidden
  bind:this={imageInput}
  data-testid="image-input"
  onchange={(e) => {
    const f = e.currentTarget.files?.[0];
    if (f) ingestImage(f);
    e.currentTarget.value = '';
  }}
/>

{#if engineError}
  <p class="error banner">{engineError}</p>
{:else if !engineReady}
  <p class="banner">Loading rustledger…</p>
{:else if !ledger}
  <main class="welcome" class:dragging>
    <div class="dropzone">
      <h2>Drop your Beancount ledger here</h2>
      <p>
        <button onclick={chooseLedger}>Open ledger…</button>
        <button class="muted" onclick={() => openLedger({ name: 'sample.beancount', text: SAMPLE_LEDGER, handle: null })}>
          Try a sample ledger
        </button>
      </p>
      <p class="hint">
        Your ledger stays on this device. No account, no server, no tracking. Entries are only written when you approve them.
      </p>
    </div>
  </main>
{:else}
  <div class="layout" class:dragging>
    <aside>
      <h2>{ctx?.title ?? ledger.name}</h2>
      <p class="hint">{ledger.name} · {ctx?.directiveCount} directives · {ctx?.accounts.length} open accounts</p>
      {#if validation?.valid}
        <p class="ok" data-testid="ledger-valid">✓ Ledger is valid</p>
      {:else}
        <details class="error">
          <summary>{validation?.errors.length} existing ledger error(s)</summary>
          <ul>{#each validation?.errors.slice(0, 20) ?? [] as e, i (i)}<li>Line {e.line ?? '?'}: {e.message}</li>{/each}</ul>
        </details>
      {/if}
      <p>
        <button onclick={save} disabled={!ledger.dirty} data-testid="save">{ledger.handle ? 'Save' : 'Download'}</button>
        <button class="muted" onclick={chooseLedger}>Open another…</button>
      </p>
      {#if ledger.dirty}<p class="hint" data-testid="unsaved">Unsaved approved changes</p>{/if}
      <details>
        <summary>View ledger</summary>
        <pre data-testid="ledger-text">{ledger.text}</pre>
      </details>
    </aside>

    <main>
      <section class="capture">
        <textarea
          bind:value={chat}
          rows="3"
          placeholder={'Describe a purchase or sale, e.g. "Paid $42.10 at Blick for brushes yesterday with the credit card". Or drop a receipt image anywhere.'}
          aria-label="Describe a transaction"
          onkeydown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && sendChat()}
        ></textarea>
        <div class="actions">
          <button onclick={sendChat} disabled={!!busy || !chat.trim()}>Propose entry</button>
          <button class="muted" onclick={toggleVoice} disabled={!!busy && !recording} aria-pressed={!!recording}>
            {recording ? '■ Stop recording' : '🎤 Voice'}
          </button>
          <button class="muted" onclick={() => imageInput?.click()} disabled={!!busy}>🧾 Receipt image</button>
        </div>
        {#if busy}<p class="hint" role="status">{busy}</p>{/if}
        {#if message}<p class={message.kind} role="alert">{message.text}</p>{/if}
      </section>

      <section>
        <h2>Inbox {pendingCount ? `(${pendingCount} pending)` : ''}</h2>
        {#if items.length === 0}
          <p class="hint">Proposals appear here as diffs. Nothing is written to your ledger until you approve it.</p>
        {/if}
        {#each items as item, i (item.id)}
          <ProposalCard
            bind:item={items[i]}
            ledger={ledger.text}
            baseErrors={validation?.errors ?? []}
            onapprove={onApprove}
            onreject={onReject}
          />
        {/each}
      </section>
    </main>
  </div>
{/if}

{#if showSettings}
  <Settings
    {settings}
    onclose={() => (showSettings = false)}
    onsave={(s) => {
      settings = s;
      saveSettings($state.snapshot(s));
      showSettings = false;
      message = null;
    }}
  />
{/if}

<footer class="bottom hint">
  BeanCraft is free software (AGPL-3.0-or-later), powered by
  <a href="https://github.com/rustledger/rustledger" rel="noreferrer">rustledger</a>. ·
  <a href="https://github.com/wiki3-ai/beancraft" rel="noreferrer">Source</a>
</footer>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    color: var(--header-color);
    background: var(--header-background);
  }

  .top h1 {
    margin: 0;
    font-size: 1.3rem;
  }

  .top small {
    font-weight: normal;
    opacity: 0.85;
    margin-left: 0.5rem;
  }

  .banner {
    padding: 1rem;
  }

  .welcome {
    display: grid;
    place-items: center;
    min-height: 60vh;
  }

  .dropzone {
    text-align: center;
    padding: 3rem;
    border: 2px dashed var(--border-darker);
    border-radius: 6px;
    max-width: 640px;
  }

  .dragging .dropzone,
  .layout.dragging {
    background: var(--dragover-background);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(240px, 320px) 1fr;
    min-height: calc(100vh - 6rem);
  }

  aside {
    padding: 1rem;
    background: var(--sidebar-background);
    border-right: 1px solid var(--sidebar-border);
    overflow-wrap: anywhere;
  }

  aside h2 {
    margin-top: 0;
    font-size: 1.1rem;
  }

  aside pre {
    max-height: 50vh;
    overflow: auto;
    font-size: 12px;
  }

  main {
    padding: 1rem;
    max-width: 900px;
  }

  .capture textarea {
    width: 100%;
    font-family: var(--font-family);
    font-size: 15px;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .ok {
    color: var(--green);
  }

  .bottom {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-lighter);
  }

  @media (width <= 700px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
