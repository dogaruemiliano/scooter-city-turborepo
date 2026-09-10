import "dotenv/config";

import { TextractClient } from "@aws-sdk/client-textract";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

import { TEXTRACT_SYNC_MAX_BYTES } from "../document-extraction.constants";
import { DocumentExtractionError } from "../document-extraction.errors";
import { AwsTextractExpenseProvider } from "../providers/aws-textract-expense.provider";

const PRIVATE_RECEIPTS_DIRECTORY = resolve(
  process.cwd(),
  "../../test-assets/private/textract/receipts",
);
const PRIVATE_RESULTS_DIRECTORY = resolve(
  process.cwd(),
  "../../test-assets/private/textract/results",
);
const SUPPORTED_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp"]);

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const requestedFile = optionValue("--file");
  const availableNames = (await readdir(PRIVATE_RECEIPTS_DIRECTORY))
    .filter((name) => SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();
  const names = requestedFile
    ? availableNames.filter((name) => name === requestedFile)
    : availableNames;

  if (requestedFile && names.length === 0) {
    throw new Error(
      `Receipt ${requestedFile} was not found in ${PRIVATE_RECEIPTS_DIRECTORY}.`,
    );
  }

  if (names.length === 0) {
    throw new Error(
      `No private receipt images found in ${PRIVATE_RECEIPTS_DIRECTORY}`,
    );
  }

  const documents = await Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(resolve(PRIVATE_RECEIPTS_DIRECTORY, name));
      if (bytes.byteLength > TEXTRACT_SYNC_MAX_BYTES) {
        throw new Error(`${name} exceeds the 10 MB synchronous limit.`);
      }
      return { name, bytes };
    }),
  );

  if (dryRun) {
    console.info(
      `Validated ${documents.length} private receipt image(s); no files were transmitted.`,
    );
    return;
  }

  const region =
    process.env.DOCUMENT_EXTRACTION_AWS_REGION ??
    process.env.IMAGE_STORAGE_S3_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error(
      "Set IMAGE_STORAGE_S3_REGION or AWS_REGION before running the Textract benchmark.",
    );
  }

  await mkdir(PRIVATE_RESULTS_DIRECTORY, { recursive: true });
  const provider = new AwsTextractExpenseProvider(
    new TextractClient({ region }),
  );

  for (const document of documents) {
    const result = await provider.analyzeExpense({
      source: { kind: "bytes", bytes: document.bytes },
    });
    const outputName = `${basename(document.name, extname(document.name))}.analyze-expense.json`;
    await writeFile(
      resolve(PRIVATE_RESULTS_DIRECTORY, outputName),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const summaryCount = result.documents.reduce(
      (count, item) => count + item.summaryFields.length,
      0,
    );
    console.info(
      `${document.name}: analyzed ${result.documents.length} document(s), ${summaryCount} summary field(s); private result saved.`,
    );
  }
}

function optionValue(option: string): string | undefined {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${option}=`),
  );
  if (inline) return inline.slice(option.length + 1);

  const index = process.argv.indexOf(option);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}

void main().catch((error: unknown) => {
  if (error instanceof DocumentExtractionError) {
    console.error(`${error.code}: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Textract benchmark failed.");
  }
  process.exitCode = 1;
});
