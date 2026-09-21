# Person document extraction

The add-person flow uploads documents before personal details. The API analyzes
those private draft uploads and returns suggestions for operator review. Analysis
does not create a person, save document fields, verify a document, or grant rental
eligibility. The operator remains responsible for checking each document.

## Add-person screens

1. Choose **Romanian citizen** or **Foreign citizen**.
2. **Identification documents** keeps the old/electronic ID selector and uploads
   on one screen. Old IDs and CEI require only the front; CEI also requires separate
   proof of address. Foreign citizens upload a passport, with optional visa and
   residence permit. Every slot accepts JPEG, PNG, WebP or PDF (up to 10 MiB).
3. Review and edit the extracted personal and identification document details.
4. Optionally add a **driving license**. A supplied license requires front and back;
   automatic extraction waits for both sides. Review the license and category dates.
5. Enter contact details.
6. Check the address.
7. Review document details and save. Saving opens the new person's detail page.

Upload cards span the mobile width and preserve the document aspect ratio in
previews. Opening a file shows a full-screen preview, with crop and delete actions
for images. Cropping preserves the original in the current draft for later
re-cropping. Mobile offers camera, gallery and files; desktop offers files and
both support drag-and-drop. Camera access starts only on Take photo and stops on
capture, close or unmount. PDF previews offer an Open file fallback and no crop.

Going back preserves uploads and manual edits. Extraction runs against uploaded
drafts before the person is created. Document-level `issuedOn` (the requested `issuedAt`) and `issuedBy` are no longer
collected or stored. Licence category acquisition dates remain available.
Every suggested value remains editable;
document verification status is never changed by extraction.

Completing the admin/owner create-person form confirms the operator has reviewed
the attached documents. Its submission explicitly sets every document to
`status: verified`, including driving licenses and drafts with an older
`unverified` status. A future customer self-service flow must submit documents as
`unverified` and must not reuse this admin submission policy.

Initial suggestions fill empty, untouched fields. Operator edits, including
intentional clears, are preserved during the initial reading. Replacing a photo
automatically applies the new reading, including over earlier manual corrections.
Removing a photo clears untouched values from that source. Unreadable replacement
values remain flagged for review; old manual values are never presented as current.
Conflicting readings are highlighted for manual correction. Request identities and
abort signals prevent late responses from older photos or workflows being applied.

The existing personal-details step is reused for verification. Compact document
cards show the icon, type, identifier and expiry, with the existing 7/30-day color
thresholds and readable expiry statuses. Proof of address shows only upload
confirmation. Missing or uncertain fields appear inline in yellow. Parsing appears
at the bottom right of each document preview; reading warnings and errors appear
over the preview on a translucent surface, with an independent retry action.
Document editors expand to 80vw on desktop. Document editors keep
local changes until Save; Cancel does not roll back extraction that arrived while
the editor was open. Continue remains available while extraction runs; validation
of untouched fields with active reading indicators is deferred until their results
arrive. Manual corrections are still validated. Final Save waits for pending
readings and validates the complete form. There is no separate manual-edit action.
Failed or unavailable
extraction leaves manual entry available. Unreadable foreign document issuers stay
blank rather than defaulting to Romania.

## Configuration

Person extraction has its own configuration; expense extraction continues using
`DOCUMENT_EXTRACTION_DRIVER` and AWS Textract without changes.

```dotenv
PERSON_DOCUMENT_EXTRACTION_DRIVER=openai
PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY=<server-side project API key>
PERSON_DOCUMENT_EXTRACTION_MODEL=gpt-4.1-mini-2025-04-14
PERSON_DOCUMENT_EXTRACTION_TIMEOUT_MS=45000
```

The default driver is `disabled`, so manual entry remains available without an API
key. Enabling `openai` requires a nonempty key at application startup. Keep it in
server environment configuration, never a `NEXT_PUBLIC_*` variable. No credential
has been added to the repository or deployment configuration by this change.

`fake` is an explicit local/CI fixture driver. Its synthetic `TEST FIXTURE` name is
flagged for review and it never suggests licence categories. Both environment
validation and the provider factory prohibit this driver in production.

## Provider and data handling

`PersonDocumentExtractionModule` exports `PersonDocumentExtractionService`. Its
input is an expected document type, optional national-ID format, and verified
source bytes labelled `front`, `back`, or `other`. The authenticated persons API
resolves upload tokens, checks source ownership and integrity, and loads private
storage objects before invoking this service.

The OpenAI driver sends the document bytes to the fixed Responses API endpoint.
JPEG, PNG and WebP use inline base64 `input_image` content with high detail.
PDFs for all document types use inline `input_file` content; there is no persistent Files
API upload. The request sets `store: false`, uses strict JSON output, limits output
to 4,000 tokens, and has a timeout capped at 45 seconds without automatic retries.
Provider response bodies are limited to 128 KiB before JSON parsing. Source files
are limited to 10 MiB each; the persons API additionally limits total source bytes.

`store: false` disables Responses application-state storage. It is not a promise
of zero retention by the provider; deployments should use their organization's
OpenAI data controls. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

Document bytes, raw OCR/model output, API credentials, refusals, provider error
bodies and provider exception causes are not logged or returned. Public errors
use stable application codes and generic messages. Suggestions are returned to
the requesting operator; extraction itself does not persist them.

## Validation and review

The model's JSON is untrusted even when structured output is requested. The
service accepts only allowed fields and known source slots. A detected document
type mismatch suppresses all suggestions. When the detected type matches the
requested type, a contradictory model `typeMismatch` warning is discarded and
valid values are applied. Other warnings do not suppress valid readings.
Proof of address is a supporting-document purpose: CEI domicile/residence
certificates, including HUB MAI PDFs, belong here even if the model labels them
as a national ID because they mention CEI/CNP. A requested proof is normalized to
`proofOfAddress` only when a nonempty residential location has explicit domicile
or residence evidence; names, nationality and issuer/birthplace addresses do not
qualify. Person/address values still pass the ordinary validators, and document
numbers/expiry are discarded for proofs. The provider prompt explicitly reads
these certificates as proof of address.
Missing or unreadable fields stay
blank. A source reference to an image absent from the request is rejected.

Names retain their spelling and diacritics. The service reuses the shared person
and document validators to trim fields, validate calendar dates and CNP checksums,
and normalize country codes. Invalid values are omitted individually so readable
fields still help the operator. It also rejects future birth dates and invalid licence-category acquisition dates,
and derives birth dates deterministically from validated CNPs.
Romanian IDs always provide separate series and number suggestions. Classic IDs
use the printed SERIA and NR. fields; CEI document numbers such as `ZR0012345`
are split into series `ZR` and number `0012345`. Leading zeros are preserved.
The normalization layer also splits combined readings and retains conflicts with
separately extracted fields for review. Both fields are editable for either format.
Competing readings of the same field retain source attribution and are marked for
review. Country names or ambiguous dates are not guessed by server-side code.

The extraction prompt distinguishes a visa/permit's own number from a referenced
passport number. Electronic ID addresses are not invented; the separate proof of
address supplies the address. The prompt treats any instructions printed inside
documents as data rather than commands.

Licence extraction reads the issuing country from the country code inside the
EU flag at the top left of the front (including `RO` for Romania), or a printed
country name. In the Romanian-citizen wizard, a recognized driving licence with
no readable issuer defaults to Romania. This editable workflow default has no OCR
source attribution; a readable foreign issuer or a manual edit takes precedence.
Foreign-citizen licences still require an issuer when none is readable.

Licence extraction includes a category only when its acquisition date is legible.
An expiry date alone, empty row or category icon does not grant a category. It
extracts category expiry dates separately from the document expiry date. Invalid or contradictory rows
are omitted. Every suggested category is marked for review; no category equivalence
or rental permission is inferred. Extraction does not set `status: verified`.

## Validation performed

Unit tests use synthetic bytes and mocked HTTP responses. They cover image and
PDF request shapes, valid Romanian field normalization, invalid CNPs/dates/country
codes, conflicting sources, unsupported or oversized inputs, category filtering,
refusals, incomplete results, provider failures and timeout handling. No real
identity documents have been sent to OpenAI and no live extraction quality
benchmark has been run. The pinned model is a starting configuration; evaluate
accuracy on appropriately authorized sample documents before relying on its
suggestions in production.

The implementation was checked against the official documentation on 2026-09-12:

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [PDF file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [Strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini model and snapshot](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

The documented snapshot supports image input, Responses and structured outputs.
The implementation uses the documented `text.format` JSON-schema configuration;
every property is required, with nullable values where applicable, and all model
output objects disallow additional properties.

## Database rollout

Apply `20260912180000_simplify_person_documents` with the normal migration deployment
before running the updated API. It removes document issuance columns, scrubs their
audit changes, rebuilds the affected search index, clears proof-of-address identifiers
and expiry dates, and detaches old CEI reverse photos. Their storage objects are queued
under the `retired-cei-back` purpose for the existing hourly, retryable cleanup job.
Person creation keeps progress only in memory while the form is open. There is no
draft persistence or resume flow. The browser database used by earlier clients is
deleted on entry. Leaving through a link or browser Back requires confirmation;
refreshing or closing the tab uses the browser's native unsaved-changes prompt.
Successful creation bypasses the prompt. Private temporary uploads remain necessary
for extraction and are handled by the existing upload lifecycle.

Both sides are required when adding a driving licence through the wizard or the
existing person's document dialog. The API validates those uploads and claims them
inside the same transaction that creates the document. Updating an existing driving
licence also requires both active photo slots.
