# Expense reporting definitions

Expense reporting uses the specialized expense aggregate as its source of
truth. A linked ledger transaction records posting effects but is never added
to expense totals a second time.

## Inclusion and periods

Only posted, non-reversed expenses are included. Drafts and reversed expenses
are excluded.

Every report uses a half-open period:

```text
occurredOn >= from AND occurredOn < to
```

The caller supplies the business-calendar boundaries. Values stay grouped by
their three-letter currency; amounts in different currencies are never added
together or converted implicitly.

## Attribution

Every cost pool is attributed completely to exactly one reporting target in
the compact workflow:

- `BUSINESS`: the business generally.
- `OWNER`: one formal business owner effective for the expense date.

Attribution classifies both gross and recognized cost. For every currency and
period, these invariants must hold:

```text
business gross + owner gross = total gross
business recognized + owner recognized = total recognized
```

Owner totals remain separated by `businessOwnerId`. The user who entered the
expense, the user who physically paid, and the user who supplied funds are not
attribution substitutes. In compact mode the two `unallocated*` response fields
are integrity signals and must therefore both be `0.00`; an incomplete or
over-allocated snapshot is rejected instead of reported.

## Funding and reimbursement policy

Funding source and attribution together select reimbursement treatment:

| Funding source    | Attribution    | Valid | Reimbursement owed          |
| ----------------- | -------------- | ----- | --------------------------- |
| Company card      | Business       | yes   | no                          |
| Company card      | Specific owner | yes   | no                          |
| Company cash desk | Business       | yes   | no                          |
| Company cash desk | Specific owner | yes   | no                          |
| Personal funds    | Business       | yes   | yes, to the personal funder |
| Personal funds    | Specific owner | yes   | no                          |

The last row is an intentional business-policy exception to the general rule
that attribution is a reporting dimension: an owner-attributed expense paid
from personal funds does not create an amount owed by the company. This remains
true when the personal funder and attributed owner differ.

`paidByUserId` records the admin user who executed the payment. It never
determines the claim creditor. The creditor is `fundedByUserId`, which may be
any eligible admin user permitted by the expense contract; that user does not
have to be a formal business owner. Formal `BusinessOwner` memberships use an
explicit `userId` and are used only for OWNER attribution. Only the personal
funder on a valid personally funded, business-attributed payment can be owed
reimbursement. A formal owner membership may reference any active user; it
does not grant the `ADMIN` role or by itself make that user an eligible payment
actor.

Compact v1 does not provide a reimbursement-settlement reversal workflow. An
expense with any settlement therefore cannot be reversed; a future PR must add
an explicit compensating settlement reversal before relaxing that guard.

## Avoiding double counting

Expense totals are aggregated from expense cost pools and attributions. Claim
totals are aggregated from the specialized claim/payment state produced for
the expense. Reporting must not additionally sum:

- the linked `EXPENSE` money transaction;
- wallet balance changes created by posting;
- reimbursement ledger rows; or
- reversal ledger rows.

Those ledger records can be joined for drill-down and reconciliation, but they
are not independent expense facts.

Manual document metadata and POS receipts do not affect totals. Tax totals come
only from confirmed expense tax lines/snapshots; a POS receipt remains payment
evidence only.
