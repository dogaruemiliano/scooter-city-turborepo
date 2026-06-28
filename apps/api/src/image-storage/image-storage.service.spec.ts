import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { loadEnv, type Env } from "../config/env";
import type { S3Presigner } from "./image-storage.module";
import { ImageStorageService } from "./image-storage.service";

type SendMock = jest.Mock<unknown, [unknown]>;
type PresignMock = jest.Mock<
  Promise<string>,
  [PutObjectCommand | GetObjectCommand, number]
>;

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
): { service: ImageStorageService; send: SendMock; presign: PresignMock } {
  const mockSend: SendMock =
    send ??
    jest.fn((command: unknown) => {
      void command;
      return {};
    });
  const mockPresign: PresignMock =
    presign ??
    jest.fn((command, expiresIn) => {
      const key = command.input.Key ?? "unknown";
      return Promise.resolve(
        `https://signed.example/${key}?expires=${expiresIn}`,
      );
    });
  return {
    service: new ImageStorageService(
      env,
      {
        send: mockSend,
      } as unknown as S3Client,
      {
        getSignedUrl: mockPresign,
      } satisfies S3Presigner,
    ),
    send: mockSend,
    presign: mockPresign,
  };
}

describe("ImageStorageService", () => {
  it("stores supported images with generated S3 keys and checksum metadata", async () => {
    const { service, send } = createService();
    const buffer = Buffer.from("image-bytes");

    const stored = await service.storeImage({
      buffer,
      contentType: "image/png",
      byteSize: buffer.length,
    });

    expect(stored).toMatchObject({
      provider: "s3",
      bucket: "private-bucket",
      contentType: "image/png",
      byteSize: buffer.length,
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
    });
    expect(stored.storageKey).toMatch(
      /^document-photos-test\/\d{4}\/\d{2}\/\d{2}\/.+\.png$/,
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
    });

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command.input.ServerSideEncryption).toBe("aws:kms");
    expect(command.input.SSEKMSKeyId).toBe("alias/document-photos");
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
      scope: "person-document-photo:person-1:document-1:front:user-1",
    });

    expect(upload.method).toBe("PUT");
    expect(upload.uploadUrl).toContain("https://signed.example/");
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

  it("creates signed GET URLs for safe private storage keys", async () => {
    const { service, presign } = createService();

    const read = await service.createPresignedRead(
      "document-photos-test/2026/06/28/a.png",
    );

    expect(read.method).toBe("GET");
    expect(read.readUrl).toContain("https://signed.example/");
    expect(read.headers).toEqual({});
    expect(presign.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  });

  it("rejects unsupported content types, oversized files, and unsafe keys", async () => {
    const { service } = createService();

    await expect(
      service.storeImage({
        buffer: Buffer.from("text"),
        contentType: "text/plain",
        byteSize: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.storeImage({
        buffer: Buffer.alloc(33),
        contentType: "image/jpeg",
        byteSize: 33,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    await expect(service.deleteImage("../secret")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
