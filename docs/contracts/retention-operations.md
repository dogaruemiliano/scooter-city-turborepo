# Privileged contract evidence retention

Retention is an explicit administration workflow under `/v1/contracts/retention`. It is not a scheduled blanket deletion task. The implementation has no default approved legal period and does not execute because a company setting happens to contain a duration. All implementation tests used synthetic database fixtures and a fake object provider; no retained application objects were purged.

## Policy and authority

Grant `evidence.retention.manage` only to staff responsible for policy preparation, holds and assessment. `evidence.retention.purge` additionally permits policy approval, hold release, manifest approval and execution. The service checks permissions and company scope itself as well as the route metadata. Reads, preparation, approvals, hold changes, item fences and outcomes are audited.

Create a separate immutable policy version for each category: `contract`, `selfie`, `identity`, `audit` and `media`. Supply a legally reviewed number of days after rental closure and a written legal basis. A different authorized account must approve the version with an explicit statement. The latest approved version applies; a newer draft does not activate itself. Policy approval is blocked while a deletion has an in-flight or uncertain outcome.

The closure anchor is the actual return time for a returned rental, or cancellation time for a cancelled rental. Reserved and active rentals are ineligible. Audit events must also have reached their own retention age. The code supplies no minor representation exception: issuance and handover require an adult lessee under the current policy, or remain blocked pending an approved representation procedure implemented separately.

## Assessment and approval

1. `POST /policies` creates a draft with `category`, `daysAfterRentalClosed` and `legalBasis`. `POST /policies/:id/approve` takes `statement` from a different account.
2. `POST /holds` accepts a package or asset scope, or neither for the company, optionally narrowed to a category. It requires `reason` and `legalBasis`. A hold is effective immediately under the company mutex. `POST /holds/:id/release` requires purge authority and a recorded reason.
3. `POST /previews` takes explicit `packageIds` and `categories`. It writes a preview manifest and audit event but does not change source metadata or storage. Review every subject, original SHA-256, approved policy version, eligibility time and blocker. Assessments are bounded to 100 packages and 500 items; use smaller batches if the budget is exceeded.
4. `GET /batches/:id` returns the manifest, its hash and durable item outcomes. A different authorized account approves an unexpired preview through `POST /batches/:id/approve` with the exact `manifestHash` and approval `statement`. Any blocker prevents approval. A preview expires after 24 hours.
5. `POST /batches/:id/execute` takes the exact `manifestHash`. There is no execution based on package IDs alone. Execution rechecks policies, scope, source hashes, closure, elapsed periods, holds and current references before each subject. `POST /batches/:id/retry` resumes the same approved manifest and its recorded outcomes. An already started batch may resume after preview expiry; its approved scope cannot change.

## Protected live data and retained evidence

A pending or concluded package outside the explicit batch blocks deletion of a shared object. Current identity photographs, avatars, scooter originals and customer copies, ordinary gallery/problem files, active rental media, current company branding and template sources/previews also block deletion. Package creation and branding changes share the company mutex with retention; ordinary reference writers reject the asset's deletion fence. Unknown legacy snapshots fail closed. General identity records, vehicle documents, templates, accounting rows and authentication audit records are not broadly cascaded or deleted by this workflow.

Contract retention covers presented/final files and signature PNGs plus contract-specific snapshot metadata. Selfies, pinned identity photographs and rental inspection media each need their own approved category. Live identity photographs and vehicle copies remain available through their normal records until their independent lifecycle allows removal. The media category covers pinned rental evidence, not a scooter's entire photo library.

Until the contract category is legally eligible, its signed files and evidence remain protected. After an approved purge, the package retains its original subject and manifest hashes, document presented/final digests, the approved retention manifest and per-item outcome history. A versioned tombstone replaces contract-specific personal snapshot fields; other categories' still-retained references remain intact until separately eligible. Signature identity/acceptance text and guest-session contact data are redacted only with the contract category. Finance receipts are preserved. Audit-category removal redacts scoped workflow metadata, actor/IP/user-agent data and stores the original event digest while retaining the event row, type, target and server time. Retention actions themselves remain accountable.

## Provider failure and recovery

Each item has a unique worker token, bounded lease, attempt count and durable outcome. The transaction first writes an access fence on the asset. Private downloads and new ordinary references then fail. Storage deletion runs outside the database transaction; only the configured matching S3 provider and bucket are accepted. Version-aware deletion removes object versions and delete markers using the existing bounded cleanup implementation. A changed provider or bucket fails explicitly.

The service records the provider acknowledgement before finalizing metadata. Only after deletion succeeds does it mark `retentionPurgedAt`, redact category metadata and complete the item. A provider error or interrupted accounting leaves the fence and a retryable outcome. Retrying rechecks the same manifest and idempotently deletes surviving versions before accounting. A competing worker cannot clear another worker's live lease or claim its completion. A completed batch is idempotent.

An accepted hold before an item is claimed blocks it, including holds added after manifest approval. Once deletion is in flight or its outcome is uncertain, the hold endpoint refuses to assert protection for those subjects: resolve the recorded provider outcome first and escalate immediately through the organization's incident/legal procedure. A hold cannot restore bytes already lawfully purged. Do not clear a fence manually to make a failed job appear successful. Inspect item errors, provider configuration and version inventory, then use the authorized retry path. Preserve database/object backups according to their separately approved retention and restore procedures.

Before deployment, rehearse approval, late holds, provider failure, retry and restoration with synthetic objects in an isolated bucket. Real production execution requires the organization's legal approval of each category period and named operators; migration deployment alone grants no deletion approval.
