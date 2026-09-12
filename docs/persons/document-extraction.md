# Person document extraction

The add-person flow uploads documents before personal details. The API analyzes
those private draft uploads and returns suggestions for operator review. Analysis
does not create a person, save document fields, verify a document, or grant rental
eligibility. The operator remains responsible for checking each document.

## Add-person screens

1. Choose **Romanian citizen** or **Foreign citizen**.
2. **Identification documents** keeps the old/electronic ID selector and uploads
   on one screen. Old IDs require the front; CEI requires both sides and separate
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
drafts before the person is created. Every suggested value remains editable;
document verification status is never changed by extraction.

Automatic suggestions fill empty, untouched fields. Operator edits, including
intentional clears, are preserved. Competing readings require an explicit choice;
the first response does not win. Replacing or removing a photo clears untouched
values from that source, while manual corrections remain. Request identities and
abort signals prevent late responses from older photos or workflows being applied.

The review form shows source documents and uncertain values. Document editors keep
local changes until Save; Cancel does not roll back extraction that arrived while
the editor was open. Save is blocked while a reading is pending, with an explicit
Continue manually option that ignores pending results. Failed or unavailable
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
type mismatch suppresses all suggestions. Missing or unreadable fields stay
blank. A source reference to an image absent from the request is rejected.

Names retain their spelling and diacritics. The service reuses the shared person
and document validators to trim fields, validate calendar dates and CNP checksums,
and normalize country codes. Invalid values are omitted individually so readable
fields still help the operator. It also rejects future birth/issue dates,
inconsistent issue/expiry pairs and contradictory CNP/birth-date readings.
Competing readings of the same field retain source attribution and are marked for
review. Country names or ambiguous dates are not guessed by server-side code.

The extraction prompt distinguishes a visa/permit's own number from a referenced
passport number. Electronic ID addresses are not invented; the separate proof of
address supplies the address. The prompt treats any instructions printed inside
documents as data rather than commands.

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
