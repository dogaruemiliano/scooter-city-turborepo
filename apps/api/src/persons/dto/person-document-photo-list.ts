import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class PersonDocumentPhotoList extends createZodDto(
  v1.persons.personDocumentPhotoListSchema,
) {}
