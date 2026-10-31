import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Logger } from "nestjs-pino";

import { loadEnv, type Env } from "../config/env";
import type { S3Presigner, S3PresignOptions } from "./image-storage.module";
import { ImageStorageService } from "./image-storage.service";
import type { StoredDocument } from "./image-storage.types";

type SendMock = jest.Mock<unknown, [unknown]>;
type PresignMock = jest.Mock<
  Promise<string>,
  [PutObjectCommand | GetObjectCommand, number, S3PresignOptions?]
>;
interface LoggerMock {
  error: jest.Mock;
}

function s3Error(name: string): Error & { name: string } {
  const error = new Error(name) as Error & { name: string };
  error.name = name;
  return error;
}

function testEnv(overrides: NodeJS.ProcessEnv = {}): Env {
  return loadEnv({
    ...process.env,
    IMAGE_STORAGE_DRIVER: "s3",
    IMAGE_STORAGE_MAX_BYTES: "32",
    IMAGE_STORAGE_S3_BUCKET: "private-bucket",
    IMAGE_STORAGE_S3_REGION: "eu-central-1",
    IMAGE_STORAGE_S3_PREFIX: "document-photos-test",
    IMAGE_STORAGE_SIGNED_URL_TTL_SECONDS: "300",
    IMAGE_STORAGE_UPLOAD_TOKEN_SECRET: "i".repeat(32),
    ...overrides,
  });
}

function createService(
  send?: SendMock,
  env = testEnv(),
  presign?: PresignMock,
): {
  service: ImageStorageService;
  send: SendMock;
  presign: PresignMock;
  logger: LoggerMock;
} {
  const mockSend: SendMock =
    send ??
    jest.fn((command: unknown) => {
      void command;
      return {};
    });
  const mockPresign: PresignMock =
    presign ??
    jest.fn((command, expiresIn, options) => {
      const key = command.input.Key ?? "unknown";
      const extraSignedHeaders = options?.unhoistableHeaders
        ? Array.from(options.unhoistableHeaders).sort()
        : [];
      const signedHeaders = ["host", ...extraSignedHeaders].join(";");
      return Promise.resolve(
        `https://signed.example/${key}?X-Amz-SignedHeaders=${encodeURIComponent(
          signedHeaders,
        )}&expires=${expiresIn}`,
      );
    });
  const logger: LoggerMock = { error: jest.fn() };
  return {
    service: new ImageStorageService(
      env,
      {
        send: mockSend,
      } as unknown as S3Client,
      {
        getSignedUrl: mockPresign,
      } satisfies S3Presigner,
      logger as unknown as Logger,
    ),
    send: mockSend,
    presign: mockPresign,
    logger,
  };
}

describe("privileged retained-object deletion scope", () => {
  it("refuses another bucket or provider before any storage call", async () => {
    const { service, send } = createService();
    await expect(
      service.purgeRetainedDocument({
        provider: "s3",
        bucket: "an-archived-other-bucket",
        storageKey: "document-photos-test/contracts/example.pdf",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.purgeRetainedDocument({
        provider: "another-provider",
        bucket: "private-bucket",
        storageKey: "document-photos-test/contracts/example.pdf",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(send).not.toHaveBeenCalled();
  });
  it("uses the bounded version-aware cleanup only for the stored private bucket", async () => {
    const { service, send } = createService();
    await service.purgeRetainedDocument({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "document-photos-test/contracts/example.pdf",
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
  });
});

describe("ImageStorageService", () => {
  it.each([11 * 1024 * 1024, 15 * 1024 * 1024])(
    "presigns a %i-byte scooter document with the 15 MB runtime setting",
    async (byteSize) => {
      const { service } = createService(
        undefined,
        testEnv({ IMAGE_STORAGE_MAX_BYTES: "15728640" }),
      );
      const upload = await service.createPresignedDocumentUpload({
        contentType: "application/pdf",
        byteSize,
        checksumSha256: "a".repeat(64),
        category: "scooter-document",
        scope: "scooter-document:civ:user-1",
      });
      expect(upload.maxBytes).toBe(15 * 1024 * 1024);
      expect(
        service.verifyDocumentUploadToken(
          upload.uploadToken,
          "scooter-document:civ:user-1",
        ).byteSize,
      ).toBe(byteSize);
    },
  );

  it("reports an explicit lower runtime limit before requesting an S3 URL", async () => {
    const { service, presign } = createService(
      undefined,
      testEnv({ IMAGE_STORAGE_MAX_BYTES: "10485760" }),
    );
    const error: unknown = await service
      .createPresignedDocumentUpload({
        contentType: "application/pdf",
        byteSize: 11 * 1024 * 1024,
        checksumSha256: "a".repeat(64),
        category: "scooter-document",
        scope: "scooter-document:civ:user-1",
      })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect((error as PayloadTooLargeException).getResponse()).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxBytes: 10 * 1024 * 1024 },
    });
    expect(presign).not.toHaveBeenCalled();
  });

  const snapshot: StoredDocument = {
    provider: "s3",
    bucket: "private-bucket",
    storageKey: "document-photos-test/extraction-temporary/job-1",
    contentType: "application/pdf",
    byteSize: 10,
    checksumSha256: "a".repeat(64),
    imageWidth: null,
    imageHeight: null,
    pageCount: null,
  };
  const snapshotHead = {
    ContentType: snapshot.contentType,
    ContentLength: snapshot.byteSize,
    ChecksumSHA256: Buffer.from(snapshot.checksumSha256, "hex").toString(
      "base64",
    ),
    ChecksumType: "FULL_OBJECT",
    VersionId: "immutable-version",
  };

  it("signs GET only after verifying server checksum and pins the verified version", async () => {
    const { service, send, presign } = createService(
      jest.fn().mockResolvedValue(snapshotHead),
    );
    await expect(
      service.createDocumentReadUrl(snapshot, 600),
    ).resolves.toContain("expires=600");
    expect((send.mock.calls[0][0] as HeadObjectCommand).input).toEqual({
      Bucket: snapshot.bucket,
      Key: snapshot.storageKey,
      ChecksumMode: "ENABLED",
    });
    const get = presign.mock.calls[0][0];
    expect(get).toBeInstanceOf(GetObjectCommand);
    expect(get.input).toMatchObject({
      Bucket: snapshot.bucket,
      Key: snapshot.storageKey,
      VersionId: "immutable-version",
      ResponseContentType: snapshot.contentType,
      ResponseCacheControl: "private, no-store",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ContentLength: 11 },
    { ContentType: "image/png" },
    { ChecksumSHA256: undefined },
    { ChecksumSHA256: "other" },
    { ChecksumType: "COMPOSITE" },
  ])("never signs mismatched or missing checksum metadata", async (changes) => {
    const { service, presign } = createService(
      jest.fn().mockResolvedValue({ ...snapshotHead, ...changes }),
    );
    await expect(service.createDocumentReadUrl(snapshot)).rejects.toMatchObject(
      { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" },
    );
    expect(presign).not.toHaveBeenCalled();
  });

  it("rejects wrong buckets, untrusted prefixes and oversized sources before HEAD", async () => {
    const { service, send } = createService();
    for (const changes of [
      { bucket: "other" },
      { storageKey: "other/source.pdf" },
      { byteSize: 33 },
    ])
      await expect(
        service.createDocumentReadUrl({ ...snapshot, ...changes }),
      ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns stable errors when signing access fails", async () => {
    const { service, logger } = createService(
      jest.fn().mockRejectedValue(s3Error("AccessDenied")),
    );
    await expect(service.createDocumentReadUrl(snapshot)).rejects.toMatchObject(
      {
        code: "DOCUMENT_EXTRACTION_READ_FAILED",
        message: "Document access could not be prepared.",
      },
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reserves safe deterministic snapshot keys and lists only the temporary prefix", async () => {
    const send = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      Versions: [
        {
          Key: snapshot.storageKey,
          VersionId: "hidden-version",
          LastModified: new Date("2026-10-11"),
        },
        { Key: "document-photos-test/scooter-documents/original" },
      ],
      DeleteMarkers: [
        {
          Key: snapshot.storageKey,
          VersionId: "marker",
          LastModified: new Date("2026-10-12"),
        },
      ],
      IsTruncated: true,
      NextKeyMarker: snapshot.storageKey,
      NextVersionIdMarker: "older-version",
    });
    const { service } = createService(send);
    expect(service.createDocumentAnalysisKey("job-1")).toBe(
      snapshot.storageKey,
    );
    expect(() => service.createDocumentAnalysisKey("../original")).toThrow(
      BadRequestException,
    );
    const page = await service.listDocumentAnalysisObjects({ maxKeys: 50 });
    expect(page.objects).toEqual([
      {
        storageKey: snapshot.storageKey,
        lastModified: new Date("2026-10-12"),
      },
    ]);
    expect(typeof page.continuationToken).toBe("string");
    expect((send.mock.calls[0][0] as ListObjectVersionsCommand).input).toEqual({
      Bucket: snapshot.bucket,
      Prefix: "document-photos-test/extraction-temporary/",
      MaxKeys: 50,
    });
    await service.listDocumentAnalysisObjects({
      continuationToken: page.continuationToken,
    });
    expect(
      (send.mock.calls[1][0] as ListObjectVersionsCommand).input,
    ).toMatchObject({
      KeyMarker: snapshot.storageKey,
      VersionIdMarker: "older-version",
    });
  });

  it("discovers version-only and marker-only orphans and refuses foreign cursors", async () => {
    const send = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      Versions: [
        {
          Key: snapshot.storageKey,
          VersionId: "hidden",
          LastModified: new Date("2026-10-10"),
        },
      ],
      DeleteMarkers: [
        {
          Key: `${snapshot.storageKey}-marker-only`,
          VersionId: "marker",
          LastModified: new Date("2026-10-11"),
        },
      ],
    });
    const { service } = createService(send);
    await expect(service.listDocumentAnalysisObjects()).resolves.toEqual({
      objects: [
        {
          storageKey: snapshot.storageKey,
          lastModified: new Date("2026-10-10"),
        },
        {
          storageKey: `${snapshot.storageKey}-marker-only`,
          lastModified: new Date("2026-10-11"),
        },
      ],
    });
    send.mockClear();
    await expect(
      service.listDocumentAnalysisObjects({
        continuationToken: Buffer.from(
          JSON.stringify({ v: 1, key: "private/original", version: "1" }),
        ).toString("base64url"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes every exact-key version and marker without deleting adjacent prefix matches", async () => {
    const send: SendMock = jest
      .fn<unknown, [unknown]>()
      .mockImplementation((command: unknown) => {
        if (command instanceof ListObjectVersionsCommand)
          return Promise.resolve({
            Versions: [
              { Key: snapshot.storageKey, VersionId: "v1" },
              { Key: `${snapshot.storageKey}-other`, VersionId: "other" },
            ],
            DeleteMarkers: [{ Key: snapshot.storageKey, VersionId: "marker" }],
          });
        return Promise.resolve({});
      });
    const { service } = createService(send);
    await service.deleteDocumentForCleanup(snapshot.storageKey);
    expect(
      (send.mock.calls[1][0] as DeleteObjectsCommand).input.Delete,
    ).toEqual({
      Objects: [
        { Key: snapshot.storageKey, VersionId: "v1" },
        { Key: snapshot.storageKey, VersionId: "marker" },
      ],
      Quiet: true,
    });
  });

  it("does not mark partial version deletion as success", async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Versions: [{ Key: snapshot.storageKey, VersionId: "v1" }],
      })
      .mockResolvedValueOnce({ Errors: [{ Code: "AccessDenied" }] });
    const { service } = createService(send);
    await expect(
      service.deleteDocumentForCleanup(snapshot.storageKey),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("verifies document upload tokens without reading, deleting, or completing objects", async () => {
    const { service, send } = createService();
    const upload = await service.createPresignedDocumentUpload({
      contentType: "application/pdf",
      byteSize: 10,
      checksumSha256: "a".repeat(64),
      category: "scooter-document",
      scope: "scooter-document:civ:admin",
    });
    send.mockClear();
    expect(
      service.verifyDocumentUploadToken(
        upload.uploadToken,
        "scooter-document:civ:admin",
      ),
    ).toMatchObject({
      contentType: "application/pdf",
      byteSize: 10,
      checksumSha256: "a".repeat(64),
      storageKey: upload.storageKey,
    });
    expect(() =>
      service.verifyDocumentUploadToken(
        upload.uploadToken,
        "scooter-document:civ:other",
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.verifyDocumentUploadToken(
        `${upload.uploadToken}altered`,
        "scooter-document:civ:admin",
      ),
    ).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it("passes document read cancellation to S3", async () => {
    const { service, send } = createService(
      jest.fn((command: unknown) => ({
        command,
        Body: Readable.from([]),
        ContentType: "application/pdf",
        ContentLength: 0,
      })),
    );
    const signal = new AbortController().signal;
    await service.readDocument("documents/test.pdf", signal);
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand), {
      abortSignal: signal,
    });
  });

  it("stores supported images with generated S3 keys and checksum metadata", async () => {
    const { service, send } = createService();
    const buffer = Buffer.from("image-bytes");

    const stored = await service.storeImage({
      buffer,
      contentType: "image/png",
      byteSize: buffer.length,
      category: "personal-document",
    });

    expect(stored).toMatchObject({
      provider: "s3",
      bucket: "private-bucket",
      contentType: "image/png",
      byteSize: buffer.length,
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
    });
    expect(stored.storageKey).toMatch(
      /^document-photos-test\/personal-documents\/\d{4}\/.+\.png$/,
    );

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "private-bucket",
      Key: stored.storageKey,
      Body: buffer,
      ContentType: "image/png",
    });
    expect(command.input.ACL).toBeUndefined();
  });

  it("adds SSE-KMS headers only when a KMS key is configured", async () => {
    const { service, send } = createService(
      jest.fn((command: unknown) => {
        void command;
        return {};
      }),
      testEnv({ IMAGE_STORAGE_S3_KMS_KEY_ID: "alias/document-photos" }),
    );

    await service.storeImage({
      buffer: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
      byteSize: 11,
      category: "personal-document",
    });

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command.input.ServerSideEncryption).toBe("aws:kms");
    expect(command.input.SSEKMSKeyId).toBe("alias/document-photos");
  });

  it("maps missing S3 buckets to a storage availability error", async () => {
    const { service } = createService(
      jest.fn((command: unknown) => {
        void command;
        throw s3Error("NoSuchBucket");
      }),
    );

    await expect(
      service.storeImage({
        buffer: Buffer.from("image-bytes"),
        contentType: "image/png",
        byteSize: 11,
        category: "personal-document",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "IMAGE_STORAGE_BUCKET_UNAVAILABLE",
        message: "Image storage bucket is not available",
      },
    });
    await expect(
      service.storeImage({
        buffer: Buffer.from("image-bytes"),
        contentType: "image/png",
        byteSize: 11,
        category: "personal-document",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reads and deletes objects by private storage key", async () => {
    const send = jest.fn((command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: Readable.from([Buffer.from("stored")]),
          ContentType: "image/webp",
          ContentLength: 6,
        };
      }
      return {};
    }) as SendMock;
    const { service } = createService(send);

    const read = await service.readImage(
      "document-photos-test/2026/06/26/a.webp",
    );
    expect(read.contentType).toBe("image/webp");
    expect(read.contentLength).toBe(6);

    await service.deleteImage("document-photos-test/2026/06/26/a.webp");

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("creates signed PUT URLs with upload headers and completes uploaded objects", async () => {
    const checksumSha256 = createHash("sha256").update("stored").digest("hex");
    const send = jest.fn((command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return {
          ContentType: "image/png",
          ContentLength: 6,
        };
      }
      return {};
    }) as SendMock;
    const { service, presign } = createService(send);

    const upload = await service.createPresignedUpload({
      contentType: "image/png",
      byteSize: 6,
      checksumSha256,
      category: "personal-document",
      scope: "person-document-photo:person-1:document-1:front:user-1",
    });

    expect(upload.method).toBe("PUT");
    expect(upload.uploadUrl).toContain("https://signed.example/");
    expect(upload.uploadUrl).toContain(
      "X-Amz-SignedHeaders=host%3Bx-amz-checksum-sha256",
    );
    expect(upload.headers).toMatchObject({
      "Content-Type": "image/png",
      "x-amz-checksum-sha256": Buffer.from(checksumSha256, "hex").toString(
        "base64",
      ),
    });

    const command = presign.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    if (!(command instanceof PutObjectCommand)) {
      throw new Error("Expected PutObjectCommand");
    }
    expect(command.input.ContentType).toBe("image/png");
    expect(command.input.ChecksumSHA256).toBe(
      Buffer.from(checksumSha256, "hex").toString("base64"),
    );

    const completed = await service.completePresignedUpload(
      upload.uploadToken,
      "person-document-photo:person-1:document-1:front:user-1",
    );
    expect(completed).toMatchObject({
      provider: "s3",
      bucket: "private-bucket",
      contentType: "image/png",
      byteSize: 6,
      checksumSha256,
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("logs actionable S3 diagnostics when presigning fails", async () => {
    const presignError = Object.assign(new Error("signature mismatch"), {
      name: "SignatureDoesNotMatch",
      $metadata: {
        requestId: "aws-request-123",
        httpStatusCode: 403,
        attempts: 1,
      },
    });
    const presign: PresignMock = jest.fn(
      (
        command: PutObjectCommand,
        expiresIn: number,
        options?: S3PresignOptions,
      ) => {
        void command;
        void expiresIn;
        void options;
        return Promise.reject(presignError);
      },
    );
    const { service, logger } = createService(undefined, testEnv(), presign);
    const checksumSha256 = createHash("sha256").update("stored").digest("hex");

    await expect(
      service.createPresignedUpload({
        contentType: "image/png",
        byteSize: 6,
        checksumSha256,
        category: "personal-document",
        scope: "person-document-photo-draft:user-1",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "image_storage_presign_failed",
        errorName: "SignatureDoesNotMatch",
        errorMessage: "signature mismatch",
        awsRequestId: "aws-request-123",
        awsHttpStatusCode: 403,
        awsAttempts: 1,
        contentType: "image/png",
        byteSize: 6,
      }),
      "Failed to create presigned S3 upload URL",
    );
  });

  it("supports checksum-bound private PDF uploads without widening image APIs", async () => {
    const checksumSha256 = createHash("sha256")
      .update("%PDF-test")
      .digest("hex");
    const send = jest.fn((command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return {
          ContentType: "application/pdf",
          ContentLength: 9,
        };
      }
      return {};
    }) as SendMock;
    const { service } = createService(send);

    const upload = await service.createPresignedDocumentUpload({
      contentType: "application/pdf",
      byteSize: 9,
      checksumSha256,
      pageCount: 2,
      category: "expense-invoice",
      scope: "expense-document:expense-1:document-1:original:user-1",
    });

    expect(upload.storageKey).toMatch(
      /^document-photos-test\/invoices\/\d{4}-\d{2}\/.+\.pdf$/,
    );
    await expect(
      service.completePresignedUpload(
        upload.uploadToken,
        "expense-document:expense-1:document-1:original:user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const completed = await service.completePresignedDocumentUpload(
      upload.uploadToken,
      "expense-document:expense-1:document-1:original:user-1",
    );
    expect(completed).toMatchObject({
      contentType: "application/pdf",
      byteSize: 9,
      checksumSha256,
      imageWidth: null,
      imageHeight: null,
      pageCount: 2,
    });
  });

  it("keeps draft completion valid after the PUT URL expires, within its bounded lifetime and owner scope", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const send = jest.fn((command: unknown) => {
      if (command instanceof HeadObjectCommand)
        return { ContentType: "image/png", ContentLength: 6 };
      return {};
    }) as SendMock;
    const { service, presign } = createService(send);
    const scope = "person-document-photo-draft:user-1";
    try {
      const upload = await service.createPresignedDocumentUpload({
        contentType: "image/png",
        byteSize: 6,
        checksumSha256: createHash("sha256").update("stored").digest("hex"),
        category: "personal-document",
        scope,
        completionTokenTtlSeconds: 86_400,
      });
      expect(presign.mock.calls[0]?.[1]).toBe(300);
      expect(upload.uploadTokenExpiresAt?.getTime()).toBe(now + 86_400_000);
      clock.mockReturnValue(now + 600_000);
      await expect(
        service.completePresignedDocumentUpload(upload.uploadToken, scope),
      ).resolves.toMatchObject({ contentType: "image/png", byteSize: 6 });
      await expect(
        service.completePresignedDocumentUpload(
          upload.uploadToken,
          "person-document-photo-draft:another-user",
        ),
      ).rejects.toThrow("scope mismatch");
      clock.mockReturnValue(now + 86_401_000);
      await expect(
        service.completePresignedDocumentUpload(upload.uploadToken, scope),
      ).rejects.toThrow("expired");
    } finally {
      clock.mockRestore();
    }
  });

  it("stores multipart PDFs privately with a computed checksum", async () => {
    const { service, send } = createService();
    const buffer = Buffer.from("%PDF-test");
    const stored = await service.storeDocument({
      buffer,
      byteSize: buffer.length,
      contentType: "application/pdf",
      category: "personal-document",
    });
    expect(stored).toMatchObject({
      contentType: "application/pdf",
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
    });
    expect(stored.storageKey).toMatch(/personal-documents\/\d{4}\/.+\.pdf$/);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command.input.ACL).toBeUndefined();
    await expect(
      service.storeImage({
        buffer,
        byteSize: buffer.length,
        contentType: "application/pdf",
        category: "personal-document",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsupported content types, oversized files, and unsafe keys", async () => {
    const { service } = createService();

    await expect(
      service.storeImage({
        buffer: Buffer.from("text"),
        contentType: "text/plain",
        byteSize: 4,
        category: "personal-document",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.storeImage({
        buffer: Buffer.alloc(33),
        contentType: "image/jpeg",
        byteSize: 33,
        category: "personal-document",
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    await expect(service.deleteImage("../secret")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
