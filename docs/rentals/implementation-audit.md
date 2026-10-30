# Rental and contractual workflow implementation audit

Source specification: `.codex/PROMPT-FINAL.md` (v3, 30 October 2026).

## Requirement map

| Requirement             | Existing code                                                                    | Implementation needed                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Reservation lifecycle   | `rentals.service.ts`, scooter row locks, revision and active-rental unique index | Preserve lifecycle; gate every activation on checkout readiness                                        |
| Tariffs and calendar    | No commercial terms; browser-local seven-day helper                              | Server-calculated integer amounts, explicit commercial category, Bucharest calendar, immutable terms   |
| Technical inspection    | Current scooter fields, timestamp concurrency and maintenance holds              | Versioned observations, explicit checks, transactional synchronization and unsafe findings             |
| Drivers                 | Person identity/licence documents                                                | Authorized participants and independent eligibility                                                    |
| Private files           | S3 `ImageStorageService`, `MediaAsset`, KMS and checksums                        | Extend allowed DOCX/category handling; preserve private access and unique keys                         |
| Template administration | Absent                                                                           | Independent DOCX templates, validation, previews, approvals, immutable versions and atomic set pointer |
| Generation/archive      | Scooter client copies only                                                       | Typed snapshots, exact presented/final assets, manifest and historical access                          |
| Customer verification   | Custom auth OTP primitives, SMSO/SMTP and quotas                                 | Separate rental-scoped guest session, SMS proof, selfie and manual review                              |
| Signatures              | Absent                                                                           | Ordered separate signing acts bound to exact hashes, company acceptance                                |
| Payments                | Finance ledger and optional rental income link                                   | Independent confirmed rent/deposit receipts and contractual coverage                                   |
| Delivery                | Provider adapters and scheduler                                                  | Transactional outbox, retry, evidence export and separate delivery states                              |
| UI                      | Two-step reservation wizard, shared controls                                     | Extend existing wizard/detail; add templates/settings and guest signing surfaces                       |

## Additive migration plan

1. Commercial/speed fields, legacy workflow marker, frozen terms/calendar, participants, inspections and receipts.
2. Template identities/versions/sets, private asset references, settings and active set pointer.
3. Package revisions/documents, restricted invitations/sessions, identity reviews, signing acts and delivery outbox.

Existing rentals remain legacy; no verification, signatures or payments are fabricated. No destructive reset or production seed is part of implementation.

## Decisions and operational dependencies

- Reuse the existing company finance-book/legal-identity context. Extend it with contractual contact/representative/policy settings rather than a competing legal identity.
- Preserve existing scooter `expectedUpdatedAt` concurrency and constructive speed fields.
- Preserve custom authentication and existing refresh/JWKS behavior. Guest signing sessions are purpose-restricted.
- Production rendering requires a configured isolated DOCX/PDF converter and controlled fonts. Missing rendering/storage/SMS configuration must fail explicitly.
- Promotion text, selfie disclosure, retention, representation policy and payment obligation wording require actual approval. Source fixtures do not establish approval.
- Real-device camera/signature checks and legal approval cannot be inferred from automated tests.

## Risks addressed by implementation

Legacy handover bypass; browser timezone drift; future document validity; stale scooter writes; unsigned/changed package reuse; source overwrite; OTP replay and IDOR; unapproved promotions; false delivery confirmation; loss of historical download access.

## Documentation verification

Prisma/package versions: 7.8, NestJS 11, Zod 4.4. Verified 30 October 2026 against:

- <https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7>
- <https://docs.nestjs.com/controllers>
- <https://zod.dev/v4/changelog>

The current generated client path, mandatory PostgreSQL driver adapter, explicit pool settings and explicit dotenv loading are retained.
