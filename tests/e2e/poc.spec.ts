import { expect, mockBuiltinAi, test } from './fixtures';

const card = (amount: string, account = 'Expenses:Art-Supplies') => ({
  date: '2026-03-04',
  payee: 'Paper Moon Supply',
  narration: 'Brushes',
  postings: [
    { account, amount, currency: 'USD' },
    { account: 'Liabilities:CreditCard', amount: null, currency: null },
  ],
});

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await mockBuiltinAi(page, {
    text: card('42.10'),
    image: card('18.99'),
    audio: { ...card('7.25', 'Expenses:Meals'), payee: 'Corner Cafe', narration: 'Coffee' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample ledger' }).click();
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  await expect(page.getByTestId('provider')).toHaveText('AI: Built-in browser AI');
});

test('chat becomes an approved entry only after approval', async ({ page }) => {
  await page.getByLabel('Describe a transaction').fill('Paid 42.10 at Blick for brushes on the credit card');
  await page.getByRole('button', { name: 'Propose entry' }).click();

  const proposal = page.getByTestId('proposal');
  await expect(proposal).toContainText('+ 2026-03-04 * "Paper Moon Supply" "Brushes"');
  await expect(proposal.getByTestId('valid')).toBeVisible();
  await expect(page.getByTestId('ledger-text')).not.toContainText('Paper Moon Supply');
  await expect(page.getByTestId('save')).toBeDisabled();

  await proposal.getByRole('button', { name: 'Approve' }).click();
  await expect(proposal).toContainText('approved');
  await expect(page.getByTestId('ledger-text')).toContainText('Paper Moon Supply');
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  await expect(page.getByTestId('unsaved')).toBeVisible();
});

test('receipt image becomes a proposal', async ({ page }) => {
  await page.getByTestId('image-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  const proposal = page.getByTestId('proposal');
  await expect(proposal).toContainText('18.99 USD');
  await expect(proposal.getByRole('img', { name: 'Receipt' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lmCalls: string[][] }).__lmCalls)).toEqual([
    ['text', 'image'],
  ]);
});

test('voice recording becomes a proposal', async ({ page }) => {
  await page.getByRole('button', { name: '🎤 Voice' }).click();
  await page.getByRole('button', { name: '■ Stop recording' }).click();
  const proposal = page.getByTestId('proposal');
  await expect(proposal).toContainText('"Corner Cafe" "Coffee"');
  await expect(proposal).toContainText('Expenses:Meals');
  expect(await page.evaluate(() => (window as unknown as { __lmCalls: string[][] }).__lmCalls)).toEqual([
    ['text', 'audio'],
  ]);
});

test('rejected proposals are not written', async ({ page }) => {
  await page.getByLabel('Describe a transaction').fill('brushes 42.10');
  await page.getByRole('button', { name: 'Propose entry' }).click();
  const proposal = page.getByTestId('proposal');
  await proposal.getByRole('button', { name: 'Reject' }).click();
  await expect(proposal).toContainText('rejected');
  await expect(page.getByTestId('ledger-text')).not.toContainText('Paper Moon Supply');
});

test('edits that break the ledger cannot be approved', async ({ page }) => {
  await page.getByLabel('Describe a transaction').fill('brushes 42.10');
  await page.getByRole('button', { name: 'Propose entry' }).click();
  const proposal = page.getByTestId('proposal');
  await proposal.getByRole('button', { name: 'Edit' }).click();
  const editor = proposal.getByLabel('Edit entry');
  await editor.fill((await editor.inputValue()).replace('Expenses:Art-Supplies', 'Expenses:Unknown'));
  await expect(proposal.getByTestId('invalid')).toBeVisible();
  await expect(proposal.getByRole('button', { name: 'Approve' })).toBeDisabled();
});
