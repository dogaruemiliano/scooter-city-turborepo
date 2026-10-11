import { Logger } from "@nestjs/common";
import { z } from "zod";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { scooterDocumentExtractionPrompt } from "./scooter-document-extraction.prompt";
import { scooterDocumentModelJsonSchema } from "./scooter-document-extraction.schema";
import { renderScooterPdfDetails } from "./scooter-document-pdf-details";
import type {
  AnalyzeScooterDocumentInput,
  ScooterDocumentExtractionProvider,
} from "./scooter-document-extraction.types";

const MAX_RESPONSE_BYTES = 256 * 1024;
const responseSchema = z.object({
  status: z.literal("completed"),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});

export class OpenAiScooterDocumentExtractionProvider implements ScooterDocumentExtractionProvider {
  private readonly logger = new Logger(
    OpenAiScooterDocumentExtractionProvider.name,
  );
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      timeoutMs: number;
    },
    private readonly fetcher: typeof fetch = fetch,
    private readonly renderPdfDetails = renderScooterPdfDetails,
  ) {}

  async analyze(input: AnalyzeScooterDocumentInput): Promise<unknown> {
    const startedAt = Date.now();
    let outcome = "DOCUMENT_EXTRACTION_FAILED";
    let usage:
      | { input_tokens: number; output_tokens: number; total_tokens: number }
      | undefined;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    else input.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      abort,
      Math.min(90_000, Math.max(1, this.options.timeoutMs)),
    );
    try {
      controller.signal.throwIfAborted();
      const usesOriginalDetail =
        this.options.model === "gpt-5.4" ||
        /^gpt-5\.4-\d{4}-\d{2}-\d{2}$/.test(this.options.model);
      const dataUrl = `data:${input.contentType};base64,${Buffer.from(input.bytes).toString("base64")}`;
      const source =
        input.contentType === "application/pdf"
          ? {
              type: "input_file",
              filename: "document.pdf",
              file_data: dataUrl,
              detail: "high",
            }
          : {
              type: "input_image",
              image_url: dataUrl,
              // GPT-5.4 supports original detail for small text. Preserve
              // compatibility with older explicitly configured models.
              detail: usesOriginalDetail ? "original" : "high",
            };
      const details =
        input.contentType === "application/pdf"
          ? await this.renderPdfDetails(input.bytes, controller.signal)
          : [];
      controller.signal.throwIfAborted();
      const content = [
        source,
        ...details.flatMap((detail) => [
          {
            type: "input_text",
            text: `Magnified view of source page ${detail.page}, ${detail.region}. This is the same document, not a separate source.`,
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${Buffer.from(detail.bytes).toString("base64")}`,
            detail: usesOriginalDetail ? "original" : "high",
          },
        ]),
      ];
      const response = await this.fetcher(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.options.model,
            store: false,
            ...(usesOriginalDetail ? { reasoning: { effort: "low" } } : {}),
            max_output_tokens:
              input.documentType === "civ" ||
              input.documentType === "import_document"
                ? 12_000
                : 4_000,
            instructions: scooterDocumentExtractionPrompt(input.documentType),
            input: [{ role: "user", content }],
            text: {
              format: {
                type: "json_schema",
                name: "scooter_document_extraction",
                strict: true,
                schema: scooterDocumentModelJsonSchema,
              },
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new DocumentExtractionError(
          response.status === 429
            ? "DOCUMENT_EXTRACTION_THROTTLED"
            : "DOCUMENT_EXTRACTION_UNAVAILABLE",
          "Document extraction is temporarily unavailable.",
          true,
        );
      }
      const body: unknown = JSON.parse(
        await readBoundedBody(response, controller.signal),
      );
      const responseValue = responseSchema.safeParse(body);
      if (!responseValue.success) throw invalidResponse();
      usage = responseValue.data.usage;
      const parts = responseValue.data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? []);
      if (parts.some((part) => part.type === "refusal")) {
        // A provider refusal says nothing about file validity or visual clarity.
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_FAILED",
          "This document could not be analyzed. Enter its details manually.",
          false,
        );
      }
      const textParts = parts.filter(
        (part) => part.type === "output_text" && typeof part.text === "string",
      );
      if (textParts.length !== 1) throw invalidResponse();
      const result: unknown = JSON.parse(textParts[0].text!);
      outcome = "completed";
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        outcome = "DOCUMENT_EXTRACTION_TIMEOUT";
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_TIMEOUT",
          "Document extraction was interrupted. Try again or enter details manually.",
          true,
        );
      }
      if (error instanceof DocumentExtractionError) {
        outcome = error.code;
        throw error;
      }
      // Never log or expose provider bodies, errors/causes or document content.
      throw invalidResponse();
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      this.logger.debug({
        event: "scooter_document_extraction",
        model: this.options.model,
        documentType: input.documentType,
        durationMs: Date.now() - startedAt,
        outcome,
        ...(usage ? { usage } : {}),
      });
    }
  }
}

function invalidResponse(): DocumentExtractionError {
  return new DocumentExtractionError(
    "DOCUMENT_EXTRACTION_FAILED",
    "Document extraction returned unusable data. Enter details manually.",
    true,
  );
}

async function readBoundedBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw invalidResponse();
  }
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  const abort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw invalidResponse();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
