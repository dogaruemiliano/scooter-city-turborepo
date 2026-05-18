import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SignInWithAppleInput extends createZodDto(
  v1.auth.signInWithAppleInputSchema,
) {}
