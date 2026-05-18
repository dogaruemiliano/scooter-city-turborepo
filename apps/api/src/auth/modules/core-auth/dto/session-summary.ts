import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SessionSummary extends createZodDto(
  v1.auth.sessionSummarySchema,
) {}
