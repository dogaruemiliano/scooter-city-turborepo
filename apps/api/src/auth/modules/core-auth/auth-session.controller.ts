import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { getRequestMetadata } from "../../../common/http/request-metadata";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import type { AuthPrincipal } from "../../auth.types";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Public } from "../../decorators/public.decorator";
import { clearAuthCookies, setAuthCookies } from "../../utils/cookies";
import { CoreAuthService } from "./core-auth.service";
import { LogoutAllResult } from "./dto/logout-all-result";
import { RefreshTokenInput } from "./dto/refresh-token.input";
import { SessionSummary } from "./dto/session-summary";
import { TokenPair } from "./dto/token-pair";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthSessionController {
  constructor(
    private readonly coreAuth: CoreAuthService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post("refresh")
  @ApiOperation({
    operationId: "CoreAuthController_refresh_v1",
    summary: "Rotate the refresh token (cookie or body)",
  })
  @ZodResponse({ status: HttpStatus.OK, type: TokenPair })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshTokenInput,
  ): Promise<TokenPair> {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const cookieToken = cookies?.[v1.auth.REFRESH_TOKEN_COOKIE];
    const token = cookieToken ?? body.refreshToken;
    if (!token) {
      throw new UnauthorizedException("No refresh token provided");
    }

    const pair = await this.coreAuth.rotateTokens(token);
    setAuthCookies(res, this.env, {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessTokenExpiresInSec: pair.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: pair.refreshTokenExpiresInSec,
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
  @ApiOperation({
    operationId: "CoreAuthController_logout_v1",
    summary: "Revoke the current session",
  })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.coreAuth.revokeSession(user.sessionId, user.id);
    clearAuthCookies(res, this.env);
    await this.audit.record({
      type: AuditEventType.SESSION_REVOKED,
      userId: user.id,
      ...getRequestMetadata(req),
      meta: { sessionId: user.sessionId, reason: "logout" },
    });
  }

  @Post("logout-all")
  @ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
  @ApiOperation({
    operationId: "CoreAuthController_logoutAll_v1",
    summary: "Revoke every session of the current user (including this one)",
  })
  @ZodResponse({ status: HttpStatus.OK, type: LogoutAllResult })
  async logoutAll(
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutAllResult> {
    const revoked = await this.coreAuth.revokeAllUserSessions(user.id);
    clearAuthCookies(res, this.env);
    await this.audit.record({
      type: AuditEventType.LOGOUT_ALL,
      userId: user.id,
      ...getRequestMetadata(req),
      meta: { sessionsRevoked: revoked },
    });
    return { sessionsRevoked: revoked };
  }

  @Get("sessions")
  @ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
  @ApiOperation({
    operationId: "CoreAuthController_listSessions_v1",
    summary: "List active sessions ('devices')",
  })
  @ZodResponse({ type: [SessionSummary] })
  async listSessions(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.auth.SessionSummary[]> {
    const rows = await this.coreAuth.listSessions(user.id);
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      current: row.id === user.sessionId,
    }));
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
  @ApiOperation({
    operationId: "CoreAuthController_revokeSpecificSession_v1",
    summary: "Revoke one specific session",
  })
  @ApiNoContentResponse()
  async revokeSpecificSession(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") sessionId: string,
    @Req() req: Request,
  ): Promise<void> {
    const revoked = await this.coreAuth.revokeUserSession(sessionId, user.id);
    if (!revoked) {
      throw new NotFoundException("Session not found");
    }
    await this.audit.record({
      type: AuditEventType.SESSION_REVOKED,
      userId: user.id,
      ...getRequestMetadata(req),
      meta: { sessionId, reason: "user-revoked-other-device" },
    });
  }
}
