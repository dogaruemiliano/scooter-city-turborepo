/**
 * X-Requested-With CSRF defense for cookie-authenticated mutations.
 *
 * The rule:
 *
 *   - Safe methods (GET/HEAD/OPTIONS) pass.
 *   - Routes decorated `@SkipCsrf()` pass (e.g. JWKS, future OAuth callbacks).
 *   - Requests with NO auth cookies pass — CSRF is about cross-site abuse
 *     of *ambient cookie auth*. Bearer-token mobile clients, curl, CI, and
 *     internal-tools don't have ambient authority a cross-site form-post
 *     could hijack, so the header requirement would be theatre.
 *   - Everything else must carry `X-Requested-With: fetch`. Browsers won't
 *     attach that header on simple cross-origin form submissions (the
 *     custom header forces a CORS preflight which our origin allowlist
 *     blocks), so it's a reliable "real first-party JS made this call"
 *     signal that pairs with the SameSite=Lax cookies.
 *
 * Registered globally via `APP_GUARD` in [app.module.ts](../../app.module.ts).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { v1 } from "@repo/api-shared";
import type { Request } from "express";

import { SKIP_CSRF_KEY } from "../decorators/skip-csrf.decorator";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_HEADER = "x-requested-with";
const REQUIRED_VALUE = "fetch";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const hasAuthCookie = Boolean(
      cookies?.[v1.auth.ACCESS_TOKEN_COOKIE] ||
      cookies?.[v1.auth.REFRESH_TOKEN_COOKIE],
    );
    if (!hasAuthCookie) return true;

    const header = req.header(REQUIRED_HEADER);
    if (header?.toLowerCase() === REQUIRED_VALUE) return true;

    throw new ForbiddenException({
      code: "csrf_required",
      message:
        "Mutation requires X-Requested-With: fetch header for cookie-authenticated callers.",
    });
  }
}
