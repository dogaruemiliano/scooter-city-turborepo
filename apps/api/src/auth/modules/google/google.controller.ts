/**
 * Public-surface controller for Google Sign-in.
 *
 * One endpoint:
 *
 *   POST /v1/auth/google    public, throttled with `login-ip` bucket
 *
 * Flow:
 *   1. Verify the Google-issued ID token (signature + audience + expiry).
 *   2. Resolve the user, audit the outcome, and mint a first-party
 *      session through `GoogleAuthService.signIn`, or return a
 *      verification challenge when the email needs independent proof.
 *      Google's token is discarded after verification — we never
 *      persist or replay it.
 *   3. On authentication, drop our access + refresh cookies and return
 *      the `TokenPair`. Challenges return 202 without cookies.
 *
 * The controller captures request metadata and owns HTTP-only concerns.
 * Verification, linking, auditing, and session issuance live in the
 * service.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { ZodSerializerDto } from "nestjs-zod";

import { getRequestMetadata } from "../../../common/http/request-metadata";
import { getRequestLocale } from "../../../common/i18n/request-locale";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { LoginBurst } from "../../decorators/login-burst.decorator";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";
import { TokenPair } from "../core-auth/dto/token-pair";
import { OAuthEmailVerificationRequired } from "../oauth-email-verification/dto/oauth-email-verification-required";

import { SignInWithGoogleInput } from "./dto/sign-in-with-google.input";
import { GoogleAuthService } from "./google.service";

@ApiTags("auth")
@Controller({ path: "auth/google", version: "1" })
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @LoginBurst()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in with a Google-issued ID token",
    description:
      "Exchanges a Google ID token (from Google Identity Services on web, or the native Google Sign-In SDK on mobile) for a first-party session. Verification is local: we check the JWT signature, expiry, and audience against the configured `GOOGLE_CLIENT_ID_*` client IDs. Google's token is discarded after verification — subsequent requests authenticate with the access/refresh tokens this endpoint returns.",
  })
  @ZodSerializerDto(v1.auth.oauthSignInResultSchema)
  @ApiOkResponse({
    type: TokenPair.Output,
    description: "Provider identity resolved; first-party session issued.",
  })
  @ApiAcceptedResponse({
    type: OAuthEmailVerificationRequired.Output,
    description:
      "The provider did not verify the email. A one-time code was sent and must be submitted to /v1/auth/oauth-email/verify.",
  })
  @ApiUnauthorizedResponse({
    description: "The Google identity token failed verification.",
  })
  async signin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: SignInWithGoogleInput,
  ): Promise<v1.auth.OAuthSignInResult> {
    const result = await this.google.signIn({
      idToken: body.idToken,
      locale: getRequestLocale(req),
      ...getRequestMetadata(req),
    });

    if (result.kind === "verification-required") {
      res.status(HttpStatus.ACCEPTED);
      return result.challenge;
    }

    setAuthCookies(res, this.env, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessTokenExpiresInSec: result.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: result.refreshTokenExpiresInSec,
    });

    return result.tokens;
  }
}
