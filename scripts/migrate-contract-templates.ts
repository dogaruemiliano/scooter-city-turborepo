import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  splitCombinedTemplate,
  sha256,
  renderDocxTemplate,
} from "../apps/api/src/contract-templates/engine/docx-engine";
import {
  PREVIEW_SCENARIOS,
  previewValues,
} from "../apps/api/src/contract-templates/engine/preview-values";
import { convertDocxToPdf } from "../apps/api/src/contract-templates/engine/pdf-converter";

/** Offline migration: synthetic templates only, no database writes and no implicit approval/publication. */
async function main(): Promise<void> {
  const sourcePath = resolve(
    process.argv[2] ?? ".codex/template-assets-v2/contract-template.docx",
  );
  const outputPath = resolve(
    process.argv[3] ?? "apps/api/src/contract-templates/assets",
  );
  const source = await readFile(sourcePath);
  await mkdir(outputPath, { recursive: true });
  const results = [];
  for (const result of splitCombinedTemplate(source)) {
    if (result.report.status !== "PASSED")
      throw new Error(result.report.errors.join(" "));
    const name = result.type.toLowerCase().replaceAll("_", "-");
    await writeFile(resolve(outputPath, `${name}.docx`), result.source);
    const previews = [];
    for (const scenario of PREVIEW_SCENARIOS) {
      const rendered = renderDocxTemplate(
        result.source,
        result.type,
        previewValues(result.type, scenario),
      );
      previews.push({ scenario, renderedDocxSha256: sha256(rendered) });
      if (process.env.CONTRACT_RENDERER_BINARY) {
        const pdf = await convertDocxToPdf(
          rendered,
          process.env.CONTRACT_RENDERER_BINARY,
        );
        await writeFile(
          resolve(outputPath, `${name}-${scenario.toLowerCase()}.pdf`),
          pdf,
        );
      }
    }
    results.push({
      type: result.type,
      file: `${name}.docx`,
      bodyTextSha256: result.bodyTextSha256,
      validation: result.report,
      previews,
    });
  }
  const report = {
    sourceSha256: sha256(source),
    originalUnchanged: sha256(await readFile(sourcePath)) === sha256(source),
    structuralContentPreserved: true,
    order: results.map((result) => result.type),
    visualReview: process.env.CONTRACT_RENDERER_BINARY
      ? "PDFs generated; human visual/legal review still required"
      : "NOT RUN: private LibreOffice renderer is not configured",
    results,
  };
  await writeFile(
    resolve(outputPath, "migration-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      sourceSha256: report.sourceSha256,
      templates: results.map((result) => ({
        type: result.type,
        status: result.validation.status,
        placeholders: result.validation.placeholders.length,
      })),
      visualReview: report.visualReview,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
