/**
 * HTTP surface for Sign in with Apple.
 *
 *   POST /v1/auth/apple    public — exchanges an Apple identity token
 *                          for an API session, or starts an email-proof
 *                          challenge when needed.
 *
 * The class follows the same thin HTTP-boundary shape as the other auth
 * controllers: request metadata in, service orchestration, cookies out.
 *
 * Throttled by the `login-ip` bucket (auth-method modules share a
 * single login-per-IP cap so a brute-force loop can't switch providers
 * to escape limits).
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
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { LoginBurst } from "../../decorators/login-burst.decorator";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";
import { TokenPair } from "../core-auth/dto/token-pair";
import { OAuthEmailVerificationRequired } from "../oauth-email-verification/dto/oauth-email-verification-required";

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
  @LoginBurst()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Exchange an Apple identity token for an API session.",
    description:
      "Verifies the JWT against Apple's JWKS. On success, resolves or creates the user, issues a session, sets HttpOnly cookies, and returns a TokenPair. See docs/auth/apple-signin.md for the auto-link decision matrix.",
  })
  @ZodSerializerDto(v1.auth.oauthSignInResultSchema)
  @ApiOkResponse({
    type: TokenPair.Output,
    description: "Provider identity resolved; first-party session issued.",
  })
  @ApiAcceptedResponse({
    type: OAuthEmailVerificationRequired.Output,
    description:
      "Apple did not verify the email. A one-time code was sent and must be submitted to /v1/auth/oauth-email/verify.",
  })
  @ApiUnauthorizedResponse({
    description:
      "The token failed verification, or an unlinked Apple identity omitted email entirely.",
  })
  async signin(
    @Body() body: SignInWithAppleInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<v1.auth.OAuthSignInResult> {
    const result = await this.appleAuth.signIn({
      idToken: body.idToken,
      fullName: body.fullName ?? null,
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
