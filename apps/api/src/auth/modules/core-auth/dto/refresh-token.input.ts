import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class RefreshTokenInput extends createZodDto(
  v1.auth.refreshTokenInputSchema,
) {}
