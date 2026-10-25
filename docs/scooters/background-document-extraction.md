# Background scooter document extraction

Scooter extraction uses durable database jobs. The browser still uploads directly to private S3. A validation Lambda checks the bytes and writes an immutable analysis snapshot; OpenAI fetches that snapshot using a signed URL. The API exchanges metadata and bounded JSON responses, without downloading or rendering the document.

The feature defaults to disabled. Deploy the validation infrastructure and configure the provider webhook before enabling it. Manual scooter entry remains available. Person and expense extraction use their existing independent paths.

## Batch scooter creation

The validator normalizes rotation in the temporary analysis copy of scanned PDFs. A portrait MediaBox with `/Rotate 90` becomes an explicitly landscape page with rotation zero, preserving the image streams and visible crop. PDFs with annotations retain their original appearances. The original download is untouched. Actual sideways image pixels are read in their visible orientation by the extraction prompt; metadata normalization is not a deskew or visual-orientation detector. Deploy the updated validation Lambda as well as the API. Existing completed results must be explicitly reanalyzed.

`/scooters/new` is a persistent import workspace for **1–20 open scooter drafts per user**. Every draft is its own document editor session and can contain multiple files. The route opens an initial draft when none exists; users explicitly add every additional draft. Uploading files never creates drafts. All files dropped or selected inside a draft belong to that draft, including a batch of eight documents. One PDF may contain multiple document types. Upload and analysis begin on selection. AI classifies documents, extracts scooter fields and flags conflicting VINs; it never creates, splits, groups or moves scooter drafts. Users can add or review another scooter while existing jobs continue. English and Romanian labels are supported. Completed creations and explicit discards free a draft slot.

Apply `20261024120000_scooter_import_workspace` (after the existing job migrations) before deploying the API, then deploy the web client. The additive migration adds revisioned draft snapshots, execution reservations, foreign-registration/export/ITP document kinds, CIV availability and inspection history. It does not remove existing documents or rename existing kinds.

New batch uploads use `type: "unclassified"` and the receiving draft's editor session. Their signed token and draft ledger remain bound to the original `scooter-document:unclassified:<user>` scope through classification, document-type corrections, extraction and final save. Requests using those tokens include `uploadType: "unclassified"`; this never permits a token belonging to another user, session or upload purpose. Existing category-specific uploads retain their original scope.

For an unclassified job, the provider identifies logical documents from contents and extracts them in the same request. Concrete kinds are `civ`, `registration_certificate` (Romanian), `foreign_registration`, `export_certificate`, `insurance`, `itp_card`, `itp_certificate`, `ownership_proof`, and legacy `import_document`. Each logical record retains its type, original one-based pages/regions, VIN, normalized fields, original readings and review issues in `extractedData.documents`. The physical original is attached once. Unsupported content still returns `DOCUMENT_EXTRACTION_TYPE_UNKNOWN`; a mixed PDF is supported.

Extracted values fill the scooter form progressively. Document cards show a small pencil action for correcting detected types, including separate logical documents in a mixed PDF. The former standalone logical-document review section and its per-document confirmations are removed. Page references remain read-only inside the editor, and there are no per-document VIN inputs. Romanian registration and yellow ITP cards never supply VIN evidence. The single scooter VIN prefers CIV, insurance, export certificate, foreign registration, then other eligible sources; absence in another file does not request the VIN again. A conflicting eligible reading remains visible and blocks creation until explicitly corrected against the original. A changed reading invalidates the associated confirmation. CIV technical values take precedence, but foreign/export documents are still analyzed and their independent dates/identifiers retained. Known VIN disagreements across documents block creation. Dutch identifiers do not populate active Romanian registration. A CIV issue date is critical review evidence and never automatically becomes an ITP deadline.

Draft snapshots persist form values, document/photo metadata and tokens, attempts, job IDs, normalized evidence and review decisions. Reload resumes the same paid jobs rather than starting them again. Snapshots are bounded to 512,000 bytes and protected by optimistic revisions; a second tab cannot silently overwrite the first. Private previews are streamed only after owner/session checks. Draft sessions and unclaimed uploads expire after 24 hours, so this is a recoverable import workspace rather than permanent unsaved storage.

Changing a document's type reuses its original upload and starts a new extraction attempt. Removed files and document-type corrections invalidate their old evidence. Successful results are reused, failed files have individual retry controls, and cancellation includes queued files so they cannot restart automatically. Manual field edits remain protected. Missing categories are optional; required identity/registration fields and unresolved or conflicting VINs still require resolution. When CIV and import documents coexist, CIV retains technical authority.

The fake provider deliberately cannot classify file contents: choose a type manually when using it. The automated tests use synthetic files and mocked provider output; evaluate classification accuracy on representative authorized documents before relying on it operationally.

## Automatic client-copy assignment

Uploads default to automatic version detection. Clear filename markers such as
`client`, `client copy`, `copie client`, `pentru client`, `watermarked` and
`cu logo` identify client copies. A plain download counter or the word `copy`
alone does not establish client protection. Original/copy filename pairs are
matched independently of upload order, only within the receiving draft. Originals
in another draft never cause a copy to move or the drafts to merge.

The extraction prompt also reports protective repeated branding or diagonal/X
watermark overlays from the actual page images. Ordinary issuer logos, seals,
security backgrounds and handwritten crosses are not client-copy evidence.
Renamed protected scans are matched using independently read document identifiers;
a scooter VIN alone never selects a matching original. Ambiguous matches and
competing copies stay unassigned and block creation until an operator chooses
an original, uploads it, removes the copy, or corrects the version. Mixed files
containing both originals and protected copies are not classified wholly as copies.

Only originals populate scooter fields. Copies with clear filenames skip their
own extraction; copies discovered visually retain their matching evidence but
are removed from the form importer. Existing private bytes and overlays remain
untouched. Final submission attaches the client upload to its original using
the existing document-version storage path. Manual assignments and version
corrections persist across reloads. Results from jobs started with older prompts
remain compatible and do not gain an invented overlay classification.

## Local development

To use real OpenAI extraction locally without deploying Lambda or exposing a public webhook, add these settings to `apps/api/.env` and restart the API:

```dotenv
SCOOTER_DOCUMENT_EXTRACTION_DRIVER=openai
SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED=true
SCOOTER_DOCUMENT_VALIDATION_DRIVER=local
IMAGE_STORAGE_MAX_BYTES=15728640
# Optional benchmark mode; keep false until real-scan comparison passes.
DOCUMENT_VALIDATION_DETAIL_VIEWS=false
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

The validation stack's `NativeDetailViews` parameter controls optional native PDF detail views (default `false`). The API development worker reads `DOCUMENT_VALIDATION_DETAIL_VIEWS`. This appends four overlapping, labelled views per original page without resampling embedded images. The original pages come first; detail labels refer back to original page numbers and are never separate documents. Original page and prepared byte limits still apply. Annotation-bearing PDFs keep their appearances. Enable only after accuracy, latency and cost comparison on representative private scans.

Documents support up to 15 MiB (15,728,640 bytes) each. When upgrading an existing deployment, raise any explicit `IMAGE_STORAGE_MAX_BYTES` setting and the validation stack's `MaxDocumentBytes` parameter to `15728640`; an existing lower override still restricts uploads or analysis.

The old synchronous `POST /v1/scooters/document-extraction` endpoint is retired. Old browser tabs should reload. The new flow has no automatic fallback to rendering on the web dyno. The old provider timeout setting does not govern background jobs.

## HTTP and job lifecycle

- `POST /v1/scooters/document-editor-sessions` creates a session without creating a scooter.
- `GET/POST /v1/scooters/import-drafts` lists or creates owned import sessions (maximum 20 open drafts).
- `GET/PATCH /v1/scooters/import-drafts/:id` reads or updates a bounded snapshot; PATCH requires the current `revision`.
- `POST /v1/scooters/import-drafts/:id/discard` explicitly closes an import draft.
- `POST /v1/scooters/import-drafts/:id/document-content` streams a staged original after signed-token and editor-session checks.
- Upload and scooter-save requests carry that session ID. The browser gets a signed PUT only after the upload and resource ownership are recorded.
- `POST /v1/scooters/document-extraction-jobs` takes the existing source reference, session ID and stable attempt ID; it returns `202` with an application job ID.
- `GET /v1/scooters/document-extraction-jobs/:id` returns progress or the existing review-required analysis payload.
- `POST /v1/scooters/document-extraction-jobs/:id/cancel` records durable cancellation intent.
- `POST /v1/scooters/document-editor-sessions/:id/discard` closes an abandoned session and schedules cleanup.

Browser mutations retain the existing authentication, permissions and CSRF header. Source URLs and OpenAI response IDs are not exposed to the browser. Admission accepts a bounded durable backlog (400 pending jobs per user, 2,000 globally). Dispatch atomically reserves at most 20 processing jobs globally. A single user can occupy all 20, with rotation between owners and scooter drafts when there is contention. The dispatcher runs every second and does not wait for validation workers before accepting more work. Waiting jobs expire with their 24-hour session; the five-minute execution deadline starts when a processing slot is reserved. Lambda validation has its own bounded execution window. OpenAI control requests have 15-second deadlines.

Transport failure while polling resumes the same job. Retrying an ambiguous start uses its original attempt ID. If OpenAI may have accepted a request but the response ID was lost, the attempt remains marked as uncertain and is reconciled using provider events rather than automatically resubmitted.

Unresolved submissions continue to occupy admission capacity after their local deadline. Investigate them through the provider-event inbox and OpenAI request records; do not clear uncertainty merely to free a slot. The 20-job limit bounds active application jobs, not a strict count of remote responses: known remote work can continue briefly after local cancellation or expiry until the cleanup pass acknowledges cancellation.

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

ITP history uses reviewed paired yellow-card/certificate evidence. `GET/POST /v1/scooters/:id/itp` reads history or confirms an inspection, including explicit validity and result. The latest confirmed inspection controls the summary, not the furthest historical expiry. Missing, review, valid, expiring, expired and failed states are distinct. Renewal asks for both updated scans; an upload alone never renews validity. Conflicting VINs and evidence from another scooter are rejected. Initial ITP interval/category rules and rental enforcement remain separate from printed-date extraction.

The private accuracy runner is `apps/api/src/scooter-document-extraction/benchmark/analyze-private-scooter-documents.ts`. Run its manifest dry-run first, then explicitly pass `--run` for provider calls and compare `--detail-views` against ordinary preparation. Keep input manifests and samples outside the repository. Compare exact CIV issue dates, local identifiers (`VL-Bujoreni 166`, `VL 18 167`), both Dutch card sides, mixed-PDF grouping, insurance and complete ITP rows. Record field accuracy, false acceptance, review rate, latency, usage and cost. Mocked tests establish lifecycle and validation behavior, not real OCR accuracy.

Use synthetic inputs for automated/provider smoke tests. Existing source-reader tests cover signatures, checksums, actual PDF page limits and passwordless encryption fidelity. Provider tests check URL requests, bounded output, cancellation, refusal handling and secret-safe errors. Lifecycle tests exercise duplicate starts, save/discard exclusion, late completion, failed cleanup and retained originals. Browser tests retain VIN review, source-change guards and manual edit behavior.

The real database race suite is `apps/api/src/scooter-document-jobs/scooter-document-jobs.integration.spec.ts`. Apply the repository migrations to a disposable local PostgreSQL database and set `TEST_DOCUMENT_JOBS_DATABASE_URL` to its connection URL when running Jest. The suite does not fall back to the application database. It covers cancellation/discard/expiry during an uncertain submission, webhook correlation before a timed-out acknowledgement, duplicate starts, save/discard exclusion, cleanup retries, saved-source promotion and recovery after a lost save response.

Production activation additionally requires deployed AWS resources, configured OpenAI events and a live staging check. Local unit tests cannot establish provider accuracy or production memory usage. No private sample document, signed URL, API credential or raw provider response should be logged or committed.

## Progressive forms and document versions

Each draft has its own drop zone inside the Fill automatically card. Every selected PDF or image stays in that draft and is analysed independently; neither matching nor conflicting VINs change document ownership or draft count. Eligible VIN disagreements remain visible and block creation until reviewed. Files without readable VINs also stay in the receiving draft. Only the explicit add-draft control creates additional drafts. Draft state colors indicate progress without detection notifications. The draft rail scrolls horizontally on mobile, with the add-draft control last; the selected draft badge becomes the title below the rail, beside the discard action. Editors remain mounted to preserve in-progress work.

`ownership_proof` covers purchase invoices, sale contracts and other ownership evidence. Export/ownership evidence can start scooter creation without CIV or Romanian registration; missing required scooter fields are completed manually. Neither document implies registration or CIV issuance.

A staged original may have one explicitly paired `clientCopy` (file name, upload token and upload type). Client copies contain the already-applied branded overlay; this feature does not generate the overlay. Only the original is analysed. Saving claims both uploads transactionally, creates one `ScooterDocument` with original and optional client-copy media assets, and retains both resources. The admin client-copy content URL uses `?version=client_copy` under the same authenticated document route. Customer-portal listing and content automatically prefer the active client-copy asset while retaining the existing publication, document-type and active-rental checks. Removing a staged original also removes its staged copy. Copies cannot be saved without a matching original.
