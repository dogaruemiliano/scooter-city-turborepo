# Finance reporting definitions

The finance API reports ledger flows separately from current money locations.
These definitions are part of the API contract and should be changed only with
matching contract, backend, and frontend updates.

## Reporting periods

`GET /v1/finance/summary` accepts explicit ISO 8601 instants and uses a
half-open interval:

```text
occurredAt >= from AND occurredAt < to
```

The client is responsible for converting business-timezone presets such as
"today" into explicit instants. The API does not infer calendar boundaries
from the server timezone. A period must be non-empty and no longer than 366
days.

All period aggregates include only `POSTED` transactions:

- Income is `type = INCOME`.
- Expense is `type = EXPENSE`.
- Transfers, guarantees, distributions, extractions, claims, adjustments, and
  reversal rows are not income or expense.
- A reversed original has status `REVERSED`, so it is excluded independently
  of its reversal row.

Amounts are returned as decimal strings and remain grouped by their
three-letter currency. Values in different currencies are never added
together.

The canonical dashboard sections are:

- `period`: the echoed half-open `from`/`to` range.
- `totals`: income and expenses paired per currency.
- `companyMoney`: each company wallet's `BUSINESS_FUNDS` position by currency.
- `adminMoney`: business, personal, and customer-guarantee buckets grouped by
  administrator and currency.

The response also retains the individual aggregate arrays and raw
`currentBalances` snapshots so detail views do not need another round trip.

## Scope and billing

Financial scope describes whose economic flow a transaction represents:

- `COMPANY`: company money.
- `ADMIN_PERSONAL`: unbilled personal money handled by an administrator
  ("Încasare pe persoană fizică").
- `CUSTOMER_HELD`: customer-owned money held temporarily, such as a guarantee.

Billing status is an independent reporting dimension. It must not be used to
infer financial scope.

Payment method describes how money moved. A missing payment method remains an
explicit `null` group rather than being guessed.

An expense without a category remains an explicit uncategorized (`null`)
group. Inactive categories keep their historical identity and label.

## Current balances

Current money-location values come from `WalletBalance`; the reporting service
does not replay historical transactions.

- Company snapshots include every company wallet and at least its
  `BUSINESS_FUNDS` balance in RON, including an explicit zero when no balance
  row exists.
- Administrator snapshots include every current administrator wallet and the
  `BUSINESS_FUNDS`, `ADMIN_PERSONAL_FUNDS`, and `USER_SETTLEMENT` RON buckets,
  including explicit zeros.
- Normal guarantee transactions place `CUSTOMER_GUARANTEE_FUNDS` on a company
  wallet. Those amounts remain visible in `currentBalances.company` and are not
  assigned to an administrator without an explicit admin-owned balance row.
  Consequently, `adminMoney.customerGuaranteeFunds` can legitimately be zero.
- A user wallet that still holds business or administrator-personal funds
  remains visible after its owner is deactivated or loses the `ADMIN` role.
  The response flags that historical owner state instead of hiding the money.

`generatedAt` is the timestamp of the same repeatable-read database snapshot
used for both aggregates and current balances.
