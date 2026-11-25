import { expect, test } from './fixtures';

// Simulate a browser without built-in AI (recent Chromium builds expose LanguageModel).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }));
});

test('without built-in AI, OpenRouter is the default and needs a key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample ledger' }).click();
  await expect(page.getByTestId('provider')).toHaveText('AI: not configured');
  await page.getByLabel('Describe a transaction').fill('coffee 4.50');
  await page.getByRole('button', { name: 'Propose entry' }).click();
  await expect(page.getByRole('alert')).toContainText('OpenRouter API key');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('cloud-warning')).toContainText('openrouter.ai');
});

test('an API key is never carried over to a different endpoint', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('provider').click();
  const key = page.getByLabel(/API key/);
  await key.fill('sk-or-test');
  await page.getByLabel('Base URL').fill('https://example.invalid/v1');
  await expect(key).toHaveValue('');

  await key.fill('sk-or-test');
  await page.getByLabel('Preset').selectOption({ label: 'Ollama (local)' });
  await expect(key).toHaveValue('');
  await expect(page.getByTestId('cloud-warning')).toHaveCount(0);
});
