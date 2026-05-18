/**
 * Email-OTP HTTP surface.
 *
 * Routes (both public):
 *
 *   POST /v1/auth/email-otp/request   body { email }
 *   POST /v1/auth/email-otp/verify    body { email, code }
 *
 * `/request` returns a constant `{ status: "sent" }` whether or not the
 * email matched a real user — disclosing the difference would defeat
 * the anti-enumeration goal. See `docs/auth/otp.md` for the full
 * write-up.
 *
 * Throttling: `/request` is rate-limited per IP, per target email, and
 * per target email per day. `/verify` is rate-limited per IP only; the
 * `attemptsCount` counter on the `OtpToken` row provides the per-row
 * lockout against attempt-spraying on a single code. See
 * `docs/auth/rate-limiting.md` for the bucket layout.
 */
import { Body, Controller, HttpStatus, Post, Req, Res } from "@nestjs/common";
import {
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { Public } from "../../decorators/public.decorator";
import { TokenPair } from "../core-auth/dto/token-pair";

import { OtpRequestResponse } from "./dto/otp-request-response";
import { RequestEmailOtpInput } from "./dto/request-email-otp.input";
import { VerifyEmailOtpInput } from "./dto/verify-email-otp.input";
import { EmailOtpService } from "./email-otp.service";

// Throttling: the four named throttler buckets configured at module
// level (`otp-ip`, `otp-target`, `otp-target-daily`, `login-ip` — see
// `throttler.config.ts`) all apply to every route by default. We do not
// override limits per-route here: env (`THROTTLE_OTP_*`) is the single
// source of truth, and every bucket enforces its limit independently.
//
// `otp-target` / `otp-target-daily` currently fall back to IP keying —
// no custom request-body tracker has shipped yet. Under a single IP
// they're effectively redundant with `otp-ip`. Flagged in `[INTEGRATION]`.

@ApiTags("auth")
@Controller({ path: "auth/email-otp", version: "1" })
export class EmailOtpController {
  constructor(private readonly service: EmailOtpService) {}

  @Public()
  @Post("request")
  @ApiOperation({
    summary:
      "Email-OTP request: mail a single-use 6-digit code if the email matches a real user. Always returns 202; the response does not disclose whether the address is known.",
  })
  @ZodResponse({ status: HttpStatus.ACCEPTED, type: OtpRequestResponse })
  async request(
    @Body() body: RequestEmailOtpInput,
    @Req() req: Request,
  ): Promise<OtpRequestResponse> {
    await this.service.request({
      email: body.email,
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
    });
    return { status: "sent" };
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
      "Invalid or expired code. The response is intentionally identical whether the email is unknown, the row is expired, the code is wrong, or the row has hit OTP_MAX_ATTEMPTS.",
  })
  async verify(
    @Body() body: VerifyEmailOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPair> {
    const pair = await this.service.verify({
      email: body.email,
      code: body.code,
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      res,
    });
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }
}

function requestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
