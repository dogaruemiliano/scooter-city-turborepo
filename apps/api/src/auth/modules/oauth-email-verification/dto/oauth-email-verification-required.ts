import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class OAuthEmailVerificationRequired extends createZodDto(
  v1.auth.otpChallengeMetadataSchema,
) {}
