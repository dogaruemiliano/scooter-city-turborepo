import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";
import { v1 } from "@repo/api-shared";
import type { AuthPrincipal } from "../auth/auth.types";
import { AccessService } from "./access.service";
import type { AccessSnapshot } from "./access.resolver";

export function projectDomainResponse(
  value: unknown,
  access: AccessSnapshot,
): unknown {
  if (Array.isArray(value))
    return value.map((v) => projectDomainResponse(v, access));
  if (!value || typeof value !== "object") return value;
  const record = { ...value } as Record<string, unknown>;
  if (Array.isArray(record.items))
    record.items = record.items.map((v) => projectDomainResponse(v, access));
  if (
    "fleetNumber" in record &&
    !v1.access.hasPermission(access, "scooter_documents.read", "ALL")
  ) {
    for (const field of [
      "documents",
      "insurancePolicies",
      "insuranceAttention",
      "civRawFields",
      "civVersion",
      "civIssuedAt",
      "civIssuingAuthority",
    ])
      delete record[field];
  }
  if (
    "firstName" in record &&
    "documents" in record &&
    !v1.access.hasPermission(access, "person_documents.read", "ALL")
  )
    record.documents = [];
  return record;
}
/** Embedded document data obeys the same grants as dedicated document routes. */
@Injectable()
export class AccessProjectionInterceptor implements NestInterceptor {
  constructor(private readonly access: AccessService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user: AuthPrincipal }>();
    const snapshot = user.access ?? (await this.access.getSnapshot(user.id));
    return next
      .handle()
      .pipe(map((value) => projectDomainResponse(value, snapshot)));
  }
}
