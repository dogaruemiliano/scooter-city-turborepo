import "dotenv/config";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import {
  appendDocumentAnalysisDetails,
  normalizeDocumentAnalysisPdf,
} from "../../document-validation/document-analysis-pdf";
import { OpenAiScooterDocumentExtractionProvider } from "../openai-scooter-document-extraction.provider";
import { ScooterDocumentExtractionService } from "../scooter-document-extraction.service";

const valueSchema = z.union([z.string(), z.number(), z.null()]);
const expectedDocumentSchema = z
  .object({
    documentType: v1.scooters.scooterDocumentTypeSchema,
    pages: z.array(z.number().int().min(1).max(10)).min(1),
    vin: z.string().nullable().optional(),
    fields: z.record(z.string(), valueSchema).optional(),
    inspections: z.array(z.record(z.string(), valueSchema)).optional(),
  })
  .strict();
const fixtureSchema = z
  .object({
    // Use a synthetic ID here, never an owner's name, VIN or registration number.
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    file: z.string().min(1),
    documentType: v1.scooters.scooterDocumentTypeSchema,
    expected: z
      .object({
        vin: z.string().nullable().optional(),
        fields: z.record(z.string(), valueSchema).optional(),
        documents: z.array(expectedDocumentSchema).max(20),
      })
      .strict(),
  })
  .strict();
const manifestSchema = z
  .object({ fixtures: z.array(fixtureSchema).min(1).max(200) })
  .strict();
const extensionTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
export interface BenchmarkScore {
  checked: number;
  correct: number;
  missingDocuments: number;
  unexpectedDocuments: number;
}
/** Match document groups by type and original source pages, independently of model ordering. */
export function scoreExtraction(
  expected: z.infer<typeof fixtureSchema>["expected"],
  actual: v1.scooters.ScooterDocumentExtractedData,
): BenchmarkScore {
  const score: BenchmarkScore = {
    checked: 0,
    correct: 0,
    missingDocuments: 0,
    unexpectedDocuments: 0,
  };
  const check = (wanted: unknown, reading: unknown) => {
    score.checked++;
    if (wanted === reading) score.correct++;
  };
  if (Object.hasOwn(expected, "vin")) check(expected.vin, actual.vin);
  for (const [field, value] of Object.entries(expected.fields ?? {}))
    check(value, actual.fields[field]);
  const candidates = actual.documents ?? [];
  const matched = new Set<number>();
  const pagesKey = (pages: number[]) =>
    [...new Set(pages)].sort((a, b) => a - b).join(",");
  for (const wanted of expected.documents) {
    const index = candidates.findIndex(
      (candidate, i) =>
        !matched.has(i) &&
        candidate.documentType === wanted.documentType &&
        pagesKey(candidate.pages) === pagesKey(wanted.pages),
    );
    const candidate = candidates[index];
    check(true, Boolean(candidate));
    if (!candidate) score.missingDocuments++;
    else matched.add(index);
    if (Object.hasOwn(wanted, "vin")) check(wanted.vin, candidate?.vin);
    for (const [field, value] of Object.entries(wanted.fields ?? {}))
      check(value, candidate?.fields[field]);
    wanted.inspections?.forEach((row, rowIndex) => {
      const reading = candidate?.inspections?.[rowIndex];
      for (const [field, value] of Object.entries(row))
        check(value, reading?.[field as keyof typeof reading]);
    });
  }
  score.unexpectedDocuments = candidates.length - matched.size;
  score.checked += score.unexpectedDocuments;
  return score;
}

function option(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && !process.argv[index + 1]?.startsWith("--")
    ? process.argv[index + 1]
    : undefined;
}
/** Resolve symlinks, including the nearest existing parent of new result paths. */
async function privatePath(path: string): Promise<string> {
  const repository = await realpath(resolve(__dirname, "../../../../.."));
  let parent = path;
  const suffix: string[] = [];
  while (true) {
    try {
      await stat(parent);
      break;
    } catch {
      const next = dirname(parent);
      if (next === parent)
        throw new Error("A private path could not be resolved.");
      suffix.unshift(relative(next, parent));
      parent = next;
    }
  }
  const canonical = resolve(await realpath(parent), ...suffix);
  const within = relative(repository, canonical);
  if (!within || (within !== ".." && !within.startsWith(`..${sep}`)))
    throw new Error(
      "Keep manifests, source scans and results outside the repository.",
    );
  return canonical;
}
async function main() {
  const manifestPath = option("--manifest");
  if (!manifestPath)
    throw new Error(
      "Provide --manifest=/private/path/manifest.json; default execution is a local dry run.",
    );
  const path = await privatePath(resolve(manifestPath));
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
  if (
    new Set(manifest.fixtures.map((fixture) => fixture.id)).size !==
    manifest.fixtures.length
  )
    throw new Error("Fixture IDs must be unique.");
  const detailViews = process.argv.includes("--detail-views");
  const run = process.argv.includes("--run");
  const outputDirectory = await privatePath(
    resolve(
      option("--output") ??
        resolve(
          dirname(path),
          "results",
          detailViews ? "detail-views" : "baseline",
          new Date().toISOString().replaceAll(":", "-"),
        ),
    ),
  );
  const model = process.env.SCOOTER_DOCUMENT_EXTRACTION_MODEL ?? "gpt-5.4";
  const apiKey = process.env.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY;
  if (run && !apiKey)
    throw new Error(
      "Set SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY before --run.",
    );
  const total: BenchmarkScore = {
    checked: 0,
    correct: 0,
    missingDocuments: 0,
    unexpectedDocuments: 0,
  };
  let durationMs = 0;
  const tokens = { input: 0, output: 0, total: 0 };
  for (const fixture of manifest.fixtures) {
    const preparationStarted = Date.now();
    const contentType = extensionTypes[extname(fixture.file).toLowerCase()];
    if (!contentType)
      throw new Error(`Fixture ${fixture.id} has an unsupported file type.`);
    const original = await readFile(
      await privatePath(resolve(dirname(path), fixture.file)),
    );
    if (
      !original.length ||
      original.length > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES
    )
      throw new Error(
        `Fixture ${fixture.id} is empty or exceeds the source byte limit.`,
      );
    const signal = AbortSignal.timeout(90_000);
    let bytes: Uint8Array = original;
    let originalPageCount = 1;
    if (contentType === "application/pdf") {
      // Match the isolated background preparation, including source validation.
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(original);
      originalPageCount = pdf.getPageCount();
      if (
        !pdf.getPageCount() ||
        pdf.getPageCount() > v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_MAX_PAGES
      )
        throw new Error(
          `Fixture ${fixture.id} exceeds the original page limit.`,
        );
      bytes = await normalizeDocumentAnalysisPdf(
        original,
        v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
        signal,
      );
      if (detailViews)
        bytes = await appendDocumentAnalysisDetails(
          Buffer.from(bytes),
          v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
          signal,
        );
    }
    if (
      fixture.expected.documents.some((document) =>
        document.pages.some((page) => page > originalPageCount),
      )
    )
      throw new Error(
        `Fixture ${fixture.id} has expected pages outside the original source.`,
      );
    const preparationMs = Date.now() - preparationStarted;
    if (!run) continue;
    // Disable the legacy synchronous JPEG crops: benchmark exactly the source
    // PDF/native detail views used by the URL-based background provider.
    let usage:
      | { input_tokens: number; output_tokens: number; total_tokens: number }
      | undefined;
    const provider = new OpenAiScooterDocumentExtractionProvider(
      {
        apiKey: apiKey!,
        model,
        timeoutMs: 90_000,
        onUsage: (value) => {
          usage = value;
        },
      },
      fetch,
      () => Promise.resolve([]),
    );
    const service = new ScooterDocumentExtractionService(provider);
    const started = Date.now();
    const output = await provider.analyze({
      documentType: fixture.documentType,
      contentType,
      bytes,
      signal,
    });
    const elapsed = Date.now() - started;
    const detectedType = service.detectType(output);
    const result = service.normalize(detectedType, output, originalPageCount);
    const score = scoreExtraction(fixture.expected, result.extractedData);
    for (const key of Object.keys(total) as (keyof BenchmarkScore)[])
      total[key] += score[key];
    durationMs += preparationMs + elapsed;
    tokens.input += usage?.input_tokens ?? 0;
    tokens.output += usage?.output_tokens ?? 0;
    tokens.total += usage?.total_tokens ?? 0;
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(outputDirectory, `${fixture.id}.json`),
      JSON.stringify(
        {
          model,
          detailViews,
          durationMs: elapsed,
          usage,
          score,
          result,
          providerOutput: output,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    // Only aggregate counts cross stdout; private readings stay in private files.
    console.info(
      `${fixture.id}: ${score.correct}/${score.checked} checks; ${preparationMs + elapsed} ms.`,
    );
  }
  console.info(
    JSON.stringify({
      fixtures: manifest.fixtures.length,
      transmitted: run,
      detailViews,
      ...(run ? { model, durationMs, tokens, ...total } : {}),
    }),
  );
}
if (require.main === module)
  void main().catch(() => {
    // Parser/provider errors can contain private source data; keep CLI failures generic.
    console.error(
      "Scooter benchmark failed. Check the private manifest, source files and provider configuration.",
    );
    process.exitCode = 1;
  });
