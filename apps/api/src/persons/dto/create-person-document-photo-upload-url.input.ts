import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreatePersonDocumentPhotoUploadUrlInput extends createZodDto(
  v1.persons.createPersonDocumentPhotoUploadUrlInputSchema,
) {}
