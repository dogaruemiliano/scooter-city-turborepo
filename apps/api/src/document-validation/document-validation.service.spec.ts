import { InvokeCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import { loadEnv } from "../config/env";
import { DocumentValidationService } from "./document-validation.service";
import type { ValidateDocumentInput } from "./document-validation.types";

const input: ValidateDocumentInput = {
  source: {
    provider: "s3",
    bucket: "private",
    storageKey: "documents/scooter-documents/2026/source.pdf",
    contentType: "application/pdf",
    byteSize: 100,
    checksumSha256: "a".repeat(64),
    pageCount: null,
    imageWidth: null,
    imageHeight: null,
  },
  outputKey: "documents/extraction-temporary/job-1",
};

function setup(overrides: NodeJS.ProcessEnv = {}) {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    IMAGE_STORAGE_S3_BUCKET: "private",
    IMAGE_STORAGE_S3_PREFIX: "documents",
    SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
    SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "synthetic-key",
    SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME: "validator",
    ...overrides,
  });
  const document = {
    storageKey: input.outputKey,
    contentType: input.source.contentType,
    byteSize: 120,
    checksumSha256: "b".repeat(64),
  };
  const send = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
    StatusCode: 200,
    Payload: Buffer.from(JSON.stringify({ ok: true, document })),
  });
  return {
    service: new DocumentValidationService(env, {
      send,
    } as unknown as LambdaClient),
    send,
    document,
  };
}

describe("DocumentValidationService", () => {
  it("sends only trusted metadata to remote Lambda and binds its result to the reserved key", async () => {
    const { service, send, document } = setup();
    await expect(service.validate(input)).resolves.toEqual(document);
    const command = send.mock.calls[0][0] as InvokeCommand;
    expect(command.input).toMatchObject({
      FunctionName: "validator",
      InvocationType: "RequestResponse",
    });
    expect(
      JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString()),
    ).toEqual(input);
    expect(command.input.LogType).toBeUndefined();
  });

  it.each([
    { ...input, outputKey: input.source.storageKey },
    { ...input, outputKey: "documents/extraction-temporary/../source" },
    { ...input, source: { ...input.source, bucket: "other" } },
    {
      ...input,
      source: {
        ...input.source,
        storageKey: "documents/personal-documents/source.pdf",
      },
    },
    { ...input, source: { ...input.source, checksumSha256: "invalid" } },
  ])(
    "rejects invalid source/key metadata without invoking Lambda",
    async (invalid) => {
      const { service, send } = setup();
      await expect(service.validate(invalid)).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("preserves stable validation errors without exposing remote details", async () => {
    const { service, send } = setup();
    send.mockResolvedValue({
      StatusCode: 200,
      Payload: Buffer.from(
        JSON.stringify({
          ok: false,
          error: {
            code: "DOCUMENT_EXTRACTION_ENCRYPTED_DOCUMENT",
            retryable: false,
            message: "private source",
          },
        }),
      ),
    });
    await expect(service.validate(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_ENCRYPTED_DOCUMENT",
      retryable: false,
      message: "Document validation could not be completed.",
    });
  });

  it.each([
    {
      FunctionError: "Unhandled",
      StatusCode: 200,
      Payload: Buffer.from("private parser error"),
    },
    { StatusCode: 200, Payload: Buffer.from("private non-JSON") },
    { StatusCode: 200, Payload: Buffer.alloc(8193) },
  ])("sanitizes provider failures", async (result) => {
    const { service, send } = setup();
    send.mockResolvedValue(result);
    await expect(service.validate(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
      message: "Document validation could not be completed.",
    });
  });

  it.each([
    { storageKey: "documents/extraction-temporary/some-other-job" },
    { contentType: "image/png" },
    { byteSize: 0 },
    { byteSize: 16 * 1024 * 1024 },
    { checksumSha256: "bad" },
  ])("rejects malformed or mismatched validation results", async (changes) => {
    const { service, send, document } = setup();
    send.mockResolvedValue({
      StatusCode: 200,
      Payload: Buffer.from(
        JSON.stringify({ ok: true, document: { ...document, ...changes } }),
      ),
    });
    await expect(service.validate(input)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_FAILED",
    });
  });

  it("does no work for an already cancelled job", async () => {
    const { service, send } = setup();
    await expect(
      service.validate(input, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_UNAVAILABLE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps fake fixture validation explicitly local and performs no AWS work", async () => {
    const { service, send } = setup({
      SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
    });
    await expect(service.validate(input)).resolves.toEqual({
      storageKey: input.outputKey,
      contentType: input.source.contentType,
      byteSize: input.source.byteSize,
      checksumSha256: input.source.checksumSha256,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
