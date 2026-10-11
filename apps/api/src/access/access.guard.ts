import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator";
import { ACCESS_POLICY, type AccessPolicy } from "./access.decorators";
import { AccessService } from "./access.service";
import { createAbility, subjectFor } from "./access.ability";
import type { AccessSnapshot } from "./access.resolver";
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(
      ACCESS_POLICY,
      targets,
    );
    if (!policy) throw new ForbiddenException("Endpoint has no access policy");
    const req = context.switchToHttp().getRequest<{
      user?: { id: string; access?: AccessSnapshot };
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    if (!req.user) throw new ForbiddenException("Authentication required");
    if (policy.kind === "self") return true;
    const snapshot =
      req.user.access ?? (await this.access.getSnapshot(req.user.id));
    if (policy.kind === "super") {
      if (!snapshot.isSuperAdmin)
        throw new ForbiddenException("Super admin required");
      return true;
    }
    const ability = createAbility(snapshot);
    const keys = [...policy.keys];
    // Domain writes can carry nested documents; they require independent authority.
    const body = req.body ?? {};
    if (
      keys.includes("persons.read") &&
      Object.keys(req.query ?? {}).some((k) => k.startsWith("document"))
    )
      keys.push("person_documents.read");
    if (
      keys.some((k) => k === "persons.create" || k === "persons.update") &&
      Array.isArray(body.documents) &&
      body.documents.length
    )
      keys.push("person_documents.write");
    if (
      keys.some((k) => k === "scooters.create" || k === "scooters.update") &&
      [
        "documentDrafts",
        "documentExtractions",
        "removedDocumentIds",
        "insurancePolicies",
        "civVersion",
        "civIssuedAt",
        "civIssuingAuthority",
        "civRawFields",
      ].some((k) => body[k] !== undefined)
    )
      keys.push("scooter_documents.write");
    for (const key of keys) {
      if (
        !ability.can(key, subjectFor(key)) ||
        (policy.scope &&
          !snapshot.isSuperAdmin &&
          !snapshot.effectiveScopes[key]?.includes(policy.scope))
      )
        throw new ForbiddenException("Permission required");
    }
    return true;
  }
}
