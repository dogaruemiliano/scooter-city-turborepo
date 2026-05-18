import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class EnabledAuthMethods extends createZodDto(
  v1.auth.enabledAuthMethodsSchema,
) {}
