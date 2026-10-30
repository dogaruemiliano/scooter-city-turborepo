# Contract renderer QA — 2026-10-30

Actual DOCX-to-PDF conversion produced **22 PDFs / 96 pages**: all three independent source documents in all six unsigned scenarios, plus four synthetic `FINAL_SIGNED` examples. The final output contains no unresolved placeholder literals, replacement characters, missing expected string values or out-of-page word boxes in the checks below. Visual inspection found no clipping or overlapping content. This records renderer and layout evidence; the legal text still requires its designated human approval before publication.

## Renderer provenance

The renderer was **LibreOffice 26.8.2.2**, build `9dea406ab7695df6325b11b0e19fdca8db4b7276`, on macOS 26.7.1 arm64. The Apple Silicon DMG came from the [official LibreOffice download service](https://download.documentfoundation.org/libreoffice/stable/26.8.2/mac/aarch64/LibreOffice_26.8.2_MacOS_aarch64.dmg), selected from the [official download page](https://www.libreoffice.org/download/). Its 299,236,406-byte download matched the official SHA-256 digest and Metalink:

```text
9f24fe83ab1ed5c95eb3df580119f32932f713e577feeac02bf619fb00749b55
```

The image was mounted read-only under `/private/tmp`, and `codesign --verify --deep --strict` accepted the application and its designated requirement. No application was installed into `/Applications`, no user LibreOffice profile was used, and no production data or database was accessed. Conversion used the existing `convertDocxToPdf` wrapper with an isolated temporary profile per document, following LibreOffice's [documented headless conversion arguments](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html). A configured converter is still required in deployment; this QA run does not install one for the service.

The combined source SHA-256 remained `006720d4193dc84f2b1f4ab13a85ff12fcb29b4d392362ff84c2957537764882`. The offline migration command reproduced all three repository DOCX files byte for byte:

| Source                    | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `rental-agreement.docx`   | `4a77afb0304ec33f3b62d901f8a48c4666fd26eb4ebdb0ea91c3295009fc4125` |
| `gdpr-notice.docx`        | `fdc23f5ce41c8036ee4bf5c8291c6808bd238ec14b654f8d5ed5541e2d6e5163` |
| `technical-handover.docx` | `bf745d38aea46ee41da565652f9726b54897031c048e0b095adc2773871ba808` |

The generated `assets/migration-report.json` was refreshed after the corrected fixture run. Only the report was copied from the temporary output; PDF artifacts were not added to the runtime template assets.

## Converted files

All unsigned examples use `READY_FOR_SIGNING`. Scenario filenames map to `25`, `45`, `NO_LIMITER`, `LONG_NAMES`, `ABSENT_EQUIPMENT` and `DEFECTS` respectively.

| PDF filename                              |  Pages |
| ----------------------------------------- | -----: |
| `rental-agreement-25.pdf`                 |      8 |
| `rental-agreement-45.pdf`                 |      8 |
| `rental-agreement-no_limiter.pdf`         |      8 |
| `rental-agreement-long_names.pdf`         |      8 |
| `rental-agreement-absent_equipment.pdf`   |      8 |
| `rental-agreement-defects.pdf`            |      8 |
| `gdpr-notice-25.pdf`                      |      2 |
| `gdpr-notice-45.pdf`                      |      2 |
| `gdpr-notice-no_limiter.pdf`              |      2 |
| `gdpr-notice-long_names.pdf`              |      2 |
| `gdpr-notice-absent_equipment.pdf`        |      2 |
| `gdpr-notice-defects.pdf`                 |      2 |
| `technical-handover-25.pdf`               |      3 |
| `technical-handover-45.pdf`               |      3 |
| `technical-handover-no_limiter.pdf`       |      3 |
| `technical-handover-long_names.pdf`       |      3 |
| `technical-handover-absent_equipment.pdf` |      3 |
| `technical-handover-defects.pdf`          |      3 |
| `final-rental-agreement-25.pdf`           |      8 |
| `final-gdpr-notice-45.pdf`                |      2 |
| `final-technical-handover-25.pdf`         |      4 |
| `final-technical-handover-no_limiter.pdf` |      4 |
| **Total**                                 | **96** |

All names, addresses, identity numbers, logos and signatures are explicitly synthetic demonstration fixtures. The four final examples use nine distinct synthetic signature bitmaps across their required slots. The limited technical example has separate company, customer and speed-declaration images. The no-limiter example has company and customer images and an explicit not-applicable speed slot. No bitmap was copied into another required signature slot. The signature image hashes are retained in the JSON inventory.

## Checks and visual observations

PyMuPDF 1.28.2 opened every PDF, extracted all text and rendered every page at 120 dpi, using its [documented text extraction](https://pymupdf.readthedocs.io/en/latest/recipes-text.html) and [page rasterization](https://pymupdf.readthedocs.io/en/latest/recipes-images.html) APIs. The checks covered every expected string field for that document/scenario after Unicode and whitespace normalization. They found:

| Check                                                | Result  |
| ---------------------------------------------------- | ------- |
| Openable PDFs / rasterized pages                     | 22 / 96 |
| Missing expected string values                       | 0       |
| Remaining `${` or U+FFFD replacement characters      | 0       |
| Word boxes outside their page, with 0.5 pt tolerance | 0       |
| Unembedded PDF fonts                                 | 0       |
| Distinct page PNG hashes                             | 51      |
| Distinct page rasters lacking visual coverage        | 0       |

There are 22 contact sheets and 96 individual page PNGs. Sixteen contact sheets were visually inspected, covering every one of the 51 distinct page raster hashes; the remaining 45 page instances are pixel-identical duplicates of covered pages. Selected pages were also inspected at full raster size, including the long-name technical signature table, the corrected absent-equipment page, the GDPR final signature page and the limited technical final signature page. The JSON inventory records the inspected contact sheets and page-hash equivalence groups, so this does not imply that automated text checks alone establish layout quality.

The review checked the customer order (agreement, Annex 2 GDPR, Annex 1 technical handover), preserved annex numbers, headers/footers, paragraph continuity, table cells, long names/addresses, Romanian diacritics and the three limiter variants. Embedded font subsets are Liberation Sans, Liberation Sans Bold, Carlito Bold and OpenSymbol. Text, tables and images remained inside the page, without an accidental blank page or visible overlap.

The final examples visibly embed the DEMO logo and distinct synthetic signature images in their intended cells. The technical annex grows from three unsigned pages to four pages with the larger demo logo/signature raster fixtures. Its no-limiter final page is sparse, containing the not-applicable limiter date and signature table, but the content is complete and unclipped. No legal wording or source layout was edited to force a page count.

One fixture inconsistency was found in the first rendered absent-equipment preview: helmet quantity was zero while handover and condition still described a supplied helmet. The fixture was corrected to “Nu se predă” / zero / “Nu se aplică”, with matching helmet, phone-holder and USB notes. All 18 unsigned previews were regenerated and rechecked after that change; the corrected technical page was visually inspected. This changed demonstration values, not the original legal source. The pre-correction PDF and contact sheet are kept separately under `findings/` for traceability and are not counted in the final 22 PDFs.

## Artifacts and reproduction

The persistent [JSON inventory](template-render-qa-2026-10-30.json) records final PDF SHA-256 hashes, sizes, page counts, embedded fonts, per-page PNG hashes, image counts, signature fixture hashes and visual coverage. Temporary review artifacts are under:

```text
/private/tmp/scooter-template-render-yuY2G0/output/        # final PDFs, text, DOCX fixtures, PNGs, contact sheets
/private/tmp/scooter-template-render-yuY2G0/findings/      # original fixture inconsistency evidence
/private/tmp/scooter-template-render-yuY2G0/contract-render-qa-2026-10-30.zip
```

The ZIP contains the 22 final PDFs, all 96 page PNGs, 22 contact sheets, the hash inventory, source migration report, synthetic expected values, final fixture DOCX files and the temporary reproduction scripts. It is a review artifact, not a public upload. `/private/tmp` is ephemeral; copy the ZIP to the appropriate private review store when retaining it beyond this workspace session.

Unsigned previews are reproduced from the repository root with an approved converter:

```sh
CONTRACT_RENDERER_BINARY=/absolute/path/to/soffice \
  node --import tsx scripts/migrate-contract-templates.ts \
  .codex/template-assets-v2/contract-template.docx /private/tmp/contract-preview-qa
```

PDF binary hashes may vary between conversions because the converter emits document metadata; the inventory binds the exact reviewed bytes. Production OS/fonts must be validated in the deployed worker. This run provides no real client signatures, SMS provider delivery, legal approval or activation of a template set.
