import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class UpdateProfileInput extends createZodDto(
  v1.auth.updateProfileInputSchema,
) {}
