import type { Env } from "../config/env";
import { OpenAiScooterDocumentJobProvider } from "./openai-scooter-document-job.provider";

const env = {
  NODE_ENV: "test",
  SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
  SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "test-secret",
  SCOOTER_DOCUMENT_EXTRACTION_MODEL: "gpt-5.4-2026-03-05",
} as Env;
const input = {
  jobId: "job-1",
  documentType: "civ" as const,
  contentType: "application/pdf",
  url: "https://private-bucket.s3.amazonaws.com/document.pdf?signature=private",
};
function setup(response: Response) {
  const fetcher: jest.MockedFunction<typeof fetch> = jest
    .fn()
    .mockResolvedValue(response);
  return {
    fetcher,
    provider: new OpenAiScooterDocumentJobProvider(env, fetcher),
  };
}
const completed = (parts: unknown[], metadata = { jobId: "job-1" }) =>
  Response.json({
    id: "resp_123",
    status: "completed",
    metadata,
    output: [{ type: "message", content: parts }],
  });

describe("OpenAI background scooter extraction", () => {
  it("classifies an unlabelled document and extracts in one request with all type-specific rules", async () => {
    const { provider, fetcher } = setup(
      Response.json({ id: "resp_123", status: "queued" }),
    );
    await provider.start({ ...input, documentType: "unclassified" });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string) as {
      instructions: string;
      max_output_tokens: number;
    };
    expect(body.max_output_tokens).toBe(20_000);
    expect(body.instructions).toContain("First identify the document type");
    expect(body.instructions).toContain("several distinct document types");
    expect(body.instructions).toContain("ASIGURAT");
    expect(body.instructions).toContain("current Romanian registration");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a definite submission rejection from an ambiguous provider failure", async () => {
    await expect(
      setup(new Response(null, { status: 429 })).provider.start(input),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_THROTTLED",
      submissionRejected: true,
    });
    const error = await setup(new Response(null, { status: 500 }))
      .provider.start(input)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "DOCUMENT_EXTRACTION_UNAVAILABLE" });
    expect(error).not.toHaveProperty("submissionRejected");
  });
  it.each(["application/pdf", "image/png"])(
    "sends a signed %s URL with background execution and no document bytes",
    async (contentType) => {
      const { provider, fetcher } = setup(
        Response.json({ id: "resp_123", status: "queued" }),
      );
      await expect(provider.start({ ...input, contentType })).resolves.toEqual({
        id: "resp_123",
        status: "queued",
      });
      const body: unknown = JSON.parse(
        fetcher.mock.calls[0][1]!.body as string,
      );
      expect(body).toMatchObject({
        background: true,
        store: false,
        metadata: { jobId: "job-1" },
        model: env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
        max_output_tokens: 20_000,
        input: [
          {
            content: [
              contentType === "application/pdf"
                ? { type: "input_file", file_url: input.url, detail: "high" }
                : {
                    type: "input_image",
                    image_url: input.url,
                    detail: "original",
                  },
            ],
          },
        ],
      });
      expect(JSON.stringify(body)).not.toMatch(/base64|file_data/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("returns correlation metadata and parses a completed structured result", async () => {
    const output = { vin: null, fields: [], rawFields: [] };
    const { provider } = setup(
      completed([{ type: "output_text", text: JSON.stringify(output) }]),
    );
    await expect(provider.retrieve("resp_123")).resolves.toEqual({
      id: "resp_123",
      status: "completed",
      jobId: "job-1",
      output,
    });
  });

  it.each([
    [{ type: "refusal", text: "private refusal" }],
    [{ type: "output_text", text: "invalid" }],
    [
      { type: "output_text", text: "{}" },
      { type: "output_text", text: "{}" },
    ],
  ])(
    "preserves the resource ID and correlation when output is unusable",
    async (...parts) => {
      const { provider } = setup(completed(parts));
      await expect(provider.retrieve("resp_123")).resolves.toMatchObject({
        id: "resp_123",
        jobId: "job-1",
        errorCode: "DOCUMENT_EXTRACTION_FAILED",
      });
    },
  );

  it("does not treat missing provider data as successful extraction", async () => {
    const { provider } = setup(new Response(null, { status: 404 }));
    await expect(provider.retrieve("resp_123")).resolves.toMatchObject({
      missing: true,
      status: "failed",
    });
  });

  it.each(["cancel", "delete"] as const)(
    "%s is idempotent for already absent responses",
    async (method) => {
      const { provider } = setup(new Response(null, { status: 404 }));
      await expect(provider[method]("resp_123")).resolves.toBeUndefined();
    },
  );

  it("leaves failed cleanup retryable without exposing provider data", async () => {
    const { provider } = setup(
      new Response("secret provider detail", { status: 500 }),
    );
    await expect(provider.delete("resp_123")).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
      retryable: true,
      message: "Document analysis could not be completed.",
    });
  });

  it.each(["../../files", "resp_123?redirect=evil", ""])(
    "rejects invalid resource identifier %s before a request",
    async (id) => {
      const { provider, fetcher } = setup(new Response());
      await expect(provider.retrieve(id)).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "bounds result bytes including unknown content length (declared=%s)",
    async (declared) => {
      const { provider } = setup(
        new Response(
          "x".repeat(512 * 1024 + 1),
          declared
            ? { headers: { "content-length": String(512 * 1024 + 1) } }
            : undefined,
        ),
      );
      await expect(provider.retrieve("resp_123")).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_FAILED",
      });
    },
  );

  it("cancels a stalled result body at the HTTP deadline", async () => {
    jest.useFakeTimers();
    try {
      const cancel = jest.fn();
      const { provider } = setup(new Response(new ReadableStream({ cancel })));
      const result = provider
        .retrieve("resp_123")
        .catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(15_000);
      expect(await result).toMatchObject({
        code: "DOCUMENT_EXTRACTION_TIMEOUT",
      });
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not submit work after caller cancellation", async () => {
    const { provider, fetcher } = setup(new Response());
    await expect(
      provider.start(input, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TIMEOUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps fake fixtures recoverable across provider instances", async () => {
    const fakeEnv = {
      ...env,
      SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
    } as Env;
    const job = await new OpenAiScooterDocumentJobProvider(fakeEnv).start(
      input,
    );
    await expect(
      new OpenAiScooterDocumentJobProvider(fakeEnv).retrieve(job.id),
    ).resolves.toMatchObject({
      status: "completed",
      jobId: input.jobId,
      output: { detectedDocumentType: "civ" },
    });
  });
});
