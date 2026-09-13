import { OpenAiPersonDocumentExtractionProvider } from "./openai-person-document-extraction.provider";
import type { AnalyzePersonDocumentInput } from "./person-document-extraction.types";

const input: AnalyzePersonDocumentInput = {
  documentType: "nationalId",
  nationalIdFormat: "electronic",
  sources: [
    { slot: "front", contentType: "image/jpeg", bytes: Buffer.from("fixture") },
    { slot: "back", contentType: "image/png", bytes: Buffer.from("reverse") },
  ],
};
const output = {
  detectedDocumentType: "nationalId",
  suggestions: [],
  licenseCategories: [],
  warnings: ["noData"],
};

function completedResponse(value: unknown = output): Response {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
}

function setup(response = completedResponse(), timeoutMs = 45_000) {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn();
  fetcher.mockResolvedValue(response);
  const provider = new OpenAiPersonDocumentExtractionProvider(
    { apiKey: "test-secret-key", model: "gpt-4.1-mini-2025-04-14", timeoutMs },
    fetcher,
  );
  return { provider, fetcher };
}

function requestBody(request?: RequestInit): Record<string, unknown> {
  if (typeof request?.body !== "string") {
    throw new Error("Expected JSON string request body.");
  }
  return JSON.parse(request.body) as Record<string, unknown>;
}

describe("OpenAI person-document extraction", () => {
  it.each(["development", "production", "test", undefined])(
    "logs raw extraction output only in development (NODE_ENV=%s)",
    async (nodeEnv) => {
      const env = jest.replaceProperty(process, "env", {
        ...process.env,
        NODE_ENV: nodeEnv,
      });
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        const { provider } = setup();
        await expect(provider.analyze(input)).resolves.toEqual(output);
        if (nodeEnv === "development") {
          expect(log).toHaveBeenCalledTimes(1);
          expect(log).toHaveBeenCalledWith(
            "[person-document-extraction] raw model output",
            JSON.stringify(output),
          );
        } else {
          expect(log).not.toHaveBeenCalled();
        }
      } finally {
        log.mockRestore();
        env.restore();
      }
    },
  );

  it("sends labelled image bytes with strict structured output, bounded tokens and storage disabled", async () => {
    const { provider, fetcher } = setup();

    await expect(provider.analyze(input)).resolves.toEqual(output);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = requestBody(request);
    expect(body.instructions).toContain(
      "Extract ONLY the SECOND address block",
    );
    expect(body.instructions).toContain(
      "Loc naștere / Lieu de naissance / Place of birth",
    );
    expect(body.instructions).toContain(
      "Every person suggestion must include addressEvidence",
    );
    expect(body).toMatchObject({
      model: "gpt-4.1-mini-2025-04-14",
      store: false,
      max_output_tokens: 4_000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Requested document type: nationalId. National ID format: electronic.",
            },
            { type: "input_text", text: "Source slot: front" },
            {
              type: "input_image",
              image_url: "data:image/jpeg;base64,Zml4dHVyZQ==",
              detail: "high",
            },
            { type: "input_text", text: "Source slot: back" },
            {
              type: "input_image",
              image_url: "data:image/png;base64,cmV2ZXJzZQ==",
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "detectedDocumentType",
              "suggestions",
              "licenseCategories",
              "warnings",
            ],
          },
        },
      },
    });
    expect(request?.headers).toEqual({
      Authorization: "Bearer test-secret-key",
      "Content-Type": "application/json",
    });
  });

  it("sends proof-of-address PDFs inline without a Files API upload", async () => {
    const { provider, fetcher } = setup();
    await provider.analyze({
      documentType: "proofOfAddress",
      sources: [
        {
          slot: "front",
          contentType: "application/pdf",
          bytes: Buffer.from("%PDF-fixture"),
        },
      ],
    });

    const body = requestBody(fetcher.mock.calls[0][1]);
    expect(body.instructions).toContain(
      'Romanian "Certificat privind domiciliul/reședința înregistrat în Registrul Național de Evidență a Persoanelor"',
    );
    expect(body.instructions).toContain(
      "return detectedDocumentType=proofOfAddress",
    );
    expect(body.instructions).toContain(
      "this restriction does not apply to proofOfAddress requests",
    );
    expect(body).toMatchObject({
      input: [
        {
          content: [
            { type: "input_text" },
            { type: "input_text", text: "Source slot: front" },
            {
              type: "input_file",
              filename: "front.pdf",
              file_data: "data:application/pdf;base64,JVBERi1maXh0dXJl",
            },
          ],
        },
      ],
    });
  });

  it("rejects refusal without exposing refusal text", async () => {
    const { provider } = setup(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "private content" }],
          },
        ],
      }),
    );

    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      retryable: false,
    });
  });

  it.each(["incomplete", "failed", "in_progress"])(
    "rejects %s output instead of applying partial JSON",
    async (status) => {
      const { provider } = setup(Response.json({ status, output: [] }));
      await expect(provider.analyze(input)).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_FAILED",
      });
    },
  );

  it.each([
    [429, "DOCUMENT_EXTRACTION_THROTTLED"],
    [401, "DOCUMENT_EXTRACTION_UNAVAILABLE"],
    [500, "DOCUMENT_EXTRACTION_UNAVAILABLE"],
  ])(
    "maps HTTP %i to a safe application error without leaking provider content",
    async (status, code) => {
      const { provider } = setup(
        new Response("test-secret-key private document", {
          status: Number(status),
        }),
      );
      const error: unknown = await provider
        .analyze(input)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain("private document");
      expect(String(error)).not.toContain("test-secret-key");
      expect(error).not.toHaveProperty("cause");
    },
  );

  it("aborts timed-out requests without retrying", async () => {
    const { provider, fetcher } = setup(completedResponse(), 5);
    fetcher.mockImplementation(
      (_url, request) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener("abort", () =>
            reject(new Error("private provider error")),
          );
        }),
    );

    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
      message:
        "Document extraction timed out. Try again or enter details manually.",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds the streamed response even when content-length is absent", async () => {
    const { provider } = setup(new Response("x".repeat(128 * 1024 + 1)));
    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
  });

  it("rejects malformed JSON and sanitized network errors", async () => {
    const { provider, fetcher } = setup(new Response("not-json"));
    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
    fetcher.mockRejectedValue(
      new Error("private request body test-secret-key"),
    );
    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
      message:
        "Document extraction did not return usable data. Enter details manually.",
    });
  });
});
