/**
 * Email-OTP HTTP surface.
 *
 * Routes (both public):
 *
 *   POST /v1/auth/email-otp/request   body { email }
 *   POST /v1/auth/email-otp/verify    body { challengeId, code }
 *
 * `/request` returns the same challenge metadata for existing and new
 * addresses. User creation happens only after successful verification.
 *
 * Throttling: `/request` is rate-limited per IP, per target email, and
 * per target email per day. `/verify` is rate-limited per IP only; the
 * `attemptsCount` counter on the `OtpChallenge` row provides the per-row
 * lockout against attempt-spraying on a single code. See
 * `docs/auth/rate-limiting.md` for the bucket layout.
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
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { getRequestMetadata } from "../../../common/http/request-metadata";
import { getRequestLocale } from "../../../common/i18n/request-locale";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { OtpRequestBurst } from "../../decorators/otp-request-burst.decorator";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";
import { TokenPair } from "../core-auth/dto/token-pair";
import { OtpChallengeMetadata } from "../otp-challenge/dto/otp-challenge-metadata";

import { RequestEmailOtpInput } from "./dto/request-email-otp.input";
import { VerifyEmailOtpInput } from "./dto/verify-email-otp.input";
import { EmailOtpService } from "./email-otp.service";

@ApiTags("auth")
@Controller({ path: "auth/email-otp", version: "1" })
export class EmailOtpController {
  constructor(
    private readonly service: EmailOtpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @OtpRequestBurst()
  @Post("request")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      "Start or resume passwordless email sign-up/sign-in and return an opaque challenge ID.",
  })
  @ZodResponse({ status: HttpStatus.ACCEPTED, type: OtpChallengeMetadata })
  async request(
    @Body() body: RequestEmailOtpInput,
    @Req() req: Request,
  ): Promise<OtpChallengeMetadata> {
    return this.service.request({
      email: body.email,
      locale: getRequestLocale(req),
      ...getRequestMetadata(req),
    });
  }

  @Public()
  @Post("verify")
  @ApiOperation({
    summary:
      "Email-OTP verify: exchange a valid code for a fresh session (cookies set + TokenPair returned).",
  })
  @ZodResponse({ status: HttpStatus.OK, type: TokenPair })
  @ApiUnauthorizedResponse({
    description:
      "Invalid, expired, used, cross-purpose, or attempt-locked challenge.",
  })
  async verify(
    @Body() body: VerifyEmailOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPair> {
    const result = await this.service.verify({
      challengeId: body.challengeId,
      code: body.code,
      ...getRequestMetadata(req),
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
