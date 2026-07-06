import { Module } from "@nestjs/common";
import { S3Client, type PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { S3_CLIENT, S3_PRESIGNER } from "./image-storage.constants";
import { ImageStorageService } from "./image-storage.service";

export interface S3Presigner {
  getSignedUrl(
    command: PutObjectCommand,
    expiresIn: number,
    options?: S3PresignOptions,
  ): Promise<string>;
}

export interface S3PresignOptions {
  unhoistableHeaders?: Set<string>;
}

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): S3Client =>
        new S3Client({ region: env.IMAGE_STORAGE_S3_REGION }),
    },
    {
      provide: S3_PRESIGNER,
      inject: [S3_CLIENT],
      useFactory: (s3: S3Client): S3Presigner => ({
        getSignedUrl: (command, expiresIn, options) =>
          getSignedUrl(s3, command, { expiresIn, ...options }),
      }),
    },
    ImageStorageService,
  ],
  exports: [ImageStorageService],
})
export class ImageStorageModule {}
