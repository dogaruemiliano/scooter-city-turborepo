import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
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
  ApiConsumes,
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";

import { pipeline } from "node:stream/promises";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  UserAvatarService,
  AVATAR_MAX_BYTES,
} from "../../../users/user-avatar.service";

import { AccessService } from "../../../access/access.service";
import { SelfService } from "../../../access/access.decorators";
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

@SelfService()
@ApiTags("auth")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@Controller({ path: "auth", version: "1" })
export class AuthIdentityController {
  constructor(
    private readonly users: UsersService,
    private readonly access: AccessService,
    private readonly linkedAccounts: LinkedAccountService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    private readonly avatars: UserAvatarService,
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
    return this.toSessionUser(row, user);
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
    return this.toSessionUser(row, user);
  }

  @Post("me/avatar")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOperation({
    operationId: "CoreAuthController_uploadAvatar_v1",
    summary: "Replace the current user's profile picture",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  @ZodResponse({ type: SessionUser })
  async uploadAvatar(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.avatars.upload(user.id, file);
    return this.me(user);
  }

  @Delete("me/avatar")
  @ApiOperation({
    operationId: "CoreAuthController_removeAvatar_v1",
    summary: "Remove the current user's profile picture",
  })
  @ZodResponse({ type: SessionUser })
  async removeAvatar(@CurrentUser() user: AuthPrincipal) {
    await this.avatars.replace(user.id, null);
    return this.me(user);
  }

  @Get("avatars/:assetId")
  @ApiOperation({
    operationId: "CoreAuthController_avatarContent_v1",
    summary: "Read an attached user avatar (authentication required)",
  })
  async avatarContent(@Param("assetId") assetId: string, @Res() res: Response) {
    const content = await this.avatars.read(assetId);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "CoreAuthController_deleteMe_v1",
    summary:
      "Deactivate the current account. Authentication credentials are deleted while business and audit history are preserved.",
  })
  @ApiNoContentResponse()
  async deleteMe(
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.deactivateAccount(user.id, getRequestMetadata(req));
    clearAuthCookies(res, this.env);
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

  private async toSessionUser(
    row: NonNullable<
      Awaited<ReturnType<UsersService["findAccountProfileById"]>>
    >,
    principal: AuthPrincipal,
  ): Promise<v1.auth.SessionUser> {
    const access =
      principal.access ?? (await this.access.getSnapshot(principal.id));
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
      avatarAssetId: row.avatarAssetId,
      firstName: row.firstName,
      lastName: row.lastName,
      roles: row.roles,
      isSuperAdmin: access.isSuperAdmin,
      isAdmin: access.isAdmin === true,
      effectiveScopes: access.effectiveScopes,
      accessRevision: access.accessRevision,
      portalEligible: access.portalEligible,
      roleVersions: access.roleVersions,
      linkedProviders,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
