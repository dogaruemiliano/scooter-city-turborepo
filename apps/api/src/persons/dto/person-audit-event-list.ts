import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class PersonAuditEventList extends createZodDto(
  v1.persons.personAuditEventListSchema,
) {}
