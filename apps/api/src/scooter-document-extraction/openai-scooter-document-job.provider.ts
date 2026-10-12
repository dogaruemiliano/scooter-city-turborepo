import { Inject, Injectable, Optional } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import type { DocumentExtractionErrorCode } from "../document-extraction/document-extraction.errors";
import { scooterDocumentExtractionPrompt } from "./scooter-document-extraction.prompt";
import { scooterDocumentModelJsonSchema } from "./scooter-document-extraction.schema";

export const SCOOTER_JOB_FETCH = Symbol("SCOOTER_JOB_FETCH");
const API = "https://api.openai.com/v1/responses";
const HTTP_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const responseId = z
  .string()
  .regex(/^resp_[A-Za-z0-9_-]+$/)
  .max(512);
const responseSchema = z.object({
  id: responseId,
  status: z.enum([
    "queued",
    "in_progress",
    "completed",
    "failed",
    "cancelled",
    "incomplete",
  ]),
  metadata: z.object({ jobId: z.string().max(120).optional() }).nullish(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z
          .array(z.object({ type: z.string(), text: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
});

export interface ScooterProviderJob {
  id: string;
  status: z.infer<typeof responseSchema>["status"];
  jobId?: string;
  output?: unknown;
  errorCode?: DocumentExtractionErrorCode;
  missing?: boolean;
}

/** Only small control requests cross the API process. Documents are fetched from S3 by OpenAI. */
@Injectable()
export class OpenAiScooterDocumentJobProvider {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional()
    @Inject(SCOOTER_JOB_FETCH)
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async start(
    input: {
      jobId: string;
      documentType: v1.scooters.ScooterDocumentType;
      url: string;
      contentType: string;
    },
    signal?: AbortSignal,
  ): Promise<ScooterProviderJob> {
    if (
      this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake" &&
      this.env.NODE_ENV !== "production"
    ) {
      return {
        id: `resp_fake_${Buffer.from(JSON.stringify({ jobId: input.jobId, documentType: input.documentType })).toString("base64url")}`,
        status: "queued",
      };
    }
    if (this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER !== "openai")
      throw rejectedSubmission("DOCUMENT_EXTRACTION_DISABLED");
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw rejectedSubmission("DOCUMENT_EXTRACTION_INVALID_SOURCE");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw rejectedSubmission("DOCUMENT_EXTRACTION_INVALID_SOURCE");
    const original = /^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/.test(
      this.env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
    );
    const source =
      input.contentType === "application/pdf"
        ? { type: "input_file", file_url: input.url, detail: "high" }
        : {
            type: "input_image",
            image_url: input.url,
            detail: original ? "original" : "high",
          };
    const raw = await this.request(
      "",
      "POST",
      {
        model: this.env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
        background: true,
        store: false,
        metadata: { jobId: input.jobId },
        ...(original ? { reasoning: { effort: "low" } } : {}),
        max_output_tokens: ["civ", "import_document"].includes(
          input.documentType,
        )
          ? 12_000
          : 4_000,
        instructions: scooterDocumentExtractionPrompt(input.documentType),
        input: [{ role: "user", content: [source] }],
        text: {
          format: {
            type: "json_schema",
            name: "scooter_document_extraction",
            strict: true,
            schema: scooterDocumentModelJsonSchema,
          },
        },
      },
      signal,
    );
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw failure();
    // Preserve the ID even if an immediately completed response has invalid output.
    return { id: parsed.data.id, status: parsed.data.status };
  }

  async retrieve(
    id: string,
    signal?: AbortSignal,
  ): Promise<ScooterProviderJob> {
    this.checkId(id);
    if (this.isFake(id)) {
      const value = JSON.parse(
        Buffer.from(id.slice("resp_fake_".length), "base64url").toString(
          "utf8",
        ),
      ) as { jobId: string; documentType: string };
      return {
        id,
        status: "completed",
        jobId: value.jobId,
        output: {
          detectedDocumentType: value.documentType,
          vin: null,
          fields: [],
          rawFields: [],
        },
      };
    }
    const raw = await this.request(`/${id}`, "GET", undefined, signal, true);
    if (raw === null)
      return {
        id,
        status: "failed",
        missing: true,
        errorCode: "DOCUMENT_EXTRACTION_FAILED",
      };
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.id !== id) throw failure();
    const data = parsed.data;
    const result: ScooterProviderJob = {
      id,
      status: data.status,
      ...(data.metadata?.jobId ? { jobId: data.metadata.jobId } : {}),
    };
    if (data.status === "failed" || data.status === "incomplete")
      return { ...result, errorCode: "DOCUMENT_EXTRACTION_FAILED" };
    if (data.status !== "completed") return result;
    const parts = (data.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []);
    const texts = parts.filter(
      (part) => part.type === "output_text" && typeof part.text === "string",
    );
    if (parts.some((part) => part.type === "refusal") || texts.length !== 1)
      return { ...result, errorCode: "DOCUMENT_EXTRACTION_FAILED" };
    try {
      return { ...result, output: JSON.parse(texts[0].text!) as unknown };
    } catch {
      return { ...result, errorCode: "DOCUMENT_EXTRACTION_FAILED" };
    }
  }

  async cancel(id: string, signal?: AbortSignal): Promise<void> {
    this.checkId(id);
    if (this.isFake(id)) return;
    await this.request(`/${id}/cancel`, "POST", undefined, signal, true);
  }

  async delete(id: string, signal?: AbortSignal): Promise<void> {
    this.checkId(id);
    if (this.isFake(id)) return;
    await this.request(`/${id}`, "DELETE", undefined, signal, true);
  }

  private isFake(id: string): boolean {
    return (
      this.env.NODE_ENV !== "production" &&
      this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake" &&
      id.startsWith("resp_fake_")
    );
  }

  private checkId(id: string): void {
    if (!responseId.safeParse(id).success)
      throw failure("DOCUMENT_EXTRACTION_INVALID_SOURCE");
  }

  private async request(
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
    absentIsSuccess = false,
  ): Promise<unknown> {
    if (!this.env.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY)
      throw rejectedSubmission("DOCUMENT_EXTRACTION_DISABLED");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, HTTP_TIMEOUT_MS);
    try {
      controller.signal.throwIfAborted();
      const response = await this.fetcher(API + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.env.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        redirect: "error",
      });
      if (absentIsSuccess && response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const code =
          response.status === 429
            ? "DOCUMENT_EXTRACTION_THROTTLED"
            : "DOCUMENT_EXTRACTION_UNAVAILABLE";
        throw response.status >= 400 && response.status < 500
          ? rejectedSubmission(code)
          : failure(code);
      }
      if (response.status === 204) return null;
      return await readBody(response, controller.signal);
    } catch (error) {
      if (controller.signal.aborted)
        throw failure("DOCUMENT_EXTRACTION_TIMEOUT");
      if (error instanceof DocumentExtractionError) throw error;
      // Provider exceptions and request URLs can contain private document links.
      throw failure("DOCUMENT_EXTRACTION_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function failure(
  code: DocumentExtractionErrorCode = "DOCUMENT_EXTRACTION_FAILED",
) {
  return new DocumentExtractionError(
    code,
    "Document analysis could not be completed.",
    code !== "DOCUMENT_EXTRACTION_INVALID_SOURCE" &&
      code !== "DOCUMENT_EXTRACTION_DISABLED",
  );
}

/** A definite rejection may be retried explicitly; an ambiguous submission may not. */
function rejectedSubmission(code: DocumentExtractionErrorCode) {
  return Object.assign(failure(code), { submissionRejected: true as const });
}

async function readBody(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw failure();
  }
  if (!response.body) throw failure();
  const reader = response.body.getReader();
  const abort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw failure();
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw failure();
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
