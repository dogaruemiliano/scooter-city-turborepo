/**
 * Global auth guard. Registered via `APP_GUARD` in
 * [auth.module.ts](../auth.module.ts) — every route on the API requires
 * a valid access token UNLESS the route (or its controller) is decorated
 * with `@Public()`.
 *
 * Honors both class-level and method-level `@Public()`. Method-level wins
 * (Nest's `getAllAndOverride`), so a `@Public()` controller can still
 * have a `@Get('me')` that requires auth if the method is decorated
 * without `@Public()` and the class with it — though that arrangement is
 * unusual and probably better expressed by inverting the defaults.
 */
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(ctx) as boolean | Promise<boolean>;
  }
}
