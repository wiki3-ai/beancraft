export const SAMPLE_LEDGER = `option "title" "Studio Ledger (sample)"
option "operating_currency" "USD"

2026-01-01 open Assets:Bank:Checking USD
2026-01-01 open Liabilities:CreditCard USD
2026-01-01 open Equity:Opening-Balances
2026-01-01 open Income:Commissions USD
2026-01-01 open Income:Sales USD
2026-01-01 open Expenses:Art-Supplies USD
2026-01-01 open Expenses:Software USD
2026-01-01 open Expenses:Meals USD
2026-01-01 open Expenses:Travel USD
2026-01-01 open Expenses:Studio-Rent USD

2026-01-01 * "Opening balance"
  Assets:Bank:Checking  2500.00 USD
  Equity:Opening-Balances

2026-01-03 * "Blick Art Materials" "Canvas and paints"
  Expenses:Art-Supplies  84.20 USD
  Liabilities:CreditCard

2026-01-05 * "Client: Harbor Cafe" "Mural commission deposit"
  Assets:Bank:Checking  600.00 USD
  Income:Commissions
`;
