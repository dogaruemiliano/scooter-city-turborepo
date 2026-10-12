# Direct S3 document analysis and abandoned-draft cleanup

Implementation plan — 2026-10-12. This document proposes changes; it does not change runtime behavior or infrastructure.

Implementation status: the application flow, migration, isolated validation package and orphan lifecycle are implemented. See the [deployment runbook](../scooters/background-document-extraction.md) for configuration and activation. AWS/OpenAI staging verification, extraction-accuracy comparison and production memory measurements remain deployment gates; the feature defaults to disabled.

Move scooter document bytes and PDF processing off the Heroku web dyno. Keep browser uploads going directly to private S3, let OpenAI retrieve validated documents through temporary signed URLs, and return extraction results through durable jobs. Track resources even when a user closes the editor without creating a scooter.

1. **Establish the target flow and verify it with synthetic documents.**

   ```mermaid
   sequenceDiagram
     participant Browser
     participant API as NestJS API
     participant DB as PostgreSQL
     participant S3 as Private S3
     participant Validator as Validation Lambda
     participant AI as OpenAI
     Browser->>API: Create editor session and request upload
     API->>DB: Track draft upload before returning signed PUT
     API-->>Browser: Signed PUT and upload token
     Browser->>S3: Upload document bytes
     Browser->>API: Start extraction with source reference and attempt ID
     API->>DB: Persist job and pending work
     API-->>Browser: 202 with application job ID
     Note over API,DB: Dispatcher leases durable work independently of browser requests
     API->>Validator: Validate source; prepare only when needed
     Validator->>S3: Read source and write tracked temporary output
     Validator-->>API: Verified metadata and object reference
     API->>DB: Persist validation result
     API->>AI: Signed GET URL, schema, background=true
     API->>DB: Record provider response ID
     AI->>S3: Fetch document bytes directly
     AI-->>API: Completion webhook
     API->>AI: Retrieve bounded result
     API->>DB: Store normalized result and schedule resource cleanup
     Browser->>API: Poll application job
     API-->>Browser: Status or review-required result
   ```

   Preserve the configured `gpt-5.4-2026-03-05` model initially. Verify signed image/PDF URLs, background creation/retrieval/cancellation, strict structured output, webhook correlation and the configured account's data controls in a small integration spike before implementing the full rollout. Images use `input_image.image_url`; PDFs use `input_file.file_url`. These input methods are documented in the official [image guide](https://developers.openai.com/api/docs/guides/images-vision) and [file guide](https://developers.openai.com/api/docs/guides/file-inputs).

   Use `background: true` with `store: false`. OpenAI documents temporary response storage of roughly ten minutes for background polling; persist completed results promptly without depending on an open browser. Treat a response that has already expired as a recoverable application failure, never invent a result. [Background mode](https://developers.openai.com/api/docs/guides/background)

   Scope this change to scooter extraction. Keep person/receipt extraction contracts separate. No document content or OpenAI credentials go into browser-to-OpenAI calls.

2. **Add durable ownership and resource tracking before creating external work.**

   Reuse `DraftUpload`: scooter uploads already create this row before returning a signed PUT, expire after 24 hours, and are claimed transactionally during final save. Add a server-issued editor-session identity to group uploads and jobs for one create/edit flow. Creating the session must not create a scooter. Existing records without a session remain eligible for current cleanup.

   The implementation needs these conceptual records; exact Prisma schema and migrations follow the project's Prisma 7 documentation verification rule:

   | Record                       | Required information                                                                                                                                                                                                                                           |
   | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Editor session               | Owner, open/saved/discarded/expired state, creation/expiry, optional resulting scooter, cleanup status                                                                                                                                                         |
   | Extraction job               | Owner/session, draft-upload or saved-document reference, immutable source fingerprint, browser source ID, unique attempt ID, model/prompt version, state, deadlines, worker lease, provider response ID, cancellation intent, safe error and normalized result |
   | External resource            | Owning job/session, resource kind, bucket/key/version or provider ID, reserved/created/cleanup-pending/deleted state, last possible write time, cleanup lease, attempts, next retry, safe failure code and deletion timestamp                                  |
   | Pending work / webhook inbox | Durable operation identity, processing lease, retry time and deduplication identity; can share the job infrastructure where appropriate                                                                                                                        |

   Persist intended temporary object keys before invoking validation or writing to S3. Persist a provider submission attempt before calling OpenAI, then attach its response ID immediately. Include opaque job/attempt identifiers in provider metadata for reconciliation; exclude personal data.

   Keep source identity independent of renewed upload tokens. Idempotency is scoped to owner, attempt and source fingerprint. Concurrent requests for one attempt return the same job; a deliberate retry after terminal failure gets a new attempt. Start/status/cancel authorization uses application job ownership and current source access, not knowledge of an OpenAI response ID.

   An external create call and a DB transaction cannot be made atomic. If OpenAI accepted a request but its response ID was lost, mark the attempt `submission_unknown`, preserve the record, and reconcile through verified provider events. Do not blindly resubmit paid work or promise exactly-once execution without a verified provider guarantee. Unresolved attempts remain visible for operational follow-up.

3. **Move trusted validation off the web dyno and add signed GET support.**

   `scooter-document-source-reader.ts` currently verifies actual bytes, SHA-256, MIME signatures, PDF structure and the actual 1–10 page limit. It also prepares encrypted PDFs that open with an empty password. S3 HEAD metadata or browser-reported page counts cannot replace these checks.

   Recommended deployment: a small AWS Lambda dedicated to validation/preparation, with bounded memory, execution time and concurrency. A leased database dispatcher invokes it independently of HTTP requests; only object references and small metadata cross Heroku. Lambda needs narrowly scoped S3 access, not database access or an OpenAI key. Reserve its output keys first and validate its returned metadata. Infrastructure provisioning and runtime packaging are implementation deliverables because this repository does not currently contain a Lambda deployment.

   Preserve the existing size, checksum, signature, malformed-PDF, actual-page-count and password handling tests in this isolated task. Ordinary documents remain byte-identical. Empty-password PDFs get a private prepared copy; originals remain untouched. PDFs requiring a nonempty opening password retain their explicit error. Keep the existing limits on prepared output.

   Add signed GET to `ImageStorageService` and extend its currently PUT-only presigner abstraction. Continue resolving storage exclusively from trusted draft/saved-document references. Compare actual object size/type and available S3 SHA-256; older server-uploaded assets may lack an S3 checksum and must receive byte validation in Lambda. Do not use ETag as a SHA-256 substitute.

   Bind validation and delivery to the same immutable bytes. Prefer a pinned S3 version where available; otherwise use a tracked immutable validation snapshot under a service-only temporary prefix. Validate a snapshot before signing its URL. Do not assume a reusable PUT URL makes an object immutable. Generate GET URLs immediately before submission, with a proposed ten-minute lifetime bounded by AWS credential expiry. Keep URLs out of client responses, logs and stored provider payloads. AWS documents the relevant [HEAD checksum behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html) and [signed URL lifetime](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

   Remove PDF rendering, crop generation and document base64/JSON expansion from the Heroku extraction path. OpenAI receives the complete source/prepared PDF and performs page processing. Compare accuracy with the existing crops before enabling this for production; any necessary detail-image fallback must also run outside the web dyno and register its outputs for cleanup.

4. **Implement short HTTP endpoints and a durable extraction lifecycle.**

   Add `POST /v1/scooters/document-extraction-jobs` returning `202`, `GET /v1/scooters/document-extraction-jobs/:id`, and `POST /v1/scooters/document-extraction-jobs/:id/cancel`. Start accepts the existing source shape plus session/attempt identity. Completed status includes the existing `ScooterDocumentAnalysis` payload with `reviewRequired: true`. Keep API keys, source URLs and provider IDs server-side.

   Use explicit internal states for queued, validating, submitting, submission-unknown, running, completed, failed, cancelled and expired. Cancellation intent is durable and separate from provider acknowledgement. Late events cannot move a cancelled/expired job back to completed. Fetching status does not create provider work.

   Keep the existing normalization and VIN validation logic; separate it from transport so it can validate retrieved background results. Retain structured output, response-size bounds, refusal/error mapping and existing model options. Replace the single provider `analyze(bytes)` operation with start/retrieve/cancel operations on a verified object reference.

   Use database leases and conditional state transitions for multi-dyno safety. Recover queued work and stale leases after restart. Start with two active jobs per user and four globally, independently cap Lambda validation concurrency, and tune against measurements. Database counts/reservations must be atomic; an in-memory counter is insufficient.

   Proposed timing defaults: application job deadline five minutes, individual provider HTTP calls bounded well below Heroku's 30-second limit, dispatcher cadence five seconds, browser polling from one second to five seconds with jitter. Keep source leases bounded by the job deadline and coordinate them with draft expiry. Reject starts that cannot obtain a sufficient source lifetime. Lease expiry alone is not proof that a Lambda invocation stopped; cleanup must also respect its maximum execution/write window.

   Receive signed OpenAI terminal events into a durable inbox, acknowledge promptly, and retrieve/process the result through the dispatcher. Verify raw-body signatures and deduplicate events. Add periodic polling as reconciliation, including when the browser has closed; repeated browser polls read application state instead of multiplying provider requests. [Official webhook guidance](https://developers.openai.com/api/docs/guides/webhooks)

   Preserve custom authentication and `X-Requested-With: fetch` for browser mutations. The provider webhook uses its own signature verification and a narrowly scoped route exemption, without weakening protection on the rest of the API.

5. **Make abandonment and orphan cleanup part of the initial release.**

   Tab-close events are best effort only. Correct cleanup must work when the browser disappears, the API restarts, a response is lost, or the provider finishes late.

   | Resource                                          | When the editor is abandoned                                                           | When the scooter is saved                                                                        |
   | ------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
   | Original draft upload                             | Delete after discard/expiry and all possible writes/leases are settled                 | Claim selected uploads inside the scooter-save transaction; retain their original S3 objects     |
   | Unselected/replaced upload                        | Keep tracked, then delete when safe                                                    | Still clean it up; saving the session does not protect unused files                              |
   | Validation snapshot, prepared PDF, optional crops | Cancel pending work and delete temporary objects                                       | Delete once analysis no longer needs them; they are never permanent attachments                  |
   | OpenAI background response                        | Cancel known active responses; request deletion where supported and record the outcome | Retrieve/normalize once, then request cleanup; retain only needed application evidence           |
   | Unsaved extracted result                          | Clear content on session discard/expiry                                                | Persist accepted per-document evidence through the existing save path; expire the temporary copy |
   | Resource/job ledger                               | Retain safe cleanup state and unresolved failures                                      | Retain safe cleanup state; never cascade away pending external cleanup                           |

   Extend the current cleanup service into shared upload/resource lifecycle code while preserving its existing person and expense behavior. Today it runs hourly, processes 100 rows and retries stale cleanup claims after 15 minutes. Add a frequent job/resource sweep (proposed every five minutes), bounded batches and retry backoff; keep the original 24-hour abandoned-upload expiry as the default. Add alerts for cleanup backlog, stale leases and oldest unresolved failure.

   On explicit discard, mark the session closed and record cancellation/cleanup intents immediately. On silent abandonment, expire it server-side. Completed results may remain available until that expiry; this does not require implementing full form restoration after reload. Save must conditionally transition an owner-matching, open, unexpired session to saved in the same transaction that claims selected uploads and persists the scooter/evidence. Discard/expiry and save must have one atomic winner; saving cannot reopen a closed session. Rebind selected draft-backed jobs to their resulting scooter documents in that transaction so authorization and cleanup recognize their permanent originals. Rollback leaves resources tracked and unclaimed.

   Dispatch also checks session state while acquiring its lease. Discard prevents new dispatch; if a leased submission races with discard, persist any returned provider ID and honor the already-recorded cancellation intent. Keep pending external cleanup independent of session status and foreign-key deletion.

   Reuse the existing claim-versus-cleanup exclusion (`claimedAt` and `cleanupStartedAt`) and extend it to active validation/extraction leases. Acquire ownership atomically, perform remote cleanup outside the transaction, and record success afterward. Missing objects/expired responses are terminal cleanup outcomes only when verified; authorization or network failures remain pending. Do not delete ledger rows on failed external cleanup. Proposed retention: strip result content promptly and retain a minimal non-content cleanup audit for 30 days; retain unresolved resource identifiers until resolved.

   Handle late writers explicitly: record signed PUT expiry and a bounded in-flight-upload grace period. Discard cannot immediately erase the upload ledger, because a previously issued PUT may still complete. Retain a tombstone and reconcile after the last possible write; do likewise for timed-out or cancelled Lambda invocations. A late webhook records any newly discovered response ID and schedules cleanup without restoring the session.

   Add an S3 reconciliation job for aged unreferenced objects and objects recreated after cleanup. Reconcile against current database ownership and tombstones before deletion. Use an expiry lifecycle rule only on a dedicated temporary-analysis prefix, as a secondary safeguard. Never apply blanket age-based deletion to the existing `scooter-documents` prefix: saved attachments retain those same keys. Account for versions and delete markers if bucket versioning is enabled.

   A GET URL expiring only revokes that URL; it does not delete the object or stop an already fetched analysis. Browser cancellation, source deletion and provider cancellation each require separate tracked actions. Do not claim provider deletion erases all retention or refunds already consumed work.

6. **Adapt the browser without changing document review semantics.**

   Keep uploads direct to S3. Create/reuse a server editor session before the first upload and send its identity with uploads and analysis attempts. Update `useScooterDocumentAnalysis.ts` to start, poll and consume terminal results while retaining its public `run()` behavior.

   Preserve two concurrent document workflows, generation/source guards on every response, caching independent of token renewal, CIV precedence, failed-only retries and manual VIN corrections. A transient polling failure resumes the same job. A new paid attempt requires terminal failure or an explicit fresh retry. Keep manual edits and deliberate field clears intact when results arrive.

   On removal, replacement, permission loss, explicit cancellation or navigation, stop local polling immediately and send best-effort server cancellation with an independent request signal. Stable attempt IDs let the server find work even if the initial POST response was lost. Server expiry handles cases where no cancellation request arrives.

   Show preparing/queued/analyzing states using existing theme tokens and localized copy. Preserve required VIN review and manual-entry fallback. Keep feature code and tests in the scooter route's private folders.

7. **Implement and release in dependency order.**

   | Order | Main files / responsibility                                                                                                                                                        |
   | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | A     | Verify live provider contract and compare synthetic source-only PDF extraction; document infrastructure settings and retention assumptions                                         |
   | B     | `apps/api/prisma/schema.prisma` and additive migration: session/job/resource ownership, leases and durable pending work; verify current Prisma 7 docs before writing               |
   | C     | `apps/api/src/image-storage/`, `scooters/scooter-documents.service.ts`, and shared cleanup module: signed GET, identity/snapshot checks, final-save coordination and orphan ledger |
   | D     | New isolated validation deployment; port `scooter-document-source-reader.ts` and its fidelity/validation tests; reserve temporary outputs before dispatch                          |
   | E     | `apps/api/src/scooter-document-extraction/`, `scooters/scooter-document-analysis.service.ts`, controller and config: durable orchestration, URL provider, webhooks and cleanup     |
   | F     | `packages/api-shared/src/v1/scooters/scooter-document-analysis.schemas.ts` and `scooters.constants.ts`: additive start/status/cancel contracts and generated OpenAPI               |
   | G     | Scooter editor upload/analysis hooks, status UI and `packages/i18n/src/catalogs/scooters.ts`: session binding and asynchronous UX                                                  |
   | H     | Stage validation, feature-flag rollout, metrics and documentation; retire the synchronous extraction route after the browser cutover                                               |

   Read installed Next.js docs before client changes and current NestJS/Zod/Prisma docs before their implementation. Do not change the existing custom authentication architecture. Keep deployment order compatible: additive database/backend changes first, then the browser; return a controlled legacy-route error after retirement rather than leaving old tabs able to trigger expensive synchronous extraction.

   Extend tests for ownership and metadata mismatches, encrypted PDFs and exact page limits, source replacement, signed URL expiry, legacy missing checksums, cross-user job access, duplicate starts, ambiguous submissions, webhook duplication, provider response expiry, cancellation races, and worker restart recovery. Preserve existing VIN/manual-edit/import precedence regressions.

   Add explicit orphan scenarios: abandon before PUT, abandon during PUT, close after PUT, close before start returns, close during validation, close during analysis, close after completion, save concurrently with cleanup, discard followed by a late PUT/Lambda write/webhook, partial S3/provider cleanup failure, multiple cleanup instances, and successful save with unused uploads. Verify saved assets remain accessible and all temporary resources either disappear or have a visible retryable cleanup record.

   Acceptance criteria: file bytes/rendering never enter the Heroku extraction request path; start/status/cancel return promptly even when analysis takes over 30 seconds; API memory does not scale with rendered page pixels; every created resource has a tracked owner and cleanup outcome; cleanup survives browser loss and dyno restart; saved originals survive cleanup; extraction accuracy and required review behavior pass the representative document evaluation. Measure provider latency separately from request latency and track RSS, job age, duplicate submissions, cleanup backlog and temporary storage usage without logging document data or signed URLs.

   Enable in staging first, then a limited production cohort. Keep job reconciliation and cleanup running when new submissions are disabled. If accuracy or reliability regresses, pause new extraction and retain manual entry while fixing it; do not fall back automatically to heavy processing on the web dyno.
