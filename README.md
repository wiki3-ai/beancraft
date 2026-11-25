# BeanCraft

**Accounting for Creatives** (not Creative Accounting).

BeanCraft is free, open-source (AGPL-3.0-or-later), local-first bookkeeping in the browser.
Open your [Beancount](https://beancount.github.io/) ledger, then describe a purchase, say it out loud, or drop in a receipt photo.
BeanCraft proposes an entry, [rustledger](https://github.com/rustledger/rustledger) checks it, and you approve the diff.
Nothing is written to your ledger until you approve it.

- No BeanCraft account, backend or analytics. Your ledger never leaves your device.
- Runs entirely in the browser. The rustledger engine is compiled to WebAssembly.
- AI is pluggable. By default BeanCraft uses the browser's built-in, on-device AI when one is available (Chrome's and Edge's Prompt API).
  You can instead choose any OpenAI-compatible provider: OpenRouter, which has free models, a local Ollama or LM Studio, or your own endpoint.

## Status: proof of concept (milestone 1)

The proof of concept can:

- Open a ledger by drag-and-drop or the file picker. A sample ledger is also included.
  - In Chrome and Edge, approved entries can be saved back to the same file.
  - Other browsers download the updated file instead.
- Turn chat, voice, and receipt or invoice images into proposed transactions.
- Show every proposal in an **Approval Inbox** as a diff, with rustledger's verdict. You can edit, approve or reject each one.
  - Approval is disabled while rustledger reports an error that the entry would introduce.
  - Each entry is checked again against the current ledger at the moment you approve it.

Not yet included (see [Roadmap](#roadmap)):

- the desktop app
- PDF ingestion
- bank connections
- the MCP server
- the full rustfava reporting UI

## Using it

1. Open https://beancraft.io, or run it locally (see below).
2. Drop a `.beancount` file on the page, or click **Try a sample ledger**.
3. Type something like *"Paid $42.10 at Blick for brushes yesterday on the credit card"*.
   You can also click **🎤 Voice**, or drop a receipt image anywhere on the page.
4. Review the diff in the Inbox, then click **Approve**, **Edit** or **Reject**.
5. Click **Save** (or **Download**) to write the approved entries.

### AI providers

Click the **AI:** button in the header to choose a provider.

| Provider | Where it runs | Text | Receipt images | Voice |
| --- | --- | --- | --- | --- |
| Built-in browser AI (default when available) | On your device | ✓ | ✓ | ✓ (audio input needs a GPU in Chrome) |
| OpenRouter, `openrouter/free` (default otherwise) | Cloud. Needs your own OpenRouter API key. | ✓ | ✓ | On-device dictation, where the browser supports it |
| Ollama / LM Studio / custom | Local or wherever you point it | ✓ | Depends on the model | On-device dictation, where the browser supports it |

- **Chrome's built-in AI** downloads its model the first time it is used.
  BeanCraft shows the download progress. After that, everything runs offline on your device.
- **Cloud providers** are only contacted after you configure them.
  Before you save, the settings dialog states exactly what is sent: your prompt, any receipt image, and your account names.
  The ledger file itself is never uploaded.
- **Ollama** needs to allow the page's origin:
  - For the hosted app, start it with `OLLAMA_ORIGINS=https://beancraft.io ollama serve`.
  - Ollama already allows `localhost` origins, so local development needs no change.
- **LM Studio** needs "Enable CORS" turned on in its server settings.
- Settings and API keys are stored only in this browser's `localStorage`.

### How proposals stay safe

- The model is asked for a structured JSON proposal. It must use only the accounts in your ledger and copy amounts exactly as written.
  The model does no arithmetic: the balancing posting is left blank for rustledger to compute.
- BeanCraft normalises and checks the JSON, and **renders the Beancount text itself**.
  Model output is never pasted into your ledger.
- rustledger validates the ledger with the proposed entry added. Only errors that the entry introduces block approval.

## Development

Requires Node.js 22 or later.

```sh
npm ci
npm run dev            # http://localhost:5173
npm run check          # svelte-check + TypeScript
npm test               # unit tests (Vitest, real rustledger WASM)
npm run build          # static site in dist/
npm run check:licenses # dependency license allow-list (run after build)
npx playwright install chromium
npm run test:e2e       # end-to-end tests
```

The end-to-end tests mock the browser's built-in AI.
They fail on any request that is not to the app's own origin, on any page error, and on any CSP violation.
`vite preview` serves the production headers from `public/_headers`, so the tests run under the same Content Security Policy as the live site.

### Deploying (Cloudflare Workers static assets)

The site is a static, asset-only Cloudflare Worker. There is no Worker script and no Pages project.

```sh
npm run build
npx wrangler deploy    # uses wrangler.jsonc; custom domain beancraft.io
```

Response headers, including the CSP, come from `public/_headers`.
R2 is reserved for desktop release downloads in a later milestone.

## Findings from the proof of concept

- **rustledger in the browser works today.**
  - The prebuilt [`@rustledger/wasm`](https://www.npmjs.com/package/@rustledger/wasm) package (GPL-3.0-only) parses and validates ledgers client-side.
  - It is about 4.5 MB, or 1.6 MB with gzip. It is loaded under a strict CSP using `'wasm-unsafe-eval'`.
- **rustfava's UI cannot be reused unchanged.**
  - rustfava's Svelte frontend expects its Flask/Python server, so the PoC reuses only its MIT-licensed theme.
  - The proof of concept does not need rustfava's journal or report views.
  - Reusing those views means replacing its server API with calls to rustledger in WASM. That is the main next-milestone task.
- **Licensing.**
  - AGPL-3.0-or-later can be combined with rustledger's GPL-3.0-only code (GPLv3/AGPLv3 §13).
  - rustledger's `cargo-deny` allowlist excludes GPL-2.0-only code.
  - `npm run check:licenses` enforces the same rule for npm packages, and checks that every bundled package is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Built-in AI.**
  - Chrome's Prompt API accepts text, image and audio input with JSON-schema-constrained output. Edge's version is experimental.
  - Other browsers fall back to the user's chosen provider.
  - Chrome's audio input needs a GPU. Without it, BeanCraft turns speech into chat text with the browser's speech recognition, but only when that recognition runs on-device (`processLocally`). Server-based recognition would send your audio to the browser vendor.

## Roadmap

1. **Ledger views.** Port rustfava's journal, balance and report components onto rustledger WASM queries. Use ArtCraft-style theming.
2. **Desktop app.** Package the same web app with Tauri (MIT/Apache-2.0). GitHub Actions on version tags would produce signed macOS `.dmg`, Windows `.msi` and Linux AppImage/`.deb` builds, published to GitHub Releases and mirrored to R2.
   - Tauri webviews don't provide the Prompt API, so the desktop app will default to a local OpenAI-compatible provider.
3. **More document ingestion.** PDF invoices (rendered to images in the browser), multi-entry receipts and attachments linked with Beancount `document` directives.
4. **Bank data.** User-owned SimpleFIN Bridge connections, fetched directly from the browser or desktop app and deduplicated locally. Imports go into the same Inbox.
5. **Local MCP server.** A desktop-only MCP server for AI agents.
   - Read-only by default.
   - Any write is staged as an Inbox proposal that you approve in the app.

## License

BeanCraft is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
