import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ResendOtpChallengeInput extends createZodDto(
  v1.auth.resendOtpChallengeInputSchema,
) {}
