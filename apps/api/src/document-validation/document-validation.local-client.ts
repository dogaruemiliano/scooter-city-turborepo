import type { InvokeCommand } from "@aws-sdk/client-lambda";
import { fork } from "node:child_process";
import { join } from "node:path";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import {
  DOCUMENT_VALIDATION_MAX_RUNTIME_MS,
  type DocumentValidationClient,
  type DocumentValidationInvocationResult,
} from "./document-validation.types";

/** Development only. The web process exchanges metadata; PDF parsing stays in the child. */
export class LocalDocumentValidationClient implements DocumentValidationClient {
  constructor(
    private readonly env: Env,
    private readonly workerPath = join(
      __dirname,
      "document-validation.local-worker.js",
    ),
  ) {
    if (env.NODE_ENV === "production")
      throw new Error(
        "Local document validation cannot be used in production.",
      );
  }

  send(
    command: InvokeCommand,
    { abortSignal }: { abortSignal: AbortSignal },
  ): Promise<DocumentValidationInvocationResult> {
    if (abortSignal.aborted) return Promise.reject(unavailable());
    const payload = command.input.Payload;
    if (!(payload instanceof Uint8Array)) return Promise.reject(unavailable());
    if (!payload || payload.length > 8192) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const child = fork(this.workerPath, [], {
        execArgv: ["--max-old-space-size=512"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        // Do not pass API keys, DB credentials or authentication keys to the parser.
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) =>
                key.startsWith("AWS_") ||
                ["HOME", "PATH", "NODE_EXTRA_CA_CERTS"].includes(key),
            ),
          ),
          NODE_ENV: "development",
          AWS_REGION: this.env.IMAGE_STORAGE_S3_REGION,
          DOCUMENT_VALIDATION_BUCKET: this.env.IMAGE_STORAGE_S3_BUCKET,
          DOCUMENT_VALIDATION_PREFIX: this.env.IMAGE_STORAGE_S3_PREFIX.replace(
            /^\/+|\/+$/g,
            "",
          ),
          DOCUMENT_VALIDATION_MAX_BYTES: String(
            this.env.IMAGE_STORAGE_MAX_BYTES,
          ),
          DOCUMENT_VALIDATION_KMS_KEY_ID: this.env.IMAGE_STORAGE_S3_KMS_KEY_ID,
        },
      });
      let settled = false;
      const finish = (
        error?: Error,
        output?: DocumentValidationInvocationResult,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abortSignal.removeEventListener("abort", abort);
        child.kill("SIGKILL");
        if (error) reject(error);
        else resolve(output!);
      };
      const abort = () => finish(unavailable());
      const timer = setTimeout(
        () =>
          finish(
            new DocumentExtractionError(
              "DOCUMENT_EXTRACTION_TIMEOUT",
              "Document validation timed out.",
              true,
            ),
          ),
        DOCUMENT_VALIDATION_MAX_RUNTIME_MS,
      );
      abortSignal.addEventListener("abort", abort, { once: true });
      child.once("error", () => finish(unavailable()));
      child.once("exit", () => finish(unavailable()));
      child.once("message", (message: unknown) => {
        try {
          const result = Buffer.from(JSON.stringify(message));
          if (result.length > 8192) return finish(unavailable());
          finish(undefined, {
            StatusCode: 200,
            Payload: result,
          });
        } catch {
          finish(unavailable());
        }
      });
      if (abortSignal.aborted) return abort();
      try {
        child.send(
          JSON.parse(Buffer.from(payload).toString("utf8")) as Record<
            string,
            unknown
          >,
          (error) => {
            if (error) finish(unavailable());
          },
        );
      } catch {
        finish(unavailable());
      }
    });
  }
}

function unavailable() {
  return new DocumentExtractionError(
    "DOCUMENT_EXTRACTION_UNAVAILABLE",
    "Document validation could not be completed.",
    true,
  );
}
