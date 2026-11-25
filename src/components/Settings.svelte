<script lang="ts">
  import { untrack } from 'svelte';
  import { BuiltinProvider } from '../lib/ai/builtin';
  import { isLocalUrl } from '../lib/ai/openai';
  import { PRESETS, type AiSettings } from '../lib/ai/settings';

  interface Props {
    settings: AiSettings;
    onsave: (s: AiSettings) => void;
    onclose: () => void;
  }

  let { settings, onsave, onclose }: Props = $props();
  // The dialog edits a copy, initialised once when it opens.
  let draft = $state<AiSettings>(untrack(() => structuredClone($state.snapshot(settings))));
  const builtinPresent = BuiltinProvider.isPresent();
  const preset = $derived(PRESETS.find((p) => p.id === draft.preset));
  const remote = $derived(draft.provider === 'openai' && !isLocalUrl(draft.openai.baseUrl));
  const remoteHost = $derived(URL.canParse(draft.openai.baseUrl) ? new URL(draft.openai.baseUrl).host : 'this provider');

  function choosePreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    draft.preset = id;
    if (p) draft.openai = { ...draft.openai, baseUrl: p.baseUrl, model: p.model };
  }
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <h2 id="settings-title">AI provider</h2>

    <label class="choice">
      <input type="radio" bind:group={draft.provider} value="builtin" disabled={!builtinPresent} />
      Built-in browser AI (on-device){builtinPresent ? '' : ' — not available in this browser'}
    </label>
    <label class="choice">
      <input type="radio" bind:group={draft.provider} value="openai" />
      OpenAI-compatible provider
    </label>

    {#if draft.provider === 'openai'}
      <fieldset>
        <label>
          Preset
          <select value={draft.preset} onchange={(e) => choosePreset(e.currentTarget.value)}>
            {#each PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
          </select>
        </label>
        <label>Base URL <input bind:value={draft.openai.baseUrl} spellcheck="false" /></label>
        <label>Model <input bind:value={draft.openai.model} spellcheck="false" /></label>
        <label>
          API key{preset?.needsKey ? '' : ' (optional)'}
          <input type="password" bind:value={draft.openai.apiKey} autocomplete="off" spellcheck="false" />
        </label>
        {#if remote}
          <p class="warning" data-testid="cloud-warning">
            Cloud provider: your prompts, receipt images and the list of account names will be sent to
            <strong>{remoteHost}</strong>.
            Your ledger file itself is never uploaded.
          </p>
        {/if}
        <p class="hint">Settings and API keys are stored only in this browser.</p>
      </fieldset>
    {/if}

    <footer>
      <button onclick={() => onsave(draft)}>Save</button>
      <button class="muted" onclick={onclose}>Cancel</button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--overlay-wrapper-background);
    z-index: 3;
  }

  .dialog {
    width: min(520px, 92vw);
    padding: 1rem 1.25rem;
    background: var(--background);
    border-radius: 4px;
    box-shadow: var(--box-shadow-overlay);
  }

  h2 {
    margin-top: 0;
  }

  .choice {
    display: block;
    margin: 0.4rem 0;
  }

  fieldset {
    border: 1px solid var(--border);
    margin: 0.75rem 0;
  }

  fieldset label {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.5rem;
  }

  .warning {
    padding: 0.5rem;
    border-left: 4px solid var(--warning);
    background: var(--background-darker);
  }

  footer {
    display: flex;
    gap: 0.5rem;
  }
</style>
