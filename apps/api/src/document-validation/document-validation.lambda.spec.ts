import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";
import { createDocumentValidationHandler } from "./document-validation.lambda";
import type { ValidateDocumentInput } from "./document-validation.types";

function setup(
  bytes = Buffer.from("ffd8ffe00000", "hex"),
  contentType: "image/jpeg" | "application/pdf" = "image/jpeg",
) {
  const input: ValidateDocumentInput = {
    source: {
      provider: "s3",
      bucket: "private",
      storageKey: "documents/scooter-documents/2026/source",
      contentType,
      byteSize: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      imageWidth: null,
      imageHeight: null,
      pageCount: null,
    },
    outputKey: "documents/extraction-temporary/job-1",
  };
  let saved: PutObjectCommand["input"] | undefined;
  const send = jest
    .fn<Promise<unknown>, [unknown]>()
    .mockImplementation((command: unknown) => {
      if (command instanceof ListObjectsV2Command)
        return Promise.resolve({
          Contents: saved ? [{ Key: input.outputKey }] : [],
        });
      if (command instanceof HeadObjectCommand) {
        if (!saved)
          return Promise.reject(
            Object.assign(new Error("private path"), { name: "NotFound" }),
          );
        return Promise.resolve({
          ContentType: saved.ContentType,
          ContentLength: saved.ContentLength,
          ChecksumSHA256: saved.ChecksumSHA256,
          Metadata: saved.Metadata,
          ChecksumType: "FULL_OBJECT",
        });
      }
      if (command instanceof GetObjectCommand)
        return Promise.resolve({
          Body: Readable.from([bytes]),
          ContentType: contentType,
          ContentLength: bytes.length,
        });
      if (command instanceof PutObjectCommand) {
        saved = command.input;
        return Promise.resolve({});
      }
      throw new Error("Unexpected S3 command");
    });
  const handler = createDocumentValidationHandler(
    { send },
    {
      bucket: "private",
      prefix: "documents",
      maxBytes: 15 * 1024 * 1024,
    },
  );
  return { input, handler, send, saved: () => saved };
}

describe("isolated document validation Lambda", () => {
  it("validates legacy sources without an S3 checksum, preserving originals in an immutable snapshot", async () => {
    const { handler, input, send, saved } = setup();
    await expect(handler(input)).resolves.toEqual({
      ok: true,
      document: {
        storageKey: input.outputKey,
        contentType: input.source.contentType,
        byteSize: input.source.byteSize,
        checksumSha256: input.source.checksumSha256,
      },
    });
    expect(saved()).toMatchObject({
      Key: input.outputKey,
      IfNoneMatch: "*",
      ChecksumSHA256: Buffer.from(input.source.checksumSha256, "hex").toString(
        "base64",
      ),
      Metadata: { "validation-revision": "1" },
    });
    expect(
      send.mock.calls.filter(
        ([command]) => command instanceof PutObjectCommand,
      ),
    ).toHaveLength(1);
    expect(saved()?.Key).not.toEqual(input.source.storageKey);
  });

  it("reuses a validated snapshot after a lost response without reading or writing document bytes again", async () => {
    const { handler, input, send } = setup();
    const initial = await handler(input);
    send.mockClear();
    await expect(handler(input)).resolves.toEqual(initial);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[1][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("does not reuse an output reserved for different source bytes", async () => {
    const { handler, input, send } = setup();
    await handler(input);
    send.mockClear();
    await expect(
      handler({
        ...input,
        source: { ...input.source, checksumSha256: "b".repeat(64) },
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE", retryable: false },
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    "documents/scooter-documents/overwrite",
    "documents/extraction-temporary/../invalid",
    "foreign/extraction-temporary/job-1",
  ])("rejects unsafe output %s before storage access", async (outputKey) => {
    const { handler, input, send } = setup();
    await expect(handler({ ...input, outputKey })).resolves.toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an original checksum mismatch before creating a snapshot", async () => {
    const { handler, input, saved } = setup();
    input.source.checksumSha256 = "c".repeat(64);
    await expect(handler(input)).resolves.toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" },
    });
    expect(saved()).toBeUndefined();
  });

  it.each([0, 11])(
    "validates the actual PDF page count (%i), not caller metadata",
    async (pages) => {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < pages; i++) pdf.addPage();
      const { handler, input, saved } = setup(
        Buffer.from(await pdf.save({ addDefaultPage: false })),
        "application/pdf",
      );
      input.source.pageCount = 1;
      await expect(handler(input)).resolves.toMatchObject({
        ok: false,
        error: {
          code: pages
            ? "DOCUMENT_EXTRACTION_TOO_MANY_PAGES"
            : "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
        },
      });
      expect(saved()).toBeUndefined();
    },
  );

  it("preserves ordinary PDFs byte-for-byte", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    const { handler, input, saved } = setup(bytes, "application/pdf");
    await expect(handler(input)).resolves.toMatchObject({ ok: true });
    expect(saved()?.Body).toEqual(bytes);
  });

  it("handles a conditional-write race by returning only a matching immutable winner", async () => {
    const { handler, input, send, saved } = setup();
    const normal = send.getMockImplementation()!;
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        await normal(command);
        throw Object.assign(new Error("private storage details"), {
          name: "PreconditionFailed",
        });
      }
      return normal(command);
    });
    await expect(handler(input)).resolves.toMatchObject({ ok: true });
    expect(saved()?.IfNoneMatch).toBe("*");
  });

  it("returns only stable errors for storage failures", async () => {
    const { handler, input, send } = setup();
    send.mockRejectedValue(new Error("private bucket/key details"));
    await expect(handler(input)).resolves.toEqual({
      ok: false,
      error: { code: "DOCUMENT_EXTRACTION_UNAVAILABLE", retryable: true },
    });
  });
});
