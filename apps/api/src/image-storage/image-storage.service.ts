import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type HeadObjectCommandOutput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Readable } from "node:stream";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { S3_CLIENT, S3_PRESIGNER } from "./image-storage.constants";
import type { S3Presigner } from "./image-storage.module";
import {
  IMAGE_STORAGE_PROVIDER_S3,
  SUPPORTED_IMAGE_CONTENT_TYPES,
  type PresignedImageUpload,
  type PresignImageUploadInput,
  type ReadStoredImageResult,
  type StoreImageInput,
  type StoredImage,
  type SupportedImageContentType,
} from "./image-storage.types";

const CONTENT_TYPE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} satisfies Record<SupportedImageContentType, string>;

const UPLOAD_TOKEN_VERSION = 1;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const IMAGE_STORAGE_BUCKET_UNAVAILABLE_CODE =
  "IMAGE_STORAGE_BUCKET_UNAVAILABLE";
const IMAGE_STORAGE_UNAVAILABLE_CODE = "IMAGE_STORAGE_UNAVAILABLE";
const S3_CONFIGURATION_ERROR_NAMES = new Set([
  "AccessDenied",
  "AuthorizationHeaderMalformed",
  "InvalidAccessKeyId",
  "NoSuchBucket",
  "PermanentRedirect",
  "SignatureDoesNotMatch",
]);

interface UploadTokenPayload {
  v: typeof UPLOAD_TOKEN_VERSION;
  provider: typeof IMAGE_STORAGE_PROVIDER_S3;
  bucket: string;
  storageKey: string;
  contentType: SupportedImageContentType;
  byteSize: number;
  checksumSha256: string;
  scope: string;
  exp: number;
}

@Injectable()
export class ImageStorageService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_PRESIGNER) private readonly presigner: S3Presigner,
  ) {}

  async storeImage(input: StoreImageInput): Promise<StoredImage> {
    const contentType = this.requireSupportedContentType(input.contentType);
    this.assertValidByteSize(input.byteSize);

    const storageKey = this.generateStorageKey(contentType);
    const checksumSha256 = createHash("sha256")
      .update(input.buffer)
      .digest("hex");
    const putInput: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: storageKey,
      Body: input.buffer,
      ContentType: contentType,
    };

    if (this.env.IMAGE_STORAGE_S3_KMS_KEY_ID) {
      putInput.ServerSideEncryption = "aws:kms";
      putInput.SSEKMSKeyId = this.env.IMAGE_STORAGE_S3_KMS_KEY_ID;
    }

    try {
      await this.s3.send(new PutObjectCommand(putInput));
    } catch (error) {
      throwS3StorageError(error);
    }

    return {
      provider: IMAGE_STORAGE_PROVIDER_S3,
      bucket: this.bucket,
      storageKey,
      contentType,
      byteSize: input.byteSize,
      checksumSha256,
    };
  }

  async createPresignedUpload(
    input: PresignImageUploadInput,
  ): Promise<PresignedImageUpload> {
    const contentType = this.requireSupportedContentType(input.contentType);
    this.assertValidByteSize(input.byteSize);
    const checksumSha256 = this.requireSha256Hex(input.checksumSha256);
    const checksumSha256Base64 = Buffer.from(checksumSha256, "hex").toString(
      "base64",
    );
    const storageKey = this.generateStorageKey(contentType);
    const expiresAt = this.createExpiresAt();
    const requestHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "x-amz-checksum-sha256": checksumSha256Base64,
    };
    const putInput: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: contentType,
      ChecksumSHA256: checksumSha256Base64,
    };

    if (this.env.IMAGE_STORAGE_S3_KMS_KEY_ID) {
      putInput.ServerSideEncryption = "aws:kms";
      putInput.SSEKMSKeyId = this.env.IMAGE_STORAGE_S3_KMS_KEY_ID;
      requestHeaders["x-amz-server-side-encryption"] = "aws:kms";
      requestHeaders["x-amz-server-side-encryption-aws-kms-key-id"] =
        this.env.IMAGE_STORAGE_S3_KMS_KEY_ID;
    }

    const uploadToken = this.signUploadToken({
      v: UPLOAD_TOKEN_VERSION,
      provider: IMAGE_STORAGE_PROVIDER_S3,
      bucket: this.bucket,
      storageKey,
      contentType,
      byteSize: input.byteSize,
      checksumSha256,
      scope: input.scope,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });

    let uploadUrl: string;
    try {
      uploadUrl = await this.presigner.getSignedUrl(
        new PutObjectCommand(putInput),
        this.env.IMAGE_STORAGE_SIGNED_URL_TTL_SECONDS,
        {
          unhoistableHeaders: this.amzHeaderNames(requestHeaders),
        },
      );
    } catch (error) {
      throwS3StorageError(error);
    }

    return {
      provider: IMAGE_STORAGE_PROVIDER_S3,
      bucket: this.bucket,
      storageKey,
      uploadUrl,
      uploadToken,
      method: "PUT",
      headers: this.browserUploadHeadersForSignedUrl(uploadUrl, requestHeaders),
      expiresAt,
      maxBytes: this.env.IMAGE_STORAGE_MAX_BYTES,
    };
  }

  async completePresignedUpload(
    uploadToken: string,
    scope: string,
  ): Promise<StoredImage> {
    const payload = this.verifyUploadToken(uploadToken, scope);
    this.assertSafeStorageKey(payload.storageKey);

    let head: HeadObjectCommandOutput;
    try {
      head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: payload.bucket,
          Key: payload.storageKey,
        }),
      );
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new BadRequestException("Uploaded image object was not found");
      }
      throwS3StorageError(error);
    }

    const contentLength =
      typeof head.ContentLength === "number" ? head.ContentLength : null;
    if (
      payload.bucket !== this.bucket ||
      contentLength !== payload.byteSize ||
      head.ContentType !== payload.contentType
    ) {
      await this.deleteImage(payload.storageKey);
      throw new BadRequestException("Uploaded image does not match metadata");
    }

    return {
      provider: payload.provider,
      bucket: payload.bucket,
      storageKey: payload.storageKey,
      contentType: payload.contentType,
      byteSize: payload.byteSize,
      checksumSha256: payload.checksumSha256,
    };
  }

  async readImage(storageKey: string): Promise<ReadStoredImageResult> {
    this.assertSafeStorageKey(storageKey);

    try {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );

      return {
        body: this.toNodeReadable(result.Body),
        contentType: result.ContentType ?? null,
        contentLength:
          typeof result.ContentLength === "number"
            ? result.ContentLength
            : null,
      };
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new NotFoundException("Image not found");
      }
      throwS3StorageError(error);
    }
  }

  async deleteImage(storageKey: string): Promise<void> {
    this.assertSafeStorageKey(storageKey);
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch (error) {
      throwS3StorageError(error);
    }
  }

  private requireSupportedContentType(
    contentType: string,
  ): SupportedImageContentType {
    if (
      SUPPORTED_IMAGE_CONTENT_TYPES.includes(
        contentType as SupportedImageContentType,
      )
    ) {
      return contentType as SupportedImageContentType;
    }

    throw new BadRequestException("Unsupported image content type");
  }

  private assertValidByteSize(byteSize: number): void {
    if (!Number.isInteger(byteSize) || byteSize <= 0) {
      throw new BadRequestException("Image file is empty");
    }

    if (byteSize > this.env.IMAGE_STORAGE_MAX_BYTES) {
      throw new PayloadTooLargeException("Image file is too large");
    }
  }

  private generateStorageKey(contentType: SupportedImageContentType): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const extension = CONTENT_TYPE_EXTENSIONS[contentType];

    return `${this.prefix}/${year}/${month}/${day}/${randomUUID()}.${extension}`;
  }

  private requireSha256Hex(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!SHA_256_HEX_PATTERN.test(normalized)) {
      throw new BadRequestException("Image checksum must be SHA-256 hex");
    }
    return normalized;
  }

  private createExpiresAt(): Date {
    return new Date(
      Date.now() + this.env.IMAGE_STORAGE_SIGNED_URL_TTL_SECONDS * 1000,
    );
  }

  private browserUploadHeadersForSignedUrl(
    uploadUrl: string,
    headers: Record<string, string>,
  ): Record<string, string> {
    const signedHeaders = new Set(
      (new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "")
        .split(";")
        .filter(Boolean),
    );

    return Object.fromEntries(
      Object.entries(headers).filter(([name]) => {
        const normalizedName = name.toLowerCase();
        return (
          !normalizedName.startsWith("x-amz-") ||
          signedHeaders.has(normalizedName)
        );
      }),
    );
  }

  private amzHeaderNames(headers: Record<string, string>): Set<string> {
    return new Set(
      Object.keys(headers)
        .map((name) => name.toLowerCase())
        .filter((name) => name.startsWith("x-amz-")),
    );
  }

  private signUploadToken(payload: UploadTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.signTokenBody(body);
    return `${body}.${signature}`;
  }

  private verifyUploadToken(
    uploadToken: string,
    scope: string,
  ): UploadTokenPayload {
    const [body, signature, extra] = uploadToken.split(".");
    if (!body || !signature || extra !== undefined) {
      throw new BadRequestException("Invalid image upload token");
    }

    const expectedSignature = this.signTokenBody(body);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    if (
      signatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
      throw new BadRequestException("Invalid image upload token");
    }

    const payload = this.parseUploadTokenPayload(body);
    if (payload.scope !== scope) {
      throw new BadRequestException("Image upload token scope mismatch");
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException("Image upload token expired");
    }

    return payload;
  }

  private signTokenBody(body: string): string {
    return createHmac("sha256", this.uploadTokenSecret)
      .update(body)
      .digest("base64url");
  }

  private parseUploadTokenPayload(body: string): UploadTokenPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      throw new BadRequestException("Invalid image upload token");
    }

    if (!isUploadTokenPayload(parsed)) {
      throw new BadRequestException("Invalid image upload token");
    }
    return parsed;
  }

  private assertSafeStorageKey(storageKey: string): void {
    const segments = storageKey.split("/");
    if (
      storageKey.length === 0 ||
      storageKey.startsWith("/") ||
      storageKey.includes("\\") ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      throw new BadRequestException("Invalid image storage key");
    }
  }

  private toNodeReadable(body: unknown): Readable {
    if (body instanceof Readable) {
      return body;
    }

    if (
      body &&
      typeof body === "object" &&
      "pipe" in body &&
      typeof (body as { pipe?: unknown }).pipe === "function"
    ) {
      return body as Readable;
    }

    throw new InternalServerErrorException("Image body is not readable");
  }

  private get bucket(): string {
    if (!this.env.IMAGE_STORAGE_S3_BUCKET) {
      throw new InternalServerErrorException(
        "IMAGE_STORAGE_S3_BUCKET is not configured",
      );
    }
    return this.env.IMAGE_STORAGE_S3_BUCKET;
  }

  private get prefix(): string {
    const prefix = this.env.IMAGE_STORAGE_S3_PREFIX.replace(/^\/+|\/+$/g, "");
    const segments = prefix.split("/");
    if (
      prefix.length === 0 ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      throw new InternalServerErrorException(
        "IMAGE_STORAGE_S3_PREFIX is invalid",
      );
    }
    return prefix;
  }

  private get uploadTokenSecret(): string {
    if (!this.env.IMAGE_STORAGE_UPLOAD_TOKEN_SECRET) {
      throw new InternalServerErrorException(
        "IMAGE_STORAGE_UPLOAD_TOKEN_SECRET is not configured",
      );
    }
    return this.env.IMAGE_STORAGE_UPLOAD_TOKEN_SECRET;
  }
}

function isMissingObjectError(error: unknown): boolean {
  const name = s3ErrorName(error);
  return name === "NoSuchKey" || name === "NotFound";
}

function throwS3StorageError(error: unknown): never {
  const name = s3ErrorName(error);

  if (name === "NoSuchBucket") {
    throw new ServiceUnavailableException({
      code: IMAGE_STORAGE_BUCKET_UNAVAILABLE_CODE,
      message: "Image storage bucket is not available",
    });
  }

  if (name && S3_CONFIGURATION_ERROR_NAMES.has(name)) {
    throw new ServiceUnavailableException({
      code: IMAGE_STORAGE_UNAVAILABLE_CODE,
      message: "Image storage is unavailable",
    });
  }

  throw error;
}

function s3ErrorName(error: unknown): string | null {
  if (
    !(error instanceof S3ServiceException) &&
    (typeof error !== "object" || error === null)
  ) {
    return null;
  }

  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

function isUploadTokenPayload(value: unknown): value is UploadTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<UploadTokenPayload>;
  return (
    payload.v === UPLOAD_TOKEN_VERSION &&
    payload.provider === IMAGE_STORAGE_PROVIDER_S3 &&
    typeof payload.bucket === "string" &&
    typeof payload.storageKey === "string" &&
    SUPPORTED_IMAGE_CONTENT_TYPES.includes(
      payload.contentType as SupportedImageContentType,
    ) &&
    typeof payload.byteSize === "number" &&
    Number.isInteger(payload.byteSize) &&
    payload.byteSize > 0 &&
    typeof payload.checksumSha256 === "string" &&
    SHA_256_HEX_PATTERN.test(payload.checksumSha256) &&
    typeof payload.scope === "string" &&
    typeof payload.exp === "number" &&
    Number.isInteger(payload.exp)
  );
}
