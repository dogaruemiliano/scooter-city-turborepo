import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  RequireSuperAdmin,
  RequireAllScope,
  RequireAnyAllScope,
} from "./access.decorators";
import { AccessService } from "./access.service";
class CreateUserInput extends createZodDto(v1.access.createUserInputSchema) {}
class UserAccessInput extends createZodDto(v1.access.userAccessInputSchema) {}
class CreateRoleInput extends createZodDto(v1.access.createRoleInputSchema) {}
class UpdateRoleInput extends createZodDto(v1.access.updateRoleInputSchema) {}
class RevisionInput extends createZodDto(v1.access.revisionInputSchema) {}
class StatusInput extends createZodDto(v1.access.statusInputSchema) {}
class SuperAdminInput extends createZodDto(v1.access.superAdminInputSchema) {}
class CustomerAccessInput extends createZodDto(
  v1.access.customerAccessInputSchema,
) {}
class AccessUser extends createZodDto(v1.access.accessUserSchema) {}
class UserList extends createZodDto(v1.access.accessUserListSchema) {}
class AccessRole extends createZodDto(v1.access.roleSchema) {}
class RoleList extends createZodDto(v1.access.roleListSchema) {}
class AccessPreview extends createZodDto(v1.access.accessPreviewSchema) {}
class RolePreview extends createZodDto(v1.access.rolePreviewSchema) {}
class UserQuery extends createZodDto(
  z
    .object({
      search: z.string().trim().max(200).default(""),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .strict(),
) {}
class AuditList extends createZodDto(v1.access.accessAuditListSchema) {}

@ApiTags("users")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireAllScope("users.read")
@Controller({ path: "users", version: "1" })
export class AccessUsersController {
  constructor(private readonly access: AccessService) {}
  @Get() @ZodResponse({ type: UserList }) list(@Query() query: UserQuery) {
    return this.access.listUsers(query.search, query.offset);
  }
  @RequireAllScope("users.invite")
  @Post()
  @ZodResponse({ type: AccessUser, status: 201 })
  async create(
    @CurrentUser() u: AuthPrincipal,
    @Body() input: CreateUserInput,
  ) {
    await this.access.assertBaseRoles(input.roles);
    return this.access.createUser(u.id, input);
  }
  @Get(":id") @ZodResponse({ type: AccessUser }) get(@Param("id") id: string) {
    return this.access.getUser(id);
  }
  @Get(":id/audit-events") @ZodResponse({ type: AuditList }) history(
    @Param("id") id: string,
  ) {
    return this.access.history("User", id);
  }
  @RequireAnyAllScope("users.roles.update", "users.permissions.update")
  @Post(":id/access/preview")
  @ZodResponse({ type: AccessPreview })
  async preview(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UserAccessInput,
  ) {
    await this.access.assertBaseRoles(input.roles);
    return this.access.previewAccess(u.id, id, input);
  }
  @RequireAnyAllScope("users.roles.update", "users.permissions.update")
  @Put(":id/access")
  @ZodResponse({ type: AccessUser })
  async update(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UserAccessInput,
  ) {
    await this.access.assertBaseRoles(input.roles);
    return this.access.updateAccess(u.id, id, input);
  }
  @RequireAllScope("users.invite")
  @Post(":id/invitations")
  @ZodResponse({ type: AccessUser })
  invite(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.access.invite(u.id, id, input.expectedRevision);
  }
  @RequireAllScope("users.invite")
  @Delete(":id/invitations/current")
  @ZodResponse({ type: AccessUser })
  cancel(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.access.cancelInvitation(u.id, id, input.expectedRevision);
  }
  @RequireAllScope("users.status.update")
  @Put(":id/status")
  @ZodResponse({ type: AccessUser })
  status(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: StatusInput,
  ) {
    return this.access.setStatus(u.id, id, input);
  }
  @RequireSuperAdmin()
  @Put(":id/super-admin")
  @ZodResponse({ type: AccessUser })
  designation(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: SuperAdminInput,
  ) {
    return this.access.setSuperAdmin(u.id, id, input);
  }
}
@ApiTags("access")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireAllScope("roles.read")
@Controller({ path: "access", version: "1" })
export class AccessRolesController {
  constructor(private readonly access: AccessService) {}
  @Get("permissions") catalog() {
    return { items: v1.access.permissionCatalog };
  }
  @RequireAnyAllScope("roles.read", "users.read")
  @Get("roles")
  @ZodResponse({ type: RoleList })
  async list() {
    const result = await this.access.listRoles();
    return {
      items: result.items.filter(
        (role) =>
          !role.archivedAt &&
          (v1.access.BASE_ROLE_SLUGS as readonly string[]).includes(role.slug),
      ),
    };
  }
  @RequireSuperAdmin()
  @Post("roles")
  @ZodResponse({ type: AccessRole, status: 201 })
  create(@Body() input: CreateRoleInput): never {
    void input;
    throw new BadRequestException(
      "The available roles are Admin, Mechanic, and Client. Customize a member's permissions instead.",
    );
  }
  @Get("roles/:id") @ZodResponse({ type: AccessRole }) get(
    @Param("id") id: string,
  ) {
    return this.access.getRole(id);
  }
  @Get("roles/:id/audit-events") @ZodResponse({ type: AuditList }) history(
    @Param("id") id: string,
  ) {
    return this.access.history("Role", id);
  }
  @RequireAllScope("roles.update")
  @Post("roles/:id/preview")
  @ZodResponse({ type: RolePreview })
  async preview(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UpdateRoleInput,
  ) {
    await this.access.assertBuiltInRole(id);
    return this.access.previewRole(u.id, id, input);
  }
  @RequireAllScope("roles.update")
  @Put("roles/:id")
  @ZodResponse({ type: AccessRole })
  async update(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UpdateRoleInput,
  ) {
    await this.access.assertBuiltInRole(id);
    return this.access.updateRole(u.id, id, input);
  }
  @RequireSuperAdmin()
  @Post("roles/:id/archive")
  @ZodResponse({ type: AccessRole })
  archive(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.access.archiveRole(u.id, id, input.expectedRevision);
  }
}
@ApiTags("persons")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireSuperAdmin()
@Controller({ path: "persons", version: "1" })
export class PersonAccessController {
  constructor(private readonly access: AccessService) {}
  @Get(":id/app-access")
  @ZodResponse({ type: AccessUser })
  get(@Param("id") id: string) {
    return this.access.personAccess(id);
  }
  @Put(":id/app-access") @ZodResponse({ type: AccessUser }) update(
    @CurrentUser() u: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: CustomerAccessInput,
  ) {
    return this.access.customerAccess(u.id, id, input);
  }
}
