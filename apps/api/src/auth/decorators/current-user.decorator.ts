/**
 * Param decorator returning the authenticated user's principal.
 *
 * After `JwtAuthGuard` validates the request, `req.user` carries the
 * `AuthPrincipal` shape returned by `JwtStrategy.validate`. This
 * decorator is sugar over `req.user`.
 *
 * Usage:
 *
 * ```ts
 * @Get("me")
 * me(@CurrentUser() user: AuthPrincipal) { ... }
 * ```
 *
 * On a `@Public()` route there's no user; the decorator returns
 * `undefined`. Type the parameter as `AuthPrincipal | undefined` if you
 * accept that.
 */
import { ExecutionContext, createParamDecorator } from "@nestjs/common";

import type { AuthPrincipal, RequestWithUser } from "../auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Partial<RequestWithUser>>();
    return req.user;
  },
);
