# Contract checkout operations

This implementation extends the existing rental service, private S3 media storage, access registry, audit service, SMSO and SMTP adapters. It does not install a second authentication framework. Prisma 7.8 uses the existing generated client and PostgreSQL adapter; schema and raw-query behavior were checked against the [Prisma 7 documentation](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference) on 2026-10-30.

## Deployment and initial setup

1. Back up PostgreSQL and the private object store together. Retain bucket configuration, encryption permissions, object versions where enabled, checksums and restore credentials separately from the backup.
2. Deploy the additive migrations with the existing `apps/api` Prisma configuration. These changes mark pre-existing rentals as workflow version `0`; they do not fabricate pricing, identity approval, signatures or payment receipts.
3. Configure the company legal identity in Finance, then approved contract settings, contact details, representative account, selfie notice/version, acceptance text, retention durations and legal review statement.
4. Configure a private DOCX-to-PDF converter through `CONTRACT_RENDERER_BINARY`, private S3 access, SMSO and SMTP. Missing providers fail explicitly. The logging SMS provider is refused by the signing service because codes and invitation links must not appear in logs.
5. Import the three structurally separated source DOCX files using the template import utility, or upload them through Contract Templates. Review all validation scenarios and visible previews before approval/publication. Uploading a source is not publication.
6. Publish the exact agreement, GDPR and technical versions; construct and activate an explicit compatible set. A promotional rental additionally needs an explicitly approved promotional source/set. Synthetic preview fixtures must never become real people or rentals.
7. Keep `CONTRACT_WORKFLOW_ENABLED=false` until provider checks, staff training, legal review and device testing have been completed. Enabling it permits new issuance; existing records retain their provenance.

The ordinary source DOCX files use the versioned registry. Existing placeholders permit text edits without a deploy. A new resolver, field, image type or executable rule still requires code, tests and deployment. The template-engine guide explains supported OOXML parts and unsupported Word features.

## Operator flow

Reservations derive their commercial category from the selected required licence category and store immutable calculated terms: `none` uses the without-licence tariff; every other selection uses the with-licence tariff. Standard initial totals are 600/550 lei; 3+1 totals are 1,200/1,050 lei. Money is stored as integer bani. The one-time 300 lei deposit is independent of rental receipts and of the selected payment method.

The selected required licence category also determines application policy: `none` has a 25 km/h cap, `AM` has a 45 km/h cap, and other selections have no category-based application cap. This policy does not establish the scooter's physical limiter equipment or CIV construction speed. CIV `maxSpeedKmh` remains independent, historical physical configuration remains preserved, and the removed manual category/limiter/source/evidence/reason fields are rejected by new scooter write contracts.

Reservation dates, a 24-month agreement, the billing anchor, paid coverage and actual handover remain separate. Calendar calculations use Europe/Bucharest and survive daylight-saving changes. A late receipt covers the original owed period and does not reset the anchor. An active unreturned rental continues to block availability after its planned end.

Confirm an inspection before producing documents. Draft inspection changes do not modify the scooter. Confirmation checks the expected scooter timestamp and rental revision, saves an append-only inspection, updates only observed scooter changes and creates a blocking problem for critical findings. An unsafe inspection is saved successfully while handover remains blocked. A defective odometer's displayed number never replaces the last known mileage. Subsequent scooter changes or critical maintenance history require a current inspection.

Choose the actual conclusion context: on site, at a distance or off premises. A phone signature is always recorded as the web signing channel; it does not determine the legal conclusion context. A changed context on a reserved rental increments its revision and invalidates a pending package. A concluded agreement needs the correction/addendum procedure.

After approval and signature collection, record independently confirmed rental and deposit receipts with their actual method, amount, server-side confirmer and evidence reference. Confirm the original ID and actual authorized driver receiving the scooter at physical handover. The old handover endpoint uses the same readiness gate and cannot bypass inspection, documents, identity, contact, company signature or receipts.

## Invitations, verification and signing

An invitation URL contains its token in a fragment, not in a request query. GET requests do not exchange it. The same-origin signing BFF exchanges it through POST and stores only a restricted HttpOnly cookie. The session has a configurable absolute lifetime and inactivity limit. Each mutation requires an allowed Origin and `X-Requested-With: fetch`.

Signing OTPs are cryptographically random, HMAC-bound to session, package, exact contact and purpose, and consumed once under database locks. Resending invalidates the old code while retaining failed-attempt counts. Phone/IP quotas span sessions. The second OTP is disabled by default and its requirement is frozen into each new package.

The camera notice must be acknowledged before uploading a selfie. PNG/JPEG uploads are decoded, dimension checked and re-encoded; the service performs no face matching and makes no liveness claim. Staff review references the exact submitted selfie and identity document. Referenced identity photographs are preserved: replace the document through the controlled document flow instead of overwriting/deleting reviewed bytes.

Customers sign agreement, GDPR notice and technical annex in order, followed by a promotional addendum if applicable. Each act records the exact presented hash, signer/session, text shown, private PNG asset and server time. A real limiter needs its separate act. Each company document also needs a separate act by the snapshotted authorized representative. Customer completion, company acceptance, final PDF generation, contractual conclusion and physical handover are distinct states.

The displayed per-document acceptance and the stored evidence use the same resolver and frozen snapshot. GDPR acknowledgement is not general processing consent. Client-reported reading/scroll events remain untrusted telemetry. Reporting an error suspends the package and revokes its links/sessions until a controlled revision is issued.

## Delivery and uncertain outcomes

Invitation delivery is a durable queue with leases and `queued/sending/sent/failed/uncertain` states. An idempotency-key retry does not produce a different invitation. The server can recreate a queued token from its cryptographic nonce and server secret without storing the bearer token itself. An expired sender lease or ambiguous provider outcome becomes `uncertain`; issuing a fresh invitation revokes the previous link before another delivery attempt.

Final document delivery is a separate outbox. An SMTP acknowledgement means sent, not delivered or read. Interrupted/ambiguous delivery requires a documented provider check before retry. Notification failures do not reverse a physical handover. Explicit retry and manual recovery preserve receipts and signing evidence.

Do not rotate the OTP/HMAC secret without accounting for pending signing invitations and OTPs. Existing queued invitation hashes are checked before delivery; an incompatible key requires a new invitation rather than sending an unusable link.

## Archive, export and rollback

Published templates and presented PDFs use new private object keys. Packages pin source versions, snapshots, hashes and manifests. A new active set does not rewrite existing packages. Archive versions through the administration flow; rollback means explicitly activating a previous compatible set with an expected pointer and audited reason.

The evidence JSON endpoint exposes authorized structured metadata. The evidence ZIP endpoint additionally contains retained presented/final files, exact template sources, signature PNGs, identity evidence, branding and inspection files. It verifies object integrity and has a bounded export size; a larger archive requires an audited streamed export. Customer copies and internal evidence exports have different access rules.

For an application rollback, disable new issuance, preserve all database/object evidence, and deploy compatible application code. Do not roll back by deleting signing tables, resetting the database or replacing old object bytes. Restore database and object storage into an isolated environment, verify every referenced hash, and test authorized historical downloads before restoring service.

## Verification and remaining pilot work

### Local database connection recovery

`ECONNREFUSED` from authentication and background document jobs together indicates database connectivity, not a refresh-token rotation failure. The local project uses the existing Docker PostgreSQL service on `localhost:5434`; do not redirect it to another PostgreSQL installation or reset its volume.

Check `docker compose ps postgres` and the API's `/healthz` database indicator. If Docker Desktop itself returns `EOF`, recover the engine before restarting the service. On 30 October 2026 the stalled engine required its supported force-stop/start sequence; the existing container and volume recovered healthy. The API then returned HTTP 200 with `db.status=up`, and the eight tested additive migrations through retention deletion leases were deployed to the local development database. No seed, reset or production mutation was performed.

Automated checks cover tariffs and DST, stale/concurrent inspections, blocking defects, independent receipts, old-endpoint gates, exact package/source binding, OTP replay/concurrency, signing order, independent customer/company/limiter acts, invitation idempotence, private evidence and archive bytes. Integration tests require an explicit local `TEST_CONTRACT_DATABASE_URL`; they never fall back to the application database and remove only their own synthetic fixtures.

Production credentials, actual SMS/SMTP delivery, private object-store recovery and converter execution still need verification in the target deployment. Actual local LibreOffice rendering and visual review are recorded in [the render QA inventory](template-render-qa-2026-10-30.md). Actual iOS Safari, Android Chrome and messaging-browser camera/signature behavior requires physical devices. Legal approval of signing, selfie processing, context-dependent consumer information and promotional text remains a human pilot step.

The privileged [retention and legal-hold workflow](retention-operations.md) requires independently approved category policies, a non-destructive manifest preview and separate exact-manifest approval before execution. It protects active and shared source files, preserves original evidence digests and records durable provider-deletion retries. No real retained objects were purged during implementation. Approve the legal periods and recovery procedure before use. Video capture and accounting journal posting of rental receipts are not provided by the image-upload and receipt-confirmation paths.
