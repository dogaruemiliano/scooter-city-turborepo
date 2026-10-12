# Scooter document extraction

The synchronous transport described below is the historical implementation. The
current job API, direct S3 inputs, deployment settings and abandoned-resource
cleanup are documented in [Background scooter document extraction](background-document-extraction.md).
The validation and review rules below still apply.

The scooter editor reads uploaded import documents, CIVs, registration certificates,
and insurance policies before the scooter is saved. **Extrage și continuă** starts
extraction and then opens the existing document review steps. Manual entry and JSON
file import remain available. The operational step is always entered manually.

Each document category uses one preview card, with an attachment count and a plus
button for adding files through the native picker. The full-screen viewer supports
switching, replacing and removing individual attachments; PDF page navigation and
zoom stay separate from document navigation. Selected files are uploaded only after
confirmation. Multiple insurance attachments belong to the same policy.

## Configuration

```dotenv
SCOOTER_DOCUMENT_EXTRACTION_DRIVER=openai
SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY=<server-side project API key>
SCOOTER_DOCUMENT_EXTRACTION_MODEL=gpt-5.4-2026-03-05
SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS=90000
```

Configure these on the API only. The default driver is `disabled`; `fake` is an
explicit synthetic development/test provider and is rejected in production. Person
and receipt extraction retain their independent configuration. Restart the API
after changing its environment. The pinned model is an evaluation baseline, not a
guarantee of extraction accuracy.

## Request and storage lifecycle

`POST /v1/scooters/document-extraction` accepts one document reference:

```json
{
  "sourceId": "editor-source-id",
  "source": { "kind": "draft", "type": "civ", "uploadToken": "signed-token" }
}
```

For an existing document, `source` is
`{ "kind": "saved", "scooterId": "...", "documentId": "..." }`.

The ADMIN endpoint uses the existing authentication and CSRF protection. It resolves
storage internally, validates staged-upload ownership, scope, expiry and lifecycle,
or verifies the saved document belongs to an active scooter. Authorized inventory
admins can read saved documents regardless of their original uploader.

Extraction never claims an upload or creates a scooter or insurance policy. Verified
source evidence stays in the editor until the final save stores the existing
`extractedData` alongside the documents. Upload expiry and cleanup still apply.
Results in an unsaved form are not durable and do not resume after a browser reload.

The server validates actual byte length, SHA-256, media signatures and PDF structure.
Files are limited to 15 MiB (or the lower storage limit), and PDFs to ten actual pages.
PDFs requiring an opening password, malformed PDFs and oversized PDFs receive
explicit errors; pages are never silently truncated. Storage reads are bounded
separately from the provider timeout.

## AI and validation

The OpenAI Responses request sends PDF/image bytes inline with high PDF detail
and original image detail for the configured GPT-5.4 model,
uses strict structured output and `store: false`, and has no automatic
retry. The deadline is at most 90 seconds per document, including preparation of
full-resolution crops. CIV/import output is limited
to 12,000 tokens and other documents to 4,000; response bodies are bounded at 256 KiB.
No persistent OpenAI Files upload is created.

PDF.js also renders every PDF page at 300 DPI (bounded to 9 million pixels and
4,000 pixels per side). Each page produces four overlapping, unresized detail
images, encoded as JPEG at quality 95, alongside the complete PDF. Page rotation
and crop boxes are honored. The views are labelled with their source page and
region; they do not contain an expected VIN or data from another document.
GPT-5.4 uses original image detail and low reasoning effort to reread small text
and distinguish ambiguous glyphs. Rendering shares the provider deadline, retains
no files, and limits the combined source/image bytes to 32 MiB. Oversized preparation
fails explicitly instead of silently dropping pages or reverting to a lower-detail
request. These views increase input-token usage.

The Node runtime must support PDF.js (Node >=22.13 or >=24). PDF rendering tests
use Jest's experimental VM-module support, enabled in the API test scripts.

Ordinary PDFs and images retain their original bytes. Some insurer PDFs use
encryption with an empty opening password: they display normally in a viewer, but
`pdf-lib` cannot parse their encrypted object streams. For those files only,
`@cantoo/pdf-lib` opens the PDF with the empty password and copies all page objects
into an in-memory analysis PDF. This preserves text, vectors, images, annotations,
page dimensions and resolution. The uploaded original remains untouched. The
prepared PDF is checked again for structure, page count and byte limits before
submission. PDFs that need a non-empty password remain unsupported.

PDF inputs explicitly set `detail: "high"`. Changing the preview zoom does not
change the AI input. GPT-5.4 image inputs use `detail: "original"` to retain
more small-text detail, within the model's image limits; older model overrides
continue to use `high`. This does not guarantee OCR accuracy. An AI refusal returns `DOCUMENT_EXTRACTION_FAILED`, not
`DOCUMENT_EXTRACTION_BAD_DOCUMENT`: a refusal does not establish that the file is
unreadable. The unreadable/unsupported message instead covers source format and
PDF validation failures.

Source IDs and document types in API responses are assigned by the server. The model
extracts each VIN independently, without being given an expected VIN from another
document. The editor compares readings before applying suggestions. Conflicting
VINs block application; unreadable VINs require explicit operator confirmation.
VIN field values must also agree with their raw reading; a Z/2 substitution during
normalization remains unresolved instead of becoming verified evidence.

When extracted VINs conflict, the editor offers per-document corrections beside
the original AI readings. An operator must check the document previews, enter the
correction and explicitly confirm that it matches the originals. Different VINs
still block the import; there is no automatic majority vote or Z/2 replacement.
Corrections retain `rawFields` and persist `vinReview: { method: "manual",
originalVin }` with the per-file evidence. The corrected VIN is reused in the
session without another AI request; replacing a file invalidates that review.

When a CIV is attached, import documents are kept as attachments but excluded from
AI requests and VIN review. Removing every CIV makes the import documents eligible
for extraction again. CIV technical readings take precedence over import readings. Registration details
come from registration documents, and insurance supplies the insured person,
validity dates, premium and currency. A printed dash is confirmed empty; unknown
values remain null; zero is a real value. Original readings are preserved separately
from normalized fields. Invalid individual suggestions are flagged for review while
usable suggestions remain available. AI does not infer operational details.

Both extraction prompts distinguish the vehicle's registration number from the
certificate's serial/number using the document's text, format and context rather
than fixed rubric positions. They explicitly cover nonstandard certificates with
the certificate identifier in rubric 2 and the plate in rubric 15. Locality/county
clues (for example Bujoreni, Vâlcea/VL or București/B) support that distinction only
when associated with the complete identifier, not merely an issuer/address header.
Original labels and readings stay in raw evidence; unresolved assignments remain
null for review. The exception never triggers an unconditional rubric swap.

Manual changes and deliberate clears are preserved. Replaced or removed sources
invalidate their readings and pending responses. Successful readings are reused
within the editor session; explicit retry processes failed sources only. Partial
failure does not discard successful readings or implicitly confirm unresolved VINs.

## Limits and diagnostics

The browser runs at most two requests concurrently. Each API process admits at most
four simultaneous analyses and two per user. The endpoint also uses the existing
20 requests/minute IP throttle. These are process-local limits, not a distributed
quota or durable idempotency guarantee. Multiple tabs/instances can cause repeated
paid calls. Cancellation is propagated, but cannot guarantee an already submitted
provider request incurs no cost.

Use stable error codes for UI messages. Do not log document bytes, raw responses,
extracted personal information, tokens or API keys. `store: false` does not mean
zero provider retention; organization-level data controls still apply.

## Validation

Automated tests use synthetic documents and mocked AI responses. They cover access,
integrity, PDF limits, structured output, normalization, source authority, VIN review,
partial failures, retries, stale responses and manual edits. The OpenAPI generation
check protects against exporting Zod transforms as JSON Schema.

The passwordless encryption regression uses synthetic RC4-128, AES-128 and AES-256
PDFs, checking every page, its small text, password-required errors and prepared
size limits. A local check of the reported two-page insurance PDF confirmed that
both rendered pages and the complete extracted text were byte-identical before
and after preparation. This checks PDF fidelity, not AI extraction accuracy.

A live smoke test on 2026-10-10 sent three synthetic PDFs to the configured
OpenAI model: a two-page CIV, a registration certificate and an insurance policy.
Nineteen checked readings matched their expected values, including values on the
second CIV page, a printed dash and the insurance premium. The registration VIN
was flagged for manual review instead of being silently accepted. This verifies
the integration and review path; it is not an accuracy benchmark on real documents.

Evaluate representative real CIV/import/registration/insurance documents separately
before relying on model accuracy. Compare every populated field with the complete
original, including dash/zero distinctions, VINs, dates and premium amounts. Keep
private samples and raw model outputs outside the repository; record aggregate
accuracy, latency and usage rather than personal information.

Provider contract verified against official documentation on 2026-10-10:

- [File inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Model capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Data controls](https://developers.openai.com/api/docs/guides/your-data)
