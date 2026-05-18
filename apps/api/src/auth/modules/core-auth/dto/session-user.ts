import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SessionUser extends createZodDto(v1.auth.sessionUserSchema) {}
