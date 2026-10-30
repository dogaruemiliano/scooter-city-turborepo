# Contract templates: source migration and renderer

The editable canonical format is DOCX. The supplied combined v2 source is retained, unchanged, at `apps/api/src/contract-templates/assets/combined-v2-source.docx` for reproducible migration tests. Its SHA-256 is `006720d4193dc84f2b1f4ab13a85ff12fcb29b4d392362ff84c2957537764882`.

The independent source files are:

| Customer order                 | File                      | Initial distinct fields |
| ------------------------------ | ------------------------- | ----------------------- |
| 1. Rental agreement            | `rental-agreement.docx`   | 45                      |
| 2. Annex 2: GDPR notice        | `gdpr-notice.docx`        | 16                      |
| 3. Annex 1: technical handover | `technical-handover.docx` | 89                      |

The initial registry has 123 distinct fields across these overlapping subsets. Legal annex numbering is preserved. The split finds the exact structural paragraph headings `ANEXA NR. 1` and `ANEXA NR. 2`, rejects ambiguous boundaries, and preserves all paragraph/table text, relationships, styles, header/footer parts and signature slots. Page breaks used only to separate documents in the combined file are removed at the new document boundaries. The migration does not split PDF page numbers, modify the original or publish/approve anything.

A separately approved promotional addendum must include its own `${companySignContract}` and `${renterSignContract}` slots. They receive that document's separate acts; another document's signature is never copied into the addendum.

Run from the repository root:

```sh
node --import tsx scripts/migrate-contract-templates.ts
```

An optional input path and output directory are the second and third arguments. `migration-report.json` records each source hash, body text hash, field occurrence locations and synthetic DOCX render hashes. Six synthetic scenarios are rendered per document: 25, 45, no limiter, long names/addresses with diacritics, absent equipment and defects. The files contain demonstration labels, and are never imported as real people or rentals.

## DOCX editing and publication

Download the current DOCX, edit it in Word, retain the supported `${camelCase}` tokens and their document-specific signature slots, then upload a new version. Text changes using existing resolvers require validation, synthetic PDF previews, explicit human review, publication and activation of a complete compatible set. Changing only GDPR does not require new copies of the agreement and technical annex. Published source bytes and existing package references are not changed by activation or rollback.

`engine/registry.ts` describes every initial field's meaning, source, type and permitted document types. A new token/resolver, a new image type or a new condition needs a reviewed code change and deployment. An administrator cannot upload executable resolvers. The optional promotion addendum has no supplied approved clause; producing synthetic base-document previews does not approve 3+1 legal terms.

## Supported DOCX profile

The engine parses OOXML with `@xmldom/xmldom` 0.9.12 and serializes with `requireWellFormed: true`. Tokens can span adjacent runs within a paragraph. Body paragraphs, tables and every first/even/default header/footer part are processed. Tabs, line breaks and unrelated paragraphs never join into one token. Replacement is a single pass; `$&`, `<`, `&` and diacritics remain literal text, correctly XML-escaped. The speed declaration is resolved once from the versioned legal fragment and inserted as text.

Uploads reject malformed/unknown/disallowed placeholders, missing critical fields, macros, OLE/executable parts, external relationships, unsupported dynamic parts, tracked changes, comments, text boxes, data bindings, hidden text, automatic fields and processing instructions. UTF-8 XML 1.0 declarations are validated as metadata and removed before parsing, because strict XML serialization must not serialize a reserved `xml` processing instruction. XML is bounded to 2 MiB per part, 50,000 nodes and depth 128. DOCX archives are bounded to 10 MiB compressed, 40 MiB expanded, 12 MiB per ZIP entry and 256 entries. The reader checks directory/local-entry agreement, CRC, duplicates, traversal and bounded decompression; it never extracts uploaded paths onto disk.

Image values contain private authorized PNG/JPEG bytes, MIME and bounded dimensions; they are embedded using OOXML relationships. URLs, SVG and HTML are not image values. Unsigned slots render deliberate blank signing lines, while a not-applicable limiter signature is explicit. `FINAL_SIGNED` rendering rejects unsigned slots. Presentation checks do not establish a signing act: the workflow must separately bind actor, session, document version/hash, exact acceptance and signature asset.

Validation manifests bind exact source bytes, document type, registry, required fields, speed fragments and renderer version. Runtime code/registry/fragment changes require revalidation before a new template version is published; historical PDFs remain the stored originals.

## Private PDF conversion and QA status

`convertDocxToPdf` requires an absolute approved LibreOffice executable supplied by deployment. It uses a unique private temporary directory/profile, no shell, a 30-second timeout, limited process output, bounded PDF output and cleanup after success/failure. Run it inside the conversion worker/container with network disabled and OS memory/CPU/process limits. The subprocess wrapper by itself does not provide container isolation. Missing configuration fails explicitly.

To additionally generate PDFs while rerunning the migration:

```sh
CONTRACT_RENDERER_BINARY=/absolute/path/to/soffice node --import tsx scripts/migrate-contract-templates.ts
```

Actual conversion and layout QA were completed on 2026-10-30 using an official, checksum-verified, temporarily mounted LibreOffice 26.8.2.2 build. The 18 synthetic unsigned previews and four synthetic `FINAL_SIGNED` examples produced 22 PDFs / 96 pages. Every page was rasterized; visual inspection covered all 51 distinct page rasters, including headers/footers, long names, tables, diacritics, distinct signature images, Annex 2 and the 25/45/no-limiter variants. The absent-equipment fixture contradiction found during review was corrected and all 18 unsigned previews regenerated. See [the renderer QA record](template-render-qa-2026-10-30.md) and its hash inventory. The source files remain unapproved drafts: renderer QA does not supply human legal approval, real signing acts or a production converter deployment.

## Verification executed

```sh
NODE_OPTIONS=--experimental-vm-modules apps/api/node_modules/.bin/jest --config apps/api/package.json --runInBand --watchman=false --runTestsByPath apps/api/src/contract-templates/engine/docx-engine.spec.ts apps/api/src/contract-templates/templates.service.spec.ts apps/api/src/contract-templates/packages.service.spec.ts
```

The focused suite covers structural migration, all synthetic scenarios, split-run/header/footer replacement, escaping, unsupported/dangerous files and XML, image/signature slot validation, exact manifest review, authorization, stale publication/activation, package immutability, renderer failure, file integrity and identity-review binding. These are unit tests; they do not replace the separate renderer QA, database concurrency tests, camera testing on supported devices or human legal review.

A separate real PostgreSQL suite, `contracts.integration.spec.ts`, is opt-in through `TEST_CONTRACT_DATABASE_URL` and rejects nonlocal/non-test database names. It never uses `DATABASE_URL`. The migrated isolated test cluster was used to verify concurrent set creation/activation, advisory-lock idempotency, restrictive asset foreign keys, frozen set references, identity-change invalidation, inspection conflicts and critical holds, server receipt totals, Bucharest DST coverage and the old handover route's checkout gates. The first real run exposed Prisma 7's inability to deserialize PostgreSQL `void` from an advisory-lock SELECT; casting that result to text fixed the production command path. Subsequent runs also covered a direct photo-reference change without touching the identity document parent row. Current aggregate test and migration counts are recorded in [the implementation report](implementation-report.md).

```sh
TEST_CONTRACT_DATABASE_URL=postgresql://test-user@127.0.0.1:55435/contracts_workflow_test NODE_OPTIONS=--experimental-vm-modules apps/api/node_modules/.bin/jest --config apps/api/package.json --runInBand --watchman=false --runTestsByPath apps/api/src/contract-templates/contracts.integration.spec.ts
```

Use a freshly migrated, isolated database without existing company records. The suite creates identifiable synthetic fixtures and removes only its own records. Authorization and private storage are explicit test adapters; PostgreSQL transactions, constraints, audit writes and rental operations are real. No SMS delivery or DOCX-to-PDF conversion is claimed by these database tests.
