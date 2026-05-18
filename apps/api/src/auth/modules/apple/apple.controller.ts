/**
 * HTTP surface for Sign in with Apple.
 *
 *   POST /v1/auth/apple    public — exchanges an Apple identity token
 *                          for an API session (sets cookies, returns
 *                          `TokenPair` in the body for mobile clients).
 *
 * The class mirrors `CoreAuthController`'s shape (decorator stack, IP
 * extraction, cookie helpers, audit emission) deliberately — diverging
 * here is how subtle bugs creep in across modules.
 *
 * Throttled by the `login-ip` bucket (auth-method modules share a
 * single login-per-IP cap so a brute-force loop can't switch providers
 * to escape limits).
 */
import {
  Body,
  Controller,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { TokenPair } from "../core-auth/dto/token-pair";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";
import { THROTTLER_NAMES } from "../../throttler.config";

import { AppleAuthService } from "./apple.service";
import { SignInWithAppleInput } from "./dto/sign-in-with-apple.input";

@ApiTags("auth")
@Controller({ path: "auth/apple", version: "1" })
export class AppleAuthController {
  constructor(
    private readonly appleAuth: AppleAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post()
  @Throttle({ [THROTTLER_NAMES.loginIp]: {} })
  @ApiOperation({
    summary: "Exchange an Apple identity token for an API session.",
    description:
      "Verifies the JWT against Apple's JWKS. On success, resolves or creates the user, issues a session, sets HttpOnly cookies, and returns a TokenPair. See docs/auth/apple-signin.md for the auto-link decision matrix.",
  })
  @ZodResponse({ status: HttpStatus.OK, type: TokenPair })
  @ApiUnauthorizedResponse({
    description:
      "Apple identity token failed verification (signature, audience, issuer, expiry), or a subsequent sign-in arrived without a known AuthAccount row.",
  })
  @ApiConflictResponse({
    description:
      "A user with this email exists but the email is not verified on our side. Sign in via another method first, then link Apple from settings.",
  })
  async signin(
    @Body() body: SignInWithAppleInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<v1.auth.TokenPair> {
    const result = await this.appleAuth.signIn({
      idToken: body.idToken,
      fullName: body.fullName ?? null,
      userAgent: req.header("user-agent") ?? null,
      ip: requestIp(req),
    });

    setAuthCookies(res, this.env, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessTokenExpiresInSec: result.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: result.refreshTokenExpiresInSec,
    });

    return result.tokens;
  }
}

/**
 * Pull the client IP off the Express request, honoring the
 * `X-Forwarded-For` header from any upstream load balancer. Matches the
 * helper at the bottom of `core-auth.controller.ts` — duplicated here
 * rather than re-imported because the file lives under
 * `modules/core-auth/` and importing across method modules creates a
 * direct coupling.
 */
function requestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
