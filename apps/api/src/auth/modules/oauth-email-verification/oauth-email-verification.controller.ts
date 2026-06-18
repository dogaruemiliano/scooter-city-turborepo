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
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { getRequestMetadata } from "../../../common/http/request-metadata";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { Public } from "../../decorators/public.decorator";
import { setAuthCookies } from "../../utils/cookies";
import { TokenPair } from "../core-auth/dto/token-pair";

import { VerifyOAuthEmailInput } from "./dto/verify-oauth-email.input";
import { OAuthEmailVerificationService } from "./oauth-email-verification.service";

@ApiTags("auth")
@Controller({ path: "auth/oauth-email", version: "1" })
export class OAuthEmailVerificationController {
  constructor(
    private readonly service: OAuthEmailVerificationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post("verify")
  @ApiOperation({
    summary:
      "Complete an OAuth sign-in by proving ownership of an email the provider did not mark as verified.",
  })
  @ZodResponse({ status: HttpStatus.OK, type: TokenPair })
  @ApiUnauthorizedResponse({
    description:
      "Invalid or expired code. Missing, used, expired, locked, and wrong-code challenges return the same response.",
  })
  async verify(
    @Body() body: VerifyOAuthEmailInput,
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
