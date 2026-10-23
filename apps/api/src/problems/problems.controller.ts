import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../access/access.decorators";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import { ProblemPhotosService } from "./problem-photos.service";
import { RequireAllScope } from "../access/access.decorators";
import { ProblemsService } from "./problems.service";

class FilterOptions extends createZodDto(
  v1.problems.problemFilterOptionsSchema,
) {}
class LocationInput extends createZodDto(
  v1.problems.businessLocationInputSchema,
) {}
class Location extends createZodDto(v1.problems.businessLocationSchema) {}
class LocationList extends createZodDto(
  v1.problems.businessLocationListSchema,
) {}
class CloseInput extends createZodDto(v1.problems.closeProblemInputSchema) {}
class HoldInput extends createZodDto(v1.problems.problemHoldInputSchema) {}
class CommentInput extends createZodDto(
  v1.problems.problemCommentInputSchema,
) {}
class ActivityQuery extends createZodDto(v1.problems.activityQuerySchema) {}
class ActivityList extends createZodDto(
  v1.problems.problemActivityListSchema,
) {}
class Hold extends createZodDto(v1.problems.maintenanceHoldSchema) {}
class UploadInput extends createZodDto(
  v1.problems.createProblemPhotoUploadSchema,
) {}
class Upload extends createZodDto(v1.problems.problemPhotoUploadSchema) {}
class CreateInput extends createZodDto(v1.problems.createProblemInputSchema) {}
class UpdateInput extends createZodDto(v1.problems.updateProblemInputSchema) {}
class ResolveInput extends createZodDto(
  v1.problems.resolveProblemInputSchema,
) {}
class AssignInput extends createZodDto(v1.problems.assignProblemInputSchema) {}
class PriorityInput extends createZodDto(
  v1.problems.prioritizeProblemInputSchema,
) {}
class ReopenInput extends createZodDto(v1.problems.reopenProblemInputSchema) {}
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
  constructor(
    private readonly problems: ProblemsService,
    private readonly photos: ProblemPhotosService,
  ) {}

  @Get()
  @RequirePermissions("problems.read")
  @ZodResponse({ type: ProblemList })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.problems.list(user.id, query);
  }

  @Get("filter-options")
  @RequirePermissions("problems.read")
  @ZodResponse({ type: FilterOptions })
  filterOptions(@CurrentUser() user: AuthPrincipal) {
    return this.problems.filterOptions(user.id);
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

  @Post("photo-draft-upload-url")
  @RequireAllScope("problems.create")
  @ZodResponse({ status: 201, type: Upload })
  upload(@CurrentUser() user: AuthPrincipal, @Body() input: UploadInput) {
    return this.photos.createUpload(user.id, input);
  }

  @Get("scooters/:id/hold")
  @RequirePermissions("scooters.read")
  @ZodResponse({ type: Hold })
  maintenanceHold(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.problems.maintenanceHold(user.id, id);
  }

  @Get("locations")
  @RequirePermissions("problems.read")
  @ZodResponse({ type: LocationList })
  locations() {
    return this.problems.locations();
  }

  @Post("locations")
  @RequireAllScope("problems.update")
  @ZodResponse({ status: 201, type: Location })
  saveLocation(@Body() input: LocationInput) {
    return this.problems.saveLocation(input);
  }

  @Get(":id/activity")
  @RequirePermissions("problems.read")
  @ZodResponse({ type: ActivityList })
  activity(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Query() query: ActivityQuery,
  ) {
    return this.problems.activity(user.id, id, query);
  }

  @Post(":id/comments")
  @RequirePermissions("problems.update", "problems.read")
  @ZodResponse({ status: 201, type: Problem })
  comment(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: CommentInput,
  ) {
    return this.problems.comment(user.id, id, input);
  }

  @Put(":id/hold")
  @RequirePermissions("problems.update")
  @ZodResponse({ type: Problem })
  hold(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: HoldInput,
  ) {
    return this.problems.hold(user.id, id, input);
  }

  @Get(":id/photos/:photoId/content")
  @RequirePermissions("problems.read")
  async content(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res() res: Response,
  ) {
    await this.problems.get(user.id, id);
    const content = await this.photos.content(id, photoId);
    res.setHeader(
      "Content-Type",
      content.contentType ?? "application/octet-stream",
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (content.contentLength !== null)
      res.setHeader("Content-Length", String(content.contentLength));
    await pipeline(content.body, res);
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

  @Post(":id/photo-upload-url")
  @RequirePermissions("problems.update")
  @ZodResponse({ status: 201, type: Upload })
  uploadForProblem(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: UploadInput,
  ) {
    return this.problems.createPhotoUpload(user.id, id, input);
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
    @Body() input: ReopenInput,
  ) {
    return this.problems.reopen(user.id, id, input);
  }

  @Post(":id/cancel")
  @RequirePermissions("problems.update")
  @ZodResponse({ status: 201, type: Problem })
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() input: CloseInput,
  ) {
    return this.problems.cancel(
      user.id,
      id,
      input.revision,
      input.clearMaintenanceHold,
    );
  }
}
