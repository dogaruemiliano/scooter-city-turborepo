import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class PersonDocumentPhotoUploadUrl extends createZodDto(
  v1.persons.personDocumentPhotoUploadUrlSchema,
) {}
