# Rental and contract implementation report

Task source: `.codex/PROMPT-FINAL.md` and its supplied v2 template assets. The original package remains unchanged. This report describes implementation work rather than legal certification or a completed production pilot.

## Implemented

- Automatic, versioned 300/250 lei weekly terms, independent 300 lei deposit, standard/3+1 initial coverage, Bucharest calendar arithmetic and separate reservation/agreement/billing/handover timestamps.
- Required licence is the sole operational policy selector after user review: `none` →25 km/h, `AM` →45 km/h, and other categories have no category-based application cap. Pricing is derived from licence selection. Actual CIV construction speed and historical physical evidence remain independent.
- Authorized drivers, current document/eligibility checks, append-only draft/confirmed handover and return inspections, scooter timestamp conflicts, equipment presence versus operation and critical problem creation. A defective odometer does not fabricate mileage.
- Independent confirmed receipt records, idempotency and allocation to the original owed period; selected methods do not confirm payment. Legacy handover routes enforce the new readiness gate.
- Physical handover recipient, original ID confirmation and responsible operator/server timestamp. The actual conclusion context is separate from the web signing channel.
- Private source/preview/presented/final asset metadata using the existing S3 service, exact template versions, compatible sets, publication approvals, atomic activation/rollback and package manifests.
- Structurally separated agreement, GDPR and technical DOCX sources, the 123-field registry, bounded OOXML validation, run-aware placeholders, images/signature slots and private DOCX/PDF converter integration.
- Company, person, driver, scooter, terms, inspection, identity/photo, media and authorized vehicle-copy snapshots. Ordinary operations preserve referenced source and evidence objects.
- Restricted guest invitations and cookie sessions, scoped HMAC OTPs with cumulative quotas/attempts, actual selfie notice acknowledgement, raster validation and manual approval references.
- Ordered separate customer acts, separate limiter acceptance when applicable, per-document company acts, exact acceptance texts/hashes and optional final OTP policy pinned to the package.
- Separate customer completion, company acceptance, final PDF generation, conclusion and handover states; original presented bytes remain distinct from final signed bytes.
- Durable invitation/final-document delivery states, recovery for uncertain outcomes, authorized private downloads and self-contained internal evidence ZIP export.
- Web operator/administrator/customer interfaces using shared controls, theme tokens, localized labels and real submission state; private media upload replaces manual media ID entry. Company logo upload is sanitized and company-scoped, with arbitrary private identity assets rejected.
- Privileged retention with category-specific approved policies, legal holds, exact preview manifests, separate approval, live-reference protection, deletion leases/retries and preserved evidence digests. No real retained files were purged.
- The manual commercial category, limiter configuration, threshold, source, evidence and correction-reason controls were removed from create/edit, including stale draft/import/registration overrides. Unsupported minor/unknown-age lessees fail closed pending an approved representation procedure.

## Main implementation locations

- Domain and checkout: `packages/api-shared/src/v1/rentals/`, `apps/api/src/rentals/`.
- Scooter configuration and identity provenance: scooter/person shared schemas, mappers and services; `person-document-contract-evidence.ts` and `scooter-contract-evidence.ts` preserve reviewed assets.
- Templates, snapshots, package lifecycle, signing, delivery and evidence: `apps/api/src/contract-templates/` and `packages/api-shared/src/v1/contracts/`.
- Operator checkout: `apps/web/src/app/[locale]/rentals/_components/RentalCheckout.tsx` and the existing creation wizard/draft flow.
- Administrator templates/settings: `apps/web/src/app/[locale]/company/contract-templates/`.
- Customer signing and same-origin boundary: `apps/web/src/app/[locale]/signing/` and `apps/web/src/app/api/signing/`.
- Shared viewer/signature capabilities and stories: `packages/ui/src/components/`.
- Source import: `scripts/migrate-contract-templates.ts`.

## Additive migrations

1. `20261030150000_rental_checkout`: commercial/speed configuration, terms/calendar, participants, inspections and receipts; old rentals retain workflow version 0.
2. `20261030160000_contract_workflow`: template versions/sets/settings, packages/documents/signatures, invitations/sessions, delivery and idempotent commands.
3. `20261030170000_handover_confirmation`: actual recipient, original ID check and confirming operator.
4. `20261030180000_signing_invitation_delivery`: recoverable invitation delivery metadata and leases; older invitations are not falsely marked sent.
5. `20261030190000_contract_conclusion_context`: explicit real-world conclusion context.
6. `20261030200000_speed_configuration_null_constraints`: NULL-safe database enforcement for known documented limiter configurations.
7. `20261030210000_contract_retention`: approved retention policies, legal holds, reviewed purge batches, asset/package/audit tombstones and company/purpose provenance.
8. `20261030220000_retention_deletion_lease`: owner-bound deletion leases and provider deletion acknowledgements for safe recovery.

Migration deployment was first verified against an isolated local test database. After a reported Docker/database outage, the eight tested additive migrations were also applied to the existing local development database (`localhost:5434/app`). No production data was migrated, no database was reset, and no synthetic evidence was backfilled.

## Verification

Original rollout verification (before the subsequent licence-only form revision):

- Full API suite: **98 suites and 1,044 tests passed**; six opt-in suites / 73 tests skipped in the ordinary run.
- The two new opt-in PostgreSQL suites were then executed explicitly, sequentially against the isolated database: **30/30 passed** (13 contract workflow cases and 17 signing/evidence/retention cases).
- Full web suite after all follow-up changes: **191 files and 1,949 tests passed**.
- i18n: **17/17 passed**; theme: **21/21 passed**.
- API, web and UI type checks passed. The NestJS production compilation also passed. Full API, changed-source web and shared UI lint checks passed after the final type/format fixes.

Coverage includes actual database races for invitations, OTP consumption, duplicate signing, set activation, inspections and receipt allocation, plus an evidence ZIP checked using Python's independent ZIP reader.

Opt-in integration suites require `TEST_CONTRACT_DATABASE_URL` and never fall back to `DATABASE_URL`. The isolated cluster received all 92 migrations successfully. The signing archive test additionally requires Python 3 for an independent ZIP reader. Production provider/device checks are not represented by these automated totals.

Post-lint focused web checks passed; later targeted runs also covered retention permissions, logo uploads, localized dates and audited speed-correction validation. These overlapping targeted runs are not added to the final full-suite total. The definitive browser run used synthetic API fixtures, the repository's sample PDF, real PDF.js/zoom and four separately drawn PNG acts. It passed at desktop 1280×900 and mobile 390×844, with no relevant console errors/warnings and no horizontal mobile overflow. Local review artifacts are `/private/tmp/contracts-signing-desktop.png`, `/private/tmp/contracts-signing-mobile.png` and `/private/tmp/contracts-browser-final-result.log`.

The observed signing page returned HTTP 200, no-referrer and noindex/nofollow. The same-origin BFF's private no-store boundary was tested. Next's development server overrode the page's cache header to `no-cache, must-revalidate`; production page cache behavior still requires deployment verification.

Browser verification is distinct from testing production providers or physical devices. Actual conversion and layout QA was subsequently run with an officially downloaded, hash/signature-verified temporary LibreOffice 26.8.2.2: **22 PDFs / 96 pages**, covering all 18 ready-for-signing scenarios and four final signed examples. No missing expected values, unresolved tokens, clipping or overlap were found. Distinct signature images and the no-limiter N/A case were checked. See [the renderer QA record](template-render-qa-2026-10-30.md) and its hash inventory. The temporary application was removed; a configured production converter is still required. The temporary PostgreSQL server was stopped after all fixtures were cleaned; the pre-existing web development server was preserved.

Representative reproducible commands (use the project's Node 24 runtime):

```sh
pnpm --filter api check-types
node --experimental-vm-modules apps/api/node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand --watchman=false
# Set TEST_CONTRACT_DATABASE_URL to a fresh, explicitly named local test DB before the opt-in suites:
node --experimental-vm-modules apps/api/node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand --watchman=false contract-templates/contracts.integration.spec.ts contract-templates/signing.integration.spec.ts
# From apps/web:
./node_modules/.bin/vitest run
```

The subsequent licence-only revision has focused regression coverage for all licence mappings, retired-field rejection, preserved CIV values, pricing, registration/import paths and form removal. Its mapping is application configuration, not a legal classification inferred from a speed value.

## Production pilot and remaining boundaries

Keep `CONTRACT_WORKFLOW_ENABLED=false` until the target converter, private storage, real SMSO/SMTP delivery, restores and staff procedures are verified. The final OTP flag defaults to false. Exact provider credentials are deployment configuration; no mock delivery fallback is enabled for signing.

Physical iOS Safari/Android Chrome/messaging-browser camera and signature checks, legal review, approved selfie/consumer/promotion notices, target-worker isolation/fonts and deployment backup/restore exercises remain human pilot steps. The code makes no qualified/advanced-signature claim.

The privileged retention/legal-hold workflow is implemented and tested with an explicit fake storage provider. Production still requires approved category policies and a qualified purge/recovery procedure against the actual private provider. Ordinary deletion remains conservative for referenced evidence. Rental receipts are recorded separately from accounting journal posting. Video media is unsupported by the raster-only upload path. A concluded agreement requires a controlled correction/addendum procedure; it cannot be silently regenerated from current source data.

See [backend operations](backend-operations.md), [retention operations](retention-operations.md), [template migration/QA](template-engine-and-migration.md), [actual renderer QA](template-render-qa-2026-10-30.md) and [private rental media](../rentals/private-media.md) for operational detail and recovery boundaries.

## Changed file inventory

The pre-existing `.gitignore` edit was preserved and is excluded from this task inventory. Tracked generated environment/theme outputs are included; ignored compilation outputs are excluded.

```text
apps/api/.env.example
apps/api/package.json
apps/api/prisma/migrations/20261030150000_rental_checkout/migration.sql
apps/api/prisma/migrations/20261030160000_contract_workflow/migration.sql
apps/api/prisma/migrations/20261030170000_handover_confirmation/migration.sql
apps/api/prisma/migrations/20261030180000_signing_invitation_delivery/migration.sql
apps/api/prisma/migrations/20261030190000_contract_conclusion_context/migration.sql
apps/api/prisma/migrations/20261030200000_speed_configuration_null_constraints/migration.sql
apps/api/prisma/migrations/20261030210000_contract_retention/migration.sql
apps/api/prisma/migrations/20261030220000_retention_deletion_lease/migration.sql
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/audit/audit.types.ts
apps/api/src/config/env.ts
apps/api/src/contract-templates/assets/combined-v2-source.docx
apps/api/src/contract-templates/assets/gdpr-notice.docx
apps/api/src/contract-templates/assets/migration-report.json
apps/api/src/contract-templates/assets/rental-agreement.docx
apps/api/src/contract-templates/assets/technical-handover.docx
apps/api/src/contract-templates/branding.service.spec.ts
apps/api/src/contract-templates/contract-data.ts
apps/api/src/contract-templates/contract-support.ts
apps/api/src/contract-templates/contracts.controller.ts
apps/api/src/contract-templates/contracts.integration.spec.ts
apps/api/src/contract-templates/contracts.module.ts
apps/api/src/contract-templates/delivery.service.ts
apps/api/src/contract-templates/engine/docx-engine.spec.ts
apps/api/src/contract-templates/engine/docx-engine.ts
apps/api/src/contract-templates/engine/image-slots.ts
apps/api/src/contract-templates/engine/ooxml.ts
apps/api/src/contract-templates/engine/pdf-converter.ts
apps/api/src/contract-templates/engine/preview-values.ts
apps/api/src/contract-templates/engine/registry.ts
apps/api/src/contract-templates/engine/zip.ts
apps/api/src/contract-templates/package-integrity.ts
apps/api/src/contract-templates/packages.service.spec.ts
apps/api/src/contract-templates/packages.service.ts
apps/api/src/contract-templates/retention.controller.ts
apps/api/src/contract-templates/retention.service.ts
apps/api/src/contract-templates/signing-acceptance.ts
apps/api/src/contract-templates/signing-images.ts
apps/api/src/contract-templates/signing.controller.ts
apps/api/src/contract-templates/signing.integration.spec.ts
apps/api/src/contract-templates/signing.service.spec.ts
apps/api/src/contract-templates/signing.service.ts
apps/api/src/contract-templates/templates.service.spec.ts
apps/api/src/contract-templates/templates.service.ts
apps/api/src/image-storage/image-storage.service.spec.ts
apps/api/src/image-storage/image-storage.service.ts
apps/api/src/image-storage/image-storage.types.ts
apps/api/src/mailer/impls/smtp-mailer.service.ts
apps/api/src/mailer/mailer.service.ts
apps/api/src/persons/person-document-contract-evidence.ts
apps/api/src/persons/persons.mapper.ts
apps/api/src/persons/persons.service.ts
apps/api/src/rentals/rental-domain.spec.ts
apps/api/src/rentals/rental-inspection.ts
apps/api/src/rentals/rental-media.controller.ts
apps/api/src/rentals/rental-media.service.spec.ts
apps/api/src/rentals/rental-media.service.ts
apps/api/src/rentals/rentals.controller.ts
apps/api/src/rentals/rentals.module.ts
apps/api/src/rentals/rentals.service.spec.ts
apps/api/src/rentals/rentals.service.ts
apps/api/src/scooters/scooter-contract-evidence.ts
apps/api/src/scooters/scooter-documents.service.spec.ts
apps/api/src/scooters/scooter-documents.service.ts
apps/api/src/scooters/scooter-speed-audit.spec.ts
apps/api/src/scooters/scooter-speed-audit.ts
apps/api/src/scooters/scooters.mapper.ts
apps/api/src/scooters/scooters.service.ts
apps/web/src/app/[locale]/company/contract-templates/_components/ContractTemplatesWorkspace.test.tsx
apps/web/src/app/[locale]/company/contract-templates/_components/ContractTemplatesWorkspace.tsx
apps/web/src/app/[locale]/company/contract-templates/page.tsx
apps/web/src/app/[locale]/layout.tsx
apps/web/src/app/[locale]/persons/_components/PersonCreateForm.test.tsx
apps/web/src/app/[locale]/persons/_components/PersonCreateForm/PersonalSection.tsx
apps/web/src/app/[locale]/persons/_components/PersonCreateForm/input.ts
apps/web/src/app/[locale]/persons/_components/PersonCreateForm/types.ts
apps/web/src/app/[locale]/persons/_components/PersonDetailPage/helpers.ts
apps/web/src/app/[locale]/persons/_components/PersonDetailPage/types.ts
apps/web/src/app/[locale]/persons/_components/PersonEditForm.tsx
apps/web/src/app/[locale]/persons/_components/person-edit-schema.ts
apps/web/src/app/[locale]/rentals/_components/RentalCheckout.test.tsx
apps/web/src/app/[locale]/rentals/_components/RentalCheckout.tsx
apps/web/src/app/[locale]/rentals/_components/RentalCreateWizard.test.tsx
apps/web/src/app/[locale]/rentals/_components/RentalCreateWizard.tsx
apps/web/src/app/[locale]/rentals/_components/RentalInspectionMedia.tsx
apps/web/src/app/[locale]/rentals/_components/RentalListItem.tsx
apps/web/src/app/[locale]/rentals/_components/RentalsWorkspace.tsx
apps/web/src/app/[locale]/rentals/_components/useRentalDraft.ts
apps/web/src/app/[locale]/rentals/_lib/rental-draft.test.ts
apps/web/src/app/[locale]/rentals/_lib/rental-draft.ts
apps/web/src/app/[locale]/roles/_components/permission-editor.tsx
apps/web/src/app/[locale]/roles/_lib/permission-presentation.ts
apps/web/src/app/[locale]/scooters/_components/ScooterCreateFields.tsx
apps/web/src/app/[locale]/scooters/_components/ScooterEditForm.test.tsx
apps/web/src/app/[locale]/scooters/_components/ScooterEditor.tsx
apps/web/src/app/[locale]/scooters/_components/ScooterEditorFields.tsx
apps/web/src/app/[locale]/scooters/_components/ScooterSpeedCorrectionReason.tsx
apps/web/src/app/[locale]/scooters/_components/scooter-editor-messages.ts
apps/web/src/app/[locale]/scooters/_components/scooter-editor-schema.test.ts
apps/web/src/app/[locale]/scooters/_components/scooter-editor-schema.ts
apps/web/src/app/[locale]/scooters/_components/scooter-wizard.ts
apps/web/src/app/[locale]/signing/_components/SigningWorkspace.test.tsx
apps/web/src/app/[locale]/signing/_components/SigningWorkspace.tsx
apps/web/src/app/[locale]/signing/page.tsx
apps/web/src/app/api/signing/[...path]/route.test.ts
apps/web/src/app/api/signing/[...path]/route.ts
apps/web/src/components/AppShell.test.tsx
apps/web/src/components/AppShell.tsx
apps/web/src/components/SignatureCapture.test.tsx
apps/web/src/components/auth/SessionProvider.tsx
apps/web/src/i18n/paths.ts
apps/web/src/lib/README.md
apps/web/src/lib/access.ts
apps/web/src/lib/auth-server.test.ts
apps/web/src/lib/auth-server.ts
apps/web/src/lib/contract-download.ts
apps/web/src/proxy.ts
docs/auth/sessions-and-audit.md
docs/contracts/backend-operations.md
docs/contracts/implementation-report.md
docs/contracts/retention-operations.md
docs/contracts/template-engine-and-migration.md
docs/contracts/template-render-qa-2026-10-30.json
docs/contracts/template-render-qa-2026-10-30.md
docs/rentals/implementation-audit.md
docs/rentals/private-media.md
packages/api-shared/src/v1/access/index.ts
packages/api-shared/src/v1/contracts/index.ts
packages/api-shared/src/v1/contracts/retention.ts
packages/api-shared/src/v1/index.ts
packages/api-shared/src/v1/persons/persons.schemas.ts
packages/api-shared/src/v1/rentals/checkout.ts
packages/api-shared/src/v1/rentals/index.ts
packages/api-shared/src/v1/rentals/media.ts
packages/api-shared/src/v1/scooters/index.ts
packages/api-shared/src/v1/scooters/scooter-speed.ts
packages/api-shared/src/v1/scooters/scooters.schemas.ts
packages/i18n/src/catalogs/access.ts
packages/i18n/src/catalogs/app-shell.ts
packages/i18n/src/catalogs/contracts.ts
packages/i18n/src/catalogs/persons.ts
packages/i18n/src/catalogs/scooters.ts
packages/i18n/src/messages.ts
packages/theme/generated/tokens.css
packages/theme/generated/tokens.native.ts
packages/theme/src/tokens/motion.ts
packages/ui/src/components/pdf-preview.stories.tsx
packages/ui/src/components/pdf-preview.tsx
packages/ui/src/components/signature-capture.stories.tsx
packages/ui/src/components/signature-capture.tsx
packages/ui/src/hooks/use-capture-camera.ts
pnpm-lock.yaml
scripts/migrate-contract-templates.ts
```
