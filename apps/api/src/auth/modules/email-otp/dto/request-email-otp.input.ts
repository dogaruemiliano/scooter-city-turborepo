import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class RequestEmailOtpInput extends createZodDto(
  v1.auth.requestEmailOtpInputSchema,
) {}
