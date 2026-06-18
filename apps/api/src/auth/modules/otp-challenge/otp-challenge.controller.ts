import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { ZodResponse } from "nestjs-zod";

import { getRequestMetadata } from "../../../common/http/request-metadata";
import { getRequestLocale } from "../../../common/i18n/request-locale";
import { OtpRequestBurst } from "../../decorators/otp-request-burst.decorator";
import { Public } from "../../decorators/public.decorator";

import { OtpChallengeMetadata } from "./dto/otp-challenge-metadata";
import { ResendOtpChallengeInput } from "./dto/resend-otp-challenge.input";
import { OtpChallengeService } from "./otp-challenge.service";

@ApiTags("auth")
@Controller({ path: "auth/otp", version: "1" })
export class OtpChallengeController {
  constructor(private readonly challenges: OtpChallengeService) {}

  @Public()
  @OtpRequestBurst()
  @Post("resend")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      "Resend an OTP challenge when its server-controlled cooldown has elapsed.",
  })
  @ZodResponse({ status: HttpStatus.ACCEPTED, type: OtpChallengeMetadata })
  @ApiUnauthorizedResponse({
    description: "The challenge is missing, used, expired, or locked.",
  })
  resend(
    @Body() body: ResendOtpChallengeInput,
    @Req() req: Request,
  ): Promise<OtpChallengeMetadata> {
    return this.challenges.resend(
      body.challengeId,
      getRequestMetadata(req).ip,
      getRequestLocale(req),
    );
  }
}
