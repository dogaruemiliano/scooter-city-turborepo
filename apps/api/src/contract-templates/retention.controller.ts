import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import { RequirePermissions } from "../access/access.decorators";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthPrincipal } from "../auth/auth.types";
import { ContractRetentionService } from "./retention.service";

class Policy extends createZodDto(v1.contracts.retentionPolicyInputSchema) {}
class PolicyApproval extends createZodDto(
  v1.contracts.retentionPolicyApprovalInputSchema,
) {}
class Preview extends createZodDto(v1.contracts.retentionPreviewInputSchema) {}
class Approval extends createZodDto(
  v1.contracts.retentionApprovalInputSchema,
) {}
class Execute extends createZodDto(v1.contracts.retentionExecuteInputSchema) {}
class Hold extends createZodDto(v1.contracts.retentionHoldInputSchema) {}
class Release extends createZodDto(
  v1.contracts.retentionHoldReleaseInputSchema,
) {}

@Controller({ path: "contracts/retention", version: "1" })
export class ContractRetentionController {
  constructor(readonly retention: ContractRetentionService) {}
  @Get()
  @RequirePermissions("evidence.retention.manage")
  list(@CurrentUser() user: AuthPrincipal) {
    return this.retention.list(user.id);
  }
  @Post("policies")
  @RequirePermissions("evidence.retention.manage")
  policy(@CurrentUser() user: AuthPrincipal, @Body() input: Policy) {
    return this.retention.createPolicy(user.id, input);
  }
  @Post("policies/:id/approve")
  @RequirePermissions("evidence.retention.purge")
  approvePolicy(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: PolicyApproval,
  ) {
    return this.retention.approvePolicy(user.id, id, input.statement);
  }
  @Post("holds")
  @RequirePermissions("evidence.retention.manage")
  hold(@CurrentUser() user: AuthPrincipal, @Body() input: Hold) {
    return this.retention.hold(user.id, input);
  }
  @Post("holds/:id/release")
  @RequirePermissions("evidence.retention.purge")
  release(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Release,
  ) {
    return this.retention.releaseHold(user.id, id, input.reason);
  }
  @Post("previews")
  @RequirePermissions("evidence.retention.manage")
  preview(@CurrentUser() user: AuthPrincipal, @Body() input: Preview) {
    return this.retention.preview(user.id, input);
  }
  @Get("batches/:id")
  @RequirePermissions("evidence.retention.manage")
  batch(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.retention.get(user.id, id);
  }
  @Post("batches/:id/approve")
  @RequirePermissions("evidence.retention.purge")
  approve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Approval,
  ) {
    return this.retention.approve(user.id, id, input);
  }
  @Post("batches/:id/execute")
  @RequirePermissions("evidence.retention.purge")
  execute(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Execute,
  ) {
    return this.retention.execute(user.id, id, input.manifestHash);
  }
  @Post("batches/:id/retry")
  @RequirePermissions("evidence.retention.purge")
  retry(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: Execute,
  ) {
    return this.retention.execute(user.id, id, input.manifestHash);
  }
}
