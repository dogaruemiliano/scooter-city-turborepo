import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RequestWithUser } from "../../auth/auth.types";
import { REQUIRED_ROLES_KEY } from "../authz/roles.constants";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly string[]>(
      REQUIRED_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Partial<RequestWithUser>>();
    const userRoles = req.user?.roles ?? [];
    if (requiredRoles.some((role) => userRoles.includes(role))) return true;

    throw new ForbiddenException("Insufficient role");
  }
}
