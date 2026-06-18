import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Body,
  Param,
  Patch,
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
import { UsersService } from "../../../users/users.service";
import type { AuthPrincipal } from "../../auth.types";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { clearAuthCookies } from "../../utils/cookies";
import { SessionUser } from "./dto/session-user";
import { LinkedAccountService } from "./linked-account.service";
import { UpdateProfileInput } from "./dto/update-profile.input";

@ApiTags("auth")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@Controller({ path: "auth", version: "1" })
export class AuthIdentityController {
  constructor(
    private readonly users: UsersService,
    private readonly linkedAccounts: LinkedAccountService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("me")
  @ApiOperation({
    operationId: "CoreAuthController_me_v1",
    summary: "Current user profile",
  })
  @ZodResponse({ type: SessionUser })
  async me(@CurrentUser() user: AuthPrincipal): Promise<v1.auth.SessionUser> {
    const row = await this.users.findAccountProfileById(user.id);
    if (!row) {
      throw new UnauthorizedException();
    }
    return this.toSessionUser(row);
  }

  @Patch("me")
  @ApiOperation({
    operationId: "CoreAuthController_updateProfile_v1",
    summary: "Update the current user's editable profile fields",
  })
  @ZodResponse({ type: SessionUser })
  async updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: UpdateProfileInput,
  ): Promise<v1.auth.SessionUser> {
    await this.users.updateProfile(user.id, input);
    const row = await this.users.findAccountProfileById(user.id);
    if (!row) {
      throw new UnauthorizedException();
    }
    return this.toSessionUser(row);
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "CoreAuthController_deleteMe_v1",
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
      userId: null,
      ...getRequestMetadata(req),
      meta: { userId: user.id },
    });
  }

  @Delete("accounts/:provider")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "CoreAuthController_unlinkOAuthAccount_v1",
    summary:
      "Unlink an OAuth identity. Refuses if doing so would leave the user with no remaining auth method.",
  })
  @ApiNoContentResponse()
  async unlinkOAuthAccount(
    @CurrentUser() user: AuthPrincipal,
    @Param("provider") providerParam: string,
    @Req() req: Request,
  ): Promise<void> {
    const provider = await this.linkedAccounts.unlink(user.id, providerParam);
    await this.audit.record({
      type: AuditEventType.OAUTH_UNLINKED,
      userId: user.id,
      ...getRequestMetadata(req),
      meta: { provider },
    });
  }

  private toSessionUser(
    row: NonNullable<
      Awaited<ReturnType<UsersService["findAccountProfileById"]>>
    >,
  ): v1.auth.SessionUser {
    const linkedProviders = Array.from(
      new Set(
        row.authAccounts
          .map((account) => account.provider)
          .filter((provider): provider is v1.auth.OAuthProvider =>
            v1.auth.OAUTH_PROVIDERS.includes(provider as v1.auth.OAuthProvider),
          ),
      ),
    );

    return {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified?.toISOString() ?? null,
      phone: row.phone,
      phoneVerified: row.phoneVerified?.toISOString() ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
      roles: row.roles,
      linkedProviders,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
