import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SignInWithGoogleInput extends createZodDto(
  v1.auth.signInWithGoogleInputSchema,
) {}
