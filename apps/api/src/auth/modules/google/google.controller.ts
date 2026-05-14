/**
 * Public-surface controller for Google Sign-in.
 *
 * One endpoint:
 *
 *   POST /v1/auth/google    public, throttled with `login-ip` bucket
 *
 * Flow:
 *   1. Verify the Google-issued ID token (signature + audience + expiry).
 *   2. Resolve the user (existing AuthAccount, auto-link by verified
 *      email, or create-new). See {@link GoogleAuthService.resolveUser}.
 *   3. Mint a first-party session via `coreAuth.issueSession`. Google's
 *      token is discarded after step 1 — we never persist or replay it.
 *   4. Drop our access + refresh cookies, return the `TokenPair`.
 *
 * Audit emission lives in the controller so the IP/UA + meta payload is
 * captured at the HTTP boundary. The service stays free of HTTP types
 * to keep unit tests trivial.
 */
import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { TokenPairResponse } from "../core-auth/dto/responses";
import { CoreAuthService } from "../core-auth/core-auth.service";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";

import { GoogleSigninDto } from "./dto/google-signin.dto";
import { GoogleAuthService } from "./google.service";

@ApiTags("auth")
@Controller({ path: "auth/google", version: "1" })
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly coreAuth: CoreAuthService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  // The four named throttler buckets are all evaluated by the global
  // `ThrottlerGuard`. OTP-flavored ones (`otp-ip`, `otp-target`,
  // `otp-target-daily`) make no sense for a token-exchange endpoint —
  // skip them explicitly and apply only `login-ip`.
  @SkipThrottle({
    "otp-ip": true,
    "otp-target": true,
    "otp-target-daily": true,
  })
  @Throttle({ "login-ip": {} })
  @HttpCode(HttpStatus.OK)
  @Post()
  @ApiOperation({
    summary: "Sign in with a Google-issued ID token",
    description:
      "Exchanges a Google ID token (from Google Identity Services on web, or the native Google Sign-In SDK on mobile) for a first-party session. Verification is local: we check the JWT signature, expiry, and audience against the configured `GOOGLE_CLIENT_ID_*` client IDs. Google's token is discarded after verification — subsequent requests authenticate with the access/refresh tokens this endpoint returns.",
  })
  @ApiBody({ type: GoogleSigninDto })
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiUnauthorizedResponse({
    description:
      "The provided ID token failed signature, audience, or expiry verification.",
  })
  @ApiConflictResponse({
    description:
      "An account with the same email exists locally, but Google has not verified that email. Sign in via another method and link Google from settings.",
  })
  async signin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: GoogleSigninDto,
  ): Promise<TokenPairResponse> {
    const ip = requestIp(req);
    const userAgent = req.header("user-agent") ?? null;

    let claims;
    try {
      claims = await this.google.verifyIdToken(body.idToken);
    } catch (err) {
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        ip,
        userAgent,
        meta: { method: "google", reason: "verifier-rejected" },
      });
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException("Invalid Google ID token");
    }

    let resolved;
    try {
      resolved = await this.google.resolveUser(claims);
    } catch (err) {
      if (err instanceof ConflictException) {
        await this.audit.record({
          type: AuditEventType.LOGIN_FAIL,
          userId: null,
          ip,
          userAgent,
          meta: {
            method: "google",
            reason: "email-not-verified-by-provider",
          },
        });
      }
      throw err;
    }

    const { user } = resolved;

    if (resolved.kind === "new-user") {
      await this.audit.record({
        type: AuditEventType.SIGNUP,
        userId: user.id,
        ip,
        userAgent,
        meta: { method: "google" },
      });
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: user.id,
        ip,
        userAgent,
        meta: { provider: "google" },
      });
    } else if (resolved.kind === "linked-to-existing") {
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: user.id,
        ip,
        userAgent,
        meta: { provider: "google" },
      });
    }

    const issued = await this.coreAuth.issueSession({
      user: { id: user.id, email: user.email },
      userAgent,
      ip,
    });

    setAuthCookies(res, this.env, {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessTokenExpiresInSec: issued.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: issued.refreshTokenExpiresInSec,
    });

    await this.audit.record({
      type: AuditEventType.LOGIN_SUCCESS,
      userId: user.id,
      ip,
      userAgent,
      meta: { method: "google" },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
    };
  }
}

/**
 * Pull the client IP off the Express request, honoring `X-Forwarded-For`
 * from any upstream load balancer. Mirrors the helper in
 * `core-auth.controller.ts`; duplicated rather than re-exported because
 * core is frozen for this PR and a single shared util file would be
 * over-engineering for two callers.
 */
function requestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
