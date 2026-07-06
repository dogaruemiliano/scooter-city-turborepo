import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class UpdatePersonDocumentInput extends createZodDto(
  v1.persons.updatePersonDocumentInputSchema,
) {}
