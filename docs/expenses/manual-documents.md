# Manual expense documents

Expense documents are private evidence attached to an expense. This subsystem
does not perform OCR, infer accounting values, or mutate an expense from file
contents. Every supplier, tax, and review value is entered or confirmed by an
authorized user.

## Document roles

The supported document roles are:

- `FISCAL_RECEIPT`
- `INVOICE`
- `POS_RECEIPT`
- `CREDIT_NOTE`
- `OTHER`

A POS receipt proves that a payment occurred. It is not a tax document and must
never create, amend, or substantiate VAT lines. If an expense has both an
invoice and a POS receipt, the invoice supports the tax treatment and the POS
receipt remains payment evidence only.

## Original and normalized files

The uploaded original is immutable. Correcting metadata, changing review
status, or adding a normalized camera scan never replaces or deletes the
original object.

An optional normalized derivative can improve readability after a camera
capture. It has its own storage key, content type, size, and checksum and keeps
an explicit pairing with the immutable original through the same
`ExpenseDocument`; the original must be attached first. It is evidence
presentation, not a new accounting source.

Supported content types are JPEG, PNG, WebP, and PDF. PDFs are download-only:
the API sends them as attachments with private/no-store caching and content-type
sniffing disabled. The application does not execute or render PDF scripts in
its own origin.

## Direct upload protocol

1. An authenticated finance administrator requests a nested, expense-scoped
   upload URL for an original or normalized file.
2. The request includes the allowlisted content type, exact byte size, and a
   lowercase SHA-256 checksum.
3. The API creates a private S3 signed `PUT` request. The upload token is HMAC
   signed and binds the actor, expense, document, rendition, storage key,
   content type, size, checksum, image dimensions or PDF page count, and expiry.
4. The browser uploads directly to S3 using every returned signed header.
5. Completion validates the token scope and expiry, then checks the private S3
   object's size and content type. S3 validates the signed checksum during the
   `PUT`.
6. Only a successfully completed object is attached to the expense document.

Upload tokens are not bearer access to document content. Content routes repeat
normal finance authorization and resolve storage keys server-side; storage
keys and bucket names are never accepted from clients.

## Manual metadata and review

Document metadata is independent of stored bytes and can be reviewed without
rewriting the original file. The shared API contract defines the exact fields,
including document number/date, supplier and buyer tax identifiers, review
status, and buyer-CUI status.

Review and buyer-CUI state are explicit. Missing values stay missing; the API
does not guess them from filenames, payment data, or counterparties. A POS
receipt's buyer-CUI state is `NOT_APPLICABLE` and its `buyerTaxIdentifier` must
be absent. Any merchant identifier recorded on a POS receipt is cataloguing
metadata only and never feeds the expense tax snapshot or VAT reporting.

For fiscal receipts, invoices, and credit notes, buyer-CUI review is checked
against the configured legal entity rather than trusted as a client assertion.
Those fiscal types cannot use `NOT_APPLICABLE`. `MATCHED` requires a captured
`buyerTaxIdentifier` that normalized-equals the legal entity Company's tax
identifier. `MISSING` requires no captured buyer identifier. `MISMATCH`
requires a captured identifier that does not normalize to the configured one.
Normalization uppercases, removes formatting separators, and treats a leading
`RO` before a numeric CUI as optional; it does not invent or OCR an identifier.

In compact v1, only a confirmed `FISCAL_RECEIPT` or `INVOICE` with a matched
buyer CUI can qualify an expense for VAT recovery or fiscal deductibility. A
`CREDIT_NOTE` uses the same strict metadata policy so it can be catalogued and
reviewed safely, but it is deliberately non-qualifying until credit-note
accounting is implemented as a separate workflow.

Final posting also enforces the payment-source evidence policy. A company-card
or company-cash-desk expense requires a confirmed `FISCAL_RECEIPT` or `INVOICE`
whose buyer CUI matches the selected legal entity and which has a live
`ORIGINAL` file. A company-card expense additionally requires a confirmed
`POS_RECEIPT` with its own live `ORIGINAL` file. A personal-funds expense may be
posted without a fiscal file, but it cannot assert `MATCHED` company-buyer
evidence. These checks run when posting, so a draft can exist while files are
still being uploaded and reviewed.

The append-once rule prevents replacing either asset role. A whole document can
be deleted only while its expense is still a draft; that draft cleanup also
marks its asset metadata deleted and best-effort removes the private object.
Document creation, metadata edits, and review changes are allowed only while
the expense is a draft, because those fields determine the locked tax snapshot.
After posting, an original or normalized file may still be appended once to an
already-reviewed document, but its metadata cannot be created, changed, or
deleted. Reversed expense evidence is fully read-only.
