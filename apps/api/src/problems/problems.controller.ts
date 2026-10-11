import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../access/access.decorators";
import { ProblemsService } from "./problems.service";

class CreateInput extends createZodDto(v1.problems.createProblemInputSchema) {}
class UpdateInput extends createZodDto(v1.problems.updateProblemInputSchema) {}
class ResolveInput extends createZodDto(
  v1.problems.resolveProblemInputSchema,
) {}
class AssignInput extends createZodDto(v1.problems.assignProblemInputSchema) {}
class PriorityInput extends createZodDto(
  v1.problems.prioritizeProblemInputSchema,
) {}
class RevisionInput extends createZodDto(v1.problems.revisionInputSchema) {}
class ListQuery extends createZodDto(v1.problems.listProblemsQuerySchema) {}
class Problem extends createZodDto(v1.problems.problemSchema) {}
class ProblemList extends createZodDto(v1.problems.problemListSchema) {}
class AssigneeList extends createZodDto(
  v1.problems.eligibleAssigneeListSchema,
) {}
class MaintenanceScooter extends createZodDto(
  v1.problems.maintenanceScooterSchema,
) {}

@ApiTags("problems")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "problems", version: "1" })
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  @RequirePermissions("problems.read")
  @ZodResponse({ type: ProblemList })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.problems.list(user.id, query);
  }

  @Get("eligible-assignees")
  @RequirePermissions("problems.assign")
  @ZodResponse({ type: AssigneeList })
  assignees(
    @CurrentUser() user: AuthPrincipal,
    @Query("search") search?: string,
  ) {
    return this.problems.assignees(
      user.id,
      typeof search === "string" ? search.trim().slice(0, 100) : "",
    );
  }

  @Get("scooters/:id")
  @RequirePermissions("scooters.read")
  @ZodResponse({ type: MaintenanceScooter })
  scooter(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.problems.scooter(user.id, id);
  }

  @Get(":id")
  @RequirePermissions("problems.read")
  @ZodResponse({ type: Problem })
  get(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.problems.get(user.id, id);
  }

  @Post()
  @RequirePermissions("problems.create")
  @ZodResponse({ status: 201, type: Problem })
  create(@CurrentUser() user: AuthPrincipal, @Body() input: CreateInput) {
    return this.problems.create(user.id, input);
  }

  @Patch(":id")
  @RequirePermissions("problems.update")
  @ZodResponse({ type: Problem })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UpdateInput,
  ) {
    return this.problems.update(user.id, id, input);
  }

  @Post(":id/claim")
  @RequirePermissions("problems.claim")
  @ZodResponse({ status: 201, type: Problem })
  claim(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.problems.claim(user.id, id, input.revision);
  }

  @Put(":id/assignee")
  @RequirePermissions("problems.assign")
  @ZodResponse({ type: Problem })
  assign(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: AssignInput,
  ) {
    return this.problems.assign(user.id, id, input);
  }

  @Put(":id/priority")
  @RequirePermissions("problems.prioritize")
  @ZodResponse({ type: Problem })
  prioritize(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: PriorityInput,
  ) {
    return this.problems.prioritize(user.id, id, input);
  }

  @Post(":id/resolve")
  @RequirePermissions("problems.resolve")
  @ZodResponse({ status: 201, type: Problem })
  resolve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: ResolveInput,
  ) {
    return this.problems.resolve(user.id, id, input);
  }

  @Post(":id/reopen")
  @RequirePermissions("problems.reopen")
  @ZodResponse({ status: 201, type: Problem })
  reopen(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.problems.reopen(user.id, id, input.revision);
  }

  @Post(":id/cancel")
  @RequirePermissions("problems.update")
  @ZodResponse({ status: 201, type: Problem })
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: RevisionInput,
  ) {
    return this.problems.cancel(user.id, id, input.revision);
  }
}
