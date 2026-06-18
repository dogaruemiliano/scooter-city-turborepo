import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class VerifyOAuthEmailInput extends createZodDto(
  v1.auth.verifyOAuthEmailInputSchema,
) {}
