import { expect, test } from '@playwright/test';

// Self-test for the guard in fixtures.ts: an off-origin request must be caught.
test('off-origin requests are detected', async ({ page, baseURL }) => {
  const seen: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(baseURL!)) return route.continue();
    seen.push(url);
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.evaluate(() => fetch('https://example.com/beacon').catch(() => undefined));
  expect(seen).toEqual(['https://example.com/beacon']);
});
