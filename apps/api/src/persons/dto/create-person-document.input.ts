import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreatePersonDocumentInput extends createZodDto(
  v1.persons.createPersonDocumentInputSchema,
) {}
