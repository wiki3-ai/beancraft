# Third-party notices

BeanCraft is licensed under the GNU Affero General Public License v3.0 or later
(see [LICENSE](LICENSE)). It includes or adapts the following third-party work.
`npm run check:licenses` verifies that every npm dependency uses an allowed license
(no GPL-2.0-only) and that every package bundled into the web app is listed here.

## Shipped in the web app

| Component | Version | License | Source | Use |
| --- | --- | --- | --- | --- |
| rustledger (`@rustledger/wasm`) | 0.24.0 | GPL-3.0-only | https://github.com/rustledger/rustledger | Beancount parser and validator, compiled to WebAssembly. Combined with BeanCraft under AGPLv3 §13 / GPLv3 §13. |
| rustfava theme variables | main (2026) | MIT | https://github.com/rustledger/rustfava (`frontend/css/style.css`) | Adapted CSS custom properties in `src/styles/rustfava-theme.css`. |
| Svelte (`svelte`) | 5.x | MIT | https://github.com/sveltejs/svelte | UI runtime. |
| clsx (`clsx`) | 2.x | MIT | https://github.com/lukeed/clsx | Dependency of the Svelte runtime. |
| esm-env (`esm-env`) | 1.x | MIT | https://github.com/benmccann/esm-env | Dependency of the Svelte runtime. |

### rustledger

The Rust crates linked into `@rustledger/wasm` are restricted by rustledger's own
`cargo-deny` allowlist (GPL-3.0-only, MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib,
0BSD, Unicode-3.0, MPL-2.0, CDLA-Permissive-2.0, CC0-1.0); no GPL-2.0-only code.
The complete corresponding source is available at the repository above.

### rustfava / Fava (MIT)

```
Copyright (c) 2015-2016 Dominik Aumayr

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Svelte, clsx, esm-env (MIT)

Copyright (c) 2016-2026 Svelte Contributors; Copyright (c) Luke Edwards;
Copyright 2022 Benjamin McCann. Each is distributed under the MIT License, whose
text is reproduced above.

## Build and test tools (not shipped)

Vite, TypeScript, svelte-check, Vitest and Playwright and their dependencies are
used only at build/test time. Their licenses (MIT, Apache-2.0, ISC, BSD, MPL-2.0,
0BSD) are checked by `npm run check:licenses`.

## Services

BeanCraft has no backend. The AI provider presets (OpenRouter, Ollama, LM Studio)
are endpoints the user chooses to call from their own browser; no third-party code
from them is included.
