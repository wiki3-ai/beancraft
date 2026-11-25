import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

export const BUNDLED_PACKAGES_FILE = 'node_modules/.tmp/bundled-packages.json';

/** Record which npm packages end up in the shipped bundle, for scripts/check-licenses.mjs. */
function bundledPackages(): Plugin {
  return {
    name: 'beancraft:bundled-packages',
    apply: 'build',
    generateBundle(_, bundle) {
      const names = new Set<string>();
      const add = (id: string) => {
        const m = id.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
        if (m) names.add(m[m.length - 1].slice('node_modules/'.length));
      };
      for (const id of this.getModuleIds()) add(id);
      for (const out of Object.values(bundle)) if (out.type === 'asset') out.originalFileNames.forEach(add);
      mkdirSync('node_modules/.tmp', { recursive: true });
      writeFileSync(BUNDLED_PACKAGES_FILE, JSON.stringify([...names].sort(), null, 2));
    },
  };
}

/** Global headers from public/_headers (as served by Cloudflare), so `vite preview` and e2e tests use the production CSP. */
function productionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let inGlobal = false;
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) inGlobal = line.trim() === '/*';
    else if (inGlobal) {
      const i = line.indexOf(':');
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return headers;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), bundledPackages()],
  preview: { headers: productionHeaders() },
});
