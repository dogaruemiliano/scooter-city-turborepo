import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");
const requireFromApi = createRequire(resolve(root, "apps/api/package.json"));
const { build } = requireFromApi("esbuild");
const output = resolve(directory, "dist");
await mkdir(output, { recursive: true });
const result = await build({
  entryPoints: [
    resolve(
      root,
      "apps/api/src/document-validation/document-validation.lambda.ts",
    ),
  ],
  outfile: resolve(output, "index.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  minify: true,
  // PDF parsers may warn with fragments read from a document. Return stable
  // errors only; AWS runtime duration/memory logs remain available.
  drop: ["console"],
  sourcemap: false,
  metafile: true,
  logLevel: "warning",
});
const dependencies = Object.keys(result.metafile.inputs);
if (
  dependencies.some((file) =>
    /(?:@napi-rs\/canvas|pdfjs-dist|@nestjs\/|prisma|openai)/.test(file),
  )
) {
  throw new Error(
    "Validation artifact contains an unrelated application/rendering dependency",
  );
}
await writeFile(
  resolve(output, "dependencies.json"),
  JSON.stringify(dependencies.sort(), null, 2) + "\n",
);
const zipped = spawnSync(
  "zip",
  [
    "-q",
    "-j",
    resolve(output, "document-validation.zip"),
    resolve(output, "index.cjs"),
  ],
  { stdio: "inherit" },
);
if (zipped.status !== 0)
  throw new Error("Could not package Lambda ZIP; install the zip command");
console.log(`Built ${resolve(output, "document-validation.zip")}`);
