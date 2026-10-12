# Background scooter document extraction

Scooter extraction uses durable database jobs. The browser still uploads directly to private S3. A validation Lambda checks the bytes and writes an immutable analysis snapshot; OpenAI fetches that snapshot using a signed URL. The API exchanges metadata and bounded JSON responses, without downloading or rendering the document.

The feature defaults to disabled. Deploy the validation infrastructure and configure the provider webhook before enabling it. Manual scooter entry remains available. Person and expense extraction use their existing independent paths.

## Local development

To use real OpenAI extraction locally without deploying Lambda or exposing a public webhook, add these settings to `apps/api/.env` and restart the API:

```dotenv
SCOOTER_DOCUMENT_EXTRACTION_DRIVER=openai
SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED=true
SCOOTER_DOCUMENT_VALIDATION_DRIVER=local
IMAGE_STORAGE_MAX_BYTES=15728640
```

Keep the existing server-side OpenAI key and private S3 configuration. The local executor runs the same validator in a separate Node process with a 60-second deadline and bounded heap; document bytes and PDF parsing stay outside the API process. It inherits AWS credentials only and must be able to read originals and write/read the dedicated temporary prefix. The normal job/resource ledger tracks these snapshots. Build/start through the existing API commands so the worker entry point is compiled alongside the API.

The dispatcher polls real OpenAI background responses, so a webhook is optional in development. If an accepted submission loses its response ID, polling cannot discover that ID: the existing uncertainty record and capacity reservation remain until an optional webhook or operator reconciliation resolves it. Local validation is rejected in production, where Lambda and webhook configuration remain required.

## Deployment

1. Apply the additive `20261012180000_scooter_document_jobs` migration through the existing release phase. It adds editor sessions, jobs, tracked resources, a provider-event inbox and reconciliation state, plus draft-upload lifecycle fields. Existing uploads remain supported by their original cleanup flow.
2. Build and deploy the validation function using [the infrastructure instructions](../../infrastructure/document-validation/README.md). The function must use the same S3 bucket, prefix, region, maximum file size and KMS key as the API. Grant the API invocation and scoped S3 cleanup permissions described there.
3. Configure an OpenAI project webhook at `https://api.scooter-city.ro/v1/webhooks/openai/scooter-documents` for terminal response events (completed, failed, incomplete and cancellation where available). The receiver verifies the raw body using the signing secret, stores the event, and acknowledges promptly. The dispatcher retrieves and normalizes results independently of browser polling.
4. Set API environment variables:

   ```dotenv
   SCOOTER_DOCUMENT_EXTRACTION_DRIVER=openai
   SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY=<server-side project key>
   SCOOTER_DOCUMENT_EXTRACTION_MODEL=gpt-5.4-2026-03-05
   SCOOTER_DOCUMENT_VALIDATION_DRIVER=lambda
   SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME=<deployed function name or ARN>
   SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET=<project webhook signing secret>
   SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED=true
   IMAGE_STORAGE_MAX_BYTES=15728640
   ```

5. Deploy the matching browser build. Verify synthetic image and PDF extraction, cancellation, final save, and abandoned-draft cleanup in staging before production enablement. Compare source-only PDF accuracy with the former crop-based extraction on representative authorized documents.

Documents support up to 15 MiB (15,728,640 bytes) each. When upgrading an existing deployment, raise any explicit `IMAGE_STORAGE_MAX_BYTES` setting and the validation stack's `MaxDocumentBytes` parameter to `15728640`; an existing lower override still restricts uploads or analysis.

The old synchronous `POST /v1/scooters/document-extraction` endpoint is retired. Old browser tabs should reload. The new flow has no automatic fallback to rendering on the web dyno. The old provider timeout setting does not govern background jobs.

## HTTP and job lifecycle

- `POST /v1/scooters/document-editor-sessions` creates a session without creating a scooter.
- Upload and scooter-save requests carry that session ID. The browser gets a signed PUT only after the upload and resource ownership are recorded.
- `POST /v1/scooters/document-extraction-jobs` takes the existing source reference, session ID and stable attempt ID; it returns `202` with an application job ID.
- `GET /v1/scooters/document-extraction-jobs/:id` returns progress or the existing review-required analysis payload.
- `POST /v1/scooters/document-extraction-jobs/:id/cancel` records durable cancellation intent.
- `POST /v1/scooters/document-editor-sessions/:id/discard` closes an abandoned session and schedules cleanup.

Browser mutations retain the existing authentication, permissions and CSRF header. Source URLs and OpenAI response IDs are not exposed to the browser. New work is admitted with database coordination, initially four active jobs globally and two per user. Jobs have a five-minute deadline; draft sessions retain the existing 24-hour expiry. Lambda validation has its own bounded execution window. OpenAI control requests have 15-second deadlines.

Transport failure while polling resumes the same job. Retrying an ambiguous start uses its original attempt ID. If OpenAI may have accepted a request but the response ID was lost, the attempt remains marked as uncertain and is reconciled using provider events rather than automatically resubmitted.

Unresolved submissions continue to occupy admission capacity after their local deadline. Investigate them through the provider-event inbox and OpenAI request records; do not clear uncertainty merely to free a slot. The four-job limit bounds active application jobs, not a strict count of remote responses: known remote work can continue briefly after local cancellation or expiry until the cleanup pass acknowledges cancellation.

The provider uses `background: true` and `store: false`. Background execution still entails temporary provider storage; retrieve completed results promptly and do not interpret `store: false` as zero retention. See the official [background-mode documentation](https://developers.openai.com/api/docs/guides/background). The dispatcher polls as a fallback to webhooks. API downtime longer than provider response availability can cause a controlled extraction failure; it does not justify applying partial or invented values.

## Abandoned drafts and orphan resources

The database is authoritative even when the browser closes without sending a cancellation request:

- Original uploads are tracked before the signed PUT is returned. Unclaimed originals expire; selected originals become permanent through the same transaction that saves the scooter and document records.
- Temporary validation snapshots are registered before Lambda invocation. They are cleaned after analysis even when the scooter is saved.
- Known provider responses are tracked for cancellation/deletion. Unknown submissions and uncorrelated provider events remain visible for reconciliation.
- Cleanup failures retain resource rows with attempts and safe error codes. Successful deletion retains a bounded non-content audit record.
- Late writes are covered by write deadlines, tombstones and S3 reconciliation. An upload can finish after navigation, and a cancelled Lambda invocation can still finish writing; neither event should create an untracked object.

Save and discard compete for the same session lock. If discard wins, the session cannot subsequently be saved. If save wins, cleanup retains selected original documents; unused uploads and temporary artifacts remain eligible for removal. Saved-document analysis never grants cleanup permission to delete the saved source.

Do not configure age-based S3 expiry on the original `scooter-documents` prefix. Saved attachments keep the same storage key. A lifecycle rule may apply only to the dedicated `extraction-temporary` prefix as a secondary safeguard. Version-aware cleanup requires the documented S3 version permissions.

Monitor the cleanup log's resource counts, pending failures and unresolved submissions, alongside expired jobs and oldest pending timestamps in `ScooterDocumentResource` and `ScooterDocumentProviderEvent`. Investigate sustained backlog or repeated permission failures. Keep reconciliation and cleanup running when new submissions are disabled; disabling the feature must not strand old work.

## Verification

Use synthetic inputs for automated/provider smoke tests. Existing source-reader tests cover signatures, checksums, actual PDF page limits and passwordless encryption fidelity. Provider tests check URL requests, bounded output, cancellation, refusal handling and secret-safe errors. Lifecycle tests exercise duplicate starts, save/discard exclusion, late completion, failed cleanup and retained originals. Browser tests retain VIN review, source-change guards and manual edit behavior.

The real database race suite is `apps/api/src/scooter-document-jobs/scooter-document-jobs.integration.spec.ts`. Apply the repository migrations to a disposable local PostgreSQL database and set `TEST_DOCUMENT_JOBS_DATABASE_URL` to its connection URL when running Jest. The suite does not fall back to the application database. It covers cancellation/discard/expiry during an uncertain submission, webhook correlation before a timed-out acknowledgement, duplicate starts, save/discard exclusion, cleanup retries, saved-source promotion and recovery after a lost save response.

Production activation additionally requires deployed AWS resources, configured OpenAI events and a live staging check. Local unit tests cannot establish provider accuracy or production memory usage. No private sample document, signed URL, API credential or raw provider response should be logged or committed.
