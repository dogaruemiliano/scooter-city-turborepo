import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class PersonDocumentPhoto extends createZodDto(
  v1.persons.personDocumentPhotoSchema,
) {}
