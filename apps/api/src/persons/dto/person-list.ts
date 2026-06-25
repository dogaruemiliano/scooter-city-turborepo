import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class PersonList extends createZodDto(v1.persons.personListSchema) {}
