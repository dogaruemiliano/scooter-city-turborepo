import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { TemplateEngineError } from "./zip";

/**
 * Run only inside the private conversion worker/container, with network disabled and OS CPU/memory limits.
 * Never execute a caller-selected path. The deployment supplies an absolute, approved LibreOffice binary.
 * A unique profile/temp directory prevents cross-job document leakage and LibreOffice profile contention.
 */
export async function convertDocxToPdf(
  source: Buffer,
  binary: string,
): Promise<Buffer> {
  if (!binary || !isAbsolute(binary))
    throw new TemplateEngineError(
      "A configured absolute private DOCX converter binary is required.",
    );
  const directory = await mkdtemp(join(tmpdir(), "scootercity-contract-"));
  try {
    await writeFile(join(directory, "input.docx"), source, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        [
          "--headless",
          "--invisible",
          "--nodefault",
          "--norestore",
          "--nolockcheck",
          `-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`,
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          directory,
          join(directory, "input.docx"),
        ],
        {
          cwd: directory,
          env: {
            PATH: "/usr/bin:/bin",
            HOME: directory,
            TMPDIR: directory,
            LANG: "C.UTF-8",
          },
          timeout: 30_000,
          killSignal: "SIGKILL",
          maxBuffer: 64 * 1024,
          windowsHide: true,
        },
        (error) =>
          error
            ? reject(
                new TemplateEngineError(
                  "Private DOCX to PDF conversion failed or timed out.",
                ),
              )
            : resolve(),
      );
    });
    const result = await readFile(join(directory, "input.pdf"));
    if (
      result.length > 30 * 1024 * 1024 ||
      result.subarray(0, 5).toString("ascii") !== "%PDF-"
    )
      throw new TemplateEngineError(
        "The converter did not produce a supported PDF.",
      );
    return result;
  } catch (error) {
    if (error instanceof TemplateEngineError) throw error;
    throw new TemplateEngineError(
      "Private DOCX renderer is unavailable or produced no PDF.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
