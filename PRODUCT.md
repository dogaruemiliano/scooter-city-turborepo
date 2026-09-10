# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ScooterCity administrators operate the fleet and its company finances. Finance actions must remain understandable to an operator without requiring them to reason in debit and credit terminology.

## Product Purpose

ScooterCity is an operational workspace for managing people, scooters, service work, and the financial ledger. The finance module records what happened, where money moved, who paid, who benefited, and what the company and associates owe each other.

## Positioning

The finance model deliberately keeps payment source, economic beneficiary, company obligations, and private associate settlement separate instead of collapsing them into a generic transaction.

## Operating Context

Administrators record company expenses, associate funding, account movements, supporting documents, and auditable reversals. The product operates in English and Romanian and uses integer minor currency units throughout the financial system.

## Capabilities and Constraints

- NestJS owns authenticated financial writes; Next.js consumes versioned schemas from `@repo/api-shared`.
- The financial ledger uses immutable posted journal entries and corrective reversals.
- Associate funding may be a repayable associate loan or a non-repayable capital contribution; these must produce different liabilities/equity consequences.
- Funding defaults to the signed-in associate, the current local date, the default company bank account, and associate-loan treatment.
- Supporting proof images are optional but prominent in the funding workflow.
- Visual and motion values come from the shared theme-token packages.

## Product Principles

- Explain financial consequences in plain language before confirmation.
- Keep rare but consequential choices editable without competing with the primary task.
- Never hide an active financial assumption; collapsed advanced details summarize their current values.
- Preserve a complete audit trail and make reversal the correction mechanism.
- Default routine entries safely while validating every accounting rule on the server.

## Accessibility & Inclusion

Forms must be keyboard accessible, responsive, compatible with localized text expansion, and expose upload, validation, loading, and success states to assistive technology.
