import { expect, test } from './fixtures';

test('keeps an incomplete entry and uses the answer to create a proposal', async ({ page }) => {
  await page.addInitScript(() => {
    const prompts: string[] = [];
    (window as unknown as { prompts: string[] }).prompts = prompts;
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (messages: { content: { value: string }[] }[]) => {
          prompts.push(messages[0].content[0].value);
          const postings: { account: string; amount: string | null; currency: string | null }[] =
            [{ account: 'Expenses:Art-Supplies', amount: '22.40', currency: 'USD' }];
          if (prompts.length > 2) postings.push({ account: 'Assets:Bank:Checking', amount: null, currency: null });
          return JSON.stringify({ question: null, transactions: [{ date: '2026-03-04', payee: 'Zen Supplies', narration: 'Ink', postings }] });
        },
        destroy() {},
      }),
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample ledger' }).click();
  await page.getByLabel('Describe a transaction').fill('I bought ink for $22.40 at Zen Supplies');
  await page.getByRole('button', { name: 'Propose entry' }).click();
  const pending = page.getByTestId('pending-input');
  await expect(pending).toContainText('I bought ink for $22.40 at Zen Supplies');
  await expect(pending).toContainText('account used to pay');
  await page.getByLabel('Describe a transaction').fill('My checking account');
  await page.getByRole('button', { name: 'Send details' }).click();
  await expect(page.getByTestId('proposal')).toContainText('22.40 USD');
  await expect(pending).toHaveCount(0);
  const prompts = await page.evaluate(() => (window as unknown as { prompts: string[] }).prompts);
  expect(prompts[2]).toContain('I bought ink for $22.40 at Zen Supplies');
  expect(prompts[2]).toContain('My checking account');
});

test('keeps the original recording when a voice entry needs clarification', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: { text: string; types: string[] }[] = [];
    (window as unknown as { calls: typeof calls }).calls = calls;
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (messages: { content: { type: string; value: string }[] }[]) => {
          const content = messages[0].content;
          calls.push({ text: content[0].value, types: content.map((part) => part.type) });
          if (calls.length === 1) return JSON.stringify({ question: 'How did you pay?', transactions: [] });
          return JSON.stringify({ question: null, transactions: [{
            date: '2026-03-04', payee: 'Zen Supplies', narration: 'Ink',
            postings: [
              { account: 'Expenses:Art-Supplies', amount: '22.40', currency: 'USD' },
              { account: 'Assets:Bank:Checking', amount: null, currency: null },
            ],
          }] });
        },
        destroy() {},
      }),
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample ledger' }).click();
  await page.getByRole('button', { name: '🎤 Voice' }).click();
  await page.getByRole('button', { name: '■ Stop recording' }).click();
  await expect(page.getByTestId('pending-input')).toContainText('Voice recording retained');
  await page.getByLabel('Describe a transaction').fill('Checking');
  await page.getByRole('button', { name: 'Send details' }).click();
  await expect(page.getByTestId('proposal')).toContainText('22.40 USD');
  const calls = await page.evaluate(() => (window as unknown as { calls: { text: string; types: string[] }[] }).calls);
  expect(calls.map((call) => call.types)).toEqual([['text', 'audio'], ['text', 'audio']]);
  expect(calls[1].text).toContain("User's answer: Checking");
});

test('retains the input when the provider fails and permits retry', async ({ page }) => {
  await page.addInitScript(() => {
    let attempts = 0;
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => {
          if (++attempts === 1) throw new Error('offline');
          return JSON.stringify({ question: 'How did you pay?', transactions: [] });
        },
        destroy() {},
      }),
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample ledger' }).click();
  await page.getByLabel('Describe a transaction').fill('Ink at Zen');
  await page.getByRole('button', { name: 'Propose entry' }).click();
  await expect(page.getByRole('alert')).toContainText('offline');
  await expect(page.getByTestId('pending-input')).toContainText('Ink at Zen');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('pending-input')).toContainText('How did you pay?');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
