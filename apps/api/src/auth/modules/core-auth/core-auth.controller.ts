/**
 * Public-surface auth endpoints under `/v1/auth/...`.
 *
 * Routes:
 *
 *   POST   /refresh                  public — rotate the refresh token
 *   POST   /logout                   revoke the current session
 *   POST   /logout-all               revoke every session of the user
 *   GET    /me                       current user profile
 *   DELETE /me                       hard-delete the account (cascade)
 *   GET    /sessions                 active "devices" list
 *   DELETE /sessions/:id             revoke a specific session
 *   DELETE /accounts/:provider       unlink an OAuth identity
 *
 * Authentication is enforced globally by [JwtAuthGuard](../../guards/jwt-auth.guard.ts);
 * `/refresh` is marked `@Public()` because it accepts the (expired)
 * access token implicitly via the refresh cookie/body, not the access
 * token.
 *
 * Every state-changing call audits one row via [AuditService](../../../audit/audit.service.ts)
 * so account-takeover investigations have a complete picture later.
 */
import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { PrismaService } from "../../../prisma/prisma.service";
import { UsersService } from "../../../users/users.service";
import type { AuthPrincipal } from "../../auth.types";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Public } from "../../decorators/public.decorator";
import { clearAuthCookies, setAuthCookies } from "../../utils/cookies";
import { CoreAuthService } from "./core-auth.service";
import { EnabledAuthMethods } from "./dto/enabled-auth-methods";
import { LogoutAllResult } from "./dto/logout-all-result";
import { RefreshTokenInput } from "./dto/refresh-token.input";
import { SessionSummary } from "./dto/session-summary";
import { SessionUser } from "./dto/session-user";
import { TokenPair } from "./dto/token-pair";

type OAuthProvider = "google" | "apple";
const OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "apple"]);

@ApiTags("auth")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@Controller({ path: "auth", version: "1" })
export class CoreAuthController {
  constructor(
    private readonly coreAuth: CoreAuthService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Session lifecycle
  // ────────────────────────────────────────────────────────────────────

  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Rotate the refresh token (cookie or body)" })
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
  @ApiOperation({ summary: "Revoke the current session" })
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
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      meta: { sessionId: user.sessionId, reason: "logout" },
    });
  }

  @Post("logout-all")
  @ApiOperation({
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
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      meta: { sessionsRevoked: revoked },
    });
    return { sessionsRevoked: revoked };
  }

  // ────────────────────────────────────────────────────────────────────
  // Identity
  // ────────────────────────────────────────────────────────────────────

  @Get("me")
  @ApiOperation({ summary: "Current user profile" })
  @ZodResponse({ type: SessionUser })
  async me(@CurrentUser() user: AuthPrincipal): Promise<v1.auth.SessionUser> {
    const row = await this.users.findById(user.id);
    if (!row) {
      // Token references a user who no longer exists (deleted via
      // DELETE /me, then attempted to reuse the still-valid access
      // token). Treat as unauthenticated.
      throw new UnauthorizedException();
    }
    return {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified?.toISOString() ?? null,
      phone: row.phone,
      phoneVerified: row.phoneVerified?.toISOString() ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Hard-delete the current user. Cascades sessions, refresh tokens, OTPs, and OAuth links. Audit events survive.",
  })
  @ApiNoContentResponse()
  async deleteMe(
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.deleteOne(user.id);
    clearAuthCookies(res, this.env);
    await this.audit.record({
      type: AuditEventType.ACCOUNT_DELETED,
      // userId left null — the row was just deleted; cascade SetNull would
      // null it out anyway. Capture the ID in `meta` for forensics.
      userId: null,
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      meta: { userId: user.id },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Active devices
  // ────────────────────────────────────────────────────────────────────

  @Get("sessions")
  @ApiOperation({ summary: "List active sessions ('devices')" })
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
  @ApiOperation({ summary: "Revoke one specific session" })
  @ApiNoContentResponse()
  async revokeSpecificSession(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") sessionId: string,
    @Req() req: Request,
  ): Promise<void> {
    // Verify ownership before revoking — `revokeSession` already filters
    // on userId but we want to return a clean 404 (not silent success)
    // when the session doesn't belong to the caller.
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session || session.userId !== user.id) {
      throw new NotFoundException("Session not found");
    }
    await this.coreAuth.revokeSession(sessionId, user.id);
    await this.audit.record({
      type: AuditEventType.SESSION_REVOKED,
      userId: user.id,
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      meta: { sessionId, reason: "user-revoked-other-device" },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // OAuth identity management
  // ────────────────────────────────────────────────────────────────────

  @Delete("accounts/:provider")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Unlink an OAuth identity. Refuses if doing so would leave the user with no remaining auth method.",
  })
  @ApiNoContentResponse()
  async unlinkOAuthAccount(
    @CurrentUser() user: AuthPrincipal,
    @Param("provider") providerParam: string,
    @Req() req: Request,
  ): Promise<void> {
    if (!OAUTH_PROVIDERS.has(providerParam as OAuthProvider)) {
      throw new BadRequestException(
        `Unknown OAuth provider "${providerParam}"`,
      );
    }
    const provider = providerParam as OAuthProvider;

    const userRow = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { authAccounts: true },
    });
    if (!userRow) {
      throw new UnauthorizedException();
    }

    const accountToUnlink = userRow.authAccounts.find(
      (a) => a.provider === provider,
    );
    if (!accountToUnlink) {
      throw new NotFoundException(`No ${provider} account linked to this user`);
    }

    // Count auth methods that would remain after the unlink.
    const remainingFallbacks =
      (userRow.emailVerified !== null ? 1 : 0) +
      (userRow.phoneVerified !== null ? 1 : 0) +
      userRow.authAccounts.filter((a) => a.provider !== provider).length;
    if (remainingFallbacks === 0) {
      throw new ConflictException(
        "Cannot unlink the only auth method — link another provider or verify an OTP channel first.",
      );
    }

    await this.prisma.authAccount.delete({
      where: { id: accountToUnlink.id },
    });
    await this.audit.record({
      type: AuditEventType.OAUTH_UNLINKED,
      userId: user.id,
      ip: requestIp(req),
      userAgent: req.header("user-agent") ?? null,
      meta: { provider },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Method enablement (drives web UI button visibility)
  // ────────────────────────────────────────────────────────────────────

  @Public()
  @Get("enabled-methods")
  @ApiOperation({
    summary:
      "Which auth methods this API has enabled. Drives conditional UI on the web/mobile clients.",
  })
  @ZodResponse({ type: EnabledAuthMethods })
  enabledMethods(): EnabledAuthMethods {
    return {
      emailOtp: this.env.AUTH_EMAIL_OTP_ENABLED,
      smsOtp: this.env.AUTH_SMS_OTP_ENABLED,
      google: this.env.AUTH_GOOGLE_ENABLED,
      apple: this.env.AUTH_APPLE_ENABLED,
    };
  }
}

/**
 * Pull the client IP off the Express request, honoring the
 * `X-Forwarded-For` header from any upstream load balancer. Returns
 * `null` when nothing is available (test environments etc.).
 */
function requestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
