import { test as base, expect, type Page } from '@playwright/test';

/**
 * Network guard: BeanCraft must not contact anything but its own origin unless
 * the user configures a provider. Every off-origin request is recorded and
 * aborted, and the test fails if any were attempted.
 */
export const test = base.extend<{ offOrigin: string[]; pageErrors: string[] }>({
  // Uncaught exceptions and console errors (including CSP violations) fail the test.
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await use(errors);
      expect(errors, 'page errors').toEqual([]);
    },
    { auto: true },
  ],
  offOrigin: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const offOrigin: string[] = [];
      await page.context().route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        offOrigin.push(url);
        return route.abort('blockedbyclient');
      });
      await use(offOrigin);
      expect(offOrigin, 'unexpected network requests').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

type Tx = {
  date: string;
  payee: string;
  narration: string;
  postings: { account: string; amount: string | null; currency: string | null }[];
};

/** Install a fake Chrome Prompt API whose answers depend on the input modality. */
export async function mockBuiltinAi(page: Page, answers: { text?: Tx; image?: Tx; audio?: Tx }) {
  await page.addInitScript((answers) => {
    const calls: string[][] = [];
    (window as unknown as { __lmCalls: string[][] }).__lmCalls = calls;
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (messages: { content: { type: string; value: unknown }[] }[]) => {
          const types = messages[0].content.map((c) => c.type);
          calls.push(types);
          const kind = types.includes('image') ? 'image' : types.includes('audio') ? 'audio' : 'text';
          const tx = (answers as Record<string, unknown>)[kind];
          return JSON.stringify({ transactions: tx ? [tx] : [] });
        },
        destroy() {},
      }),
    };
  }, answers);
}
