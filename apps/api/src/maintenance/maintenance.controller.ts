import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import {
  CreateMaintenanceRecordInput,
  CreateScooterIssueInput,
  FixScooterIssueInput,
  FleetIssueList,
  FleetMaintenanceDashboard,
  ListFleetIssuesQuery,
  ListMaintenanceRecordsQuery,
  ListServiceScheduleQuery,
  ListScooterIssuesQuery,
  MaintenanceRecord,
  MaintenanceRecordList,
  MaintenanceTypeList,
  ReopenScooterIssueInput,
  ServiceScheduleList,
  ScooterIssue,
  ScooterIssueList,
  ScooterMaintenanceOverview,
  UpdateMaintenanceRecordInput,
  UpdateScooterIssueInput,
} from "./dto/maintenance.dto";
import {
  toMaintenanceRecord,
  toMaintenanceType,
  toScooterIssue,
} from "./maintenance.mapper";
import { MaintenanceQueryService } from "./maintenance-query.service";
import { MaintenanceService } from "./maintenance.service";

@ApiTags("maintenance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "maintenance", version: "1" })
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly queries: MaintenanceQueryService,
  ) {}

  @Get("types")
  @ApiOperation({
    operationId: "MaintenanceController_listTypes_v1",
    summary: "List active scooter maintenance types",
  })
  @ZodResponse({ type: MaintenanceTypeList })
  async listTypes(): Promise<v1.maintenance.MaintenanceType[]> {
    return (await this.maintenance.listTypes()).map(toMaintenanceType);
  }

  @Get("issues")
  @ApiOperation({
    operationId: "MaintenanceController_listIssues_v1",
    summary: "List scooter issues across the active fleet",
  })
  @ZodResponse({ type: FleetIssueList })
  listIssues(
    @Query() query: ListFleetIssuesQuery,
  ): Promise<v1.maintenance.FleetIssueList> {
    return this.queries.listFleetIssues(query);
  }

  @Get("schedule")
  @ApiOperation({
    operationId: "MaintenanceController_schedule_v1",
    summary: "List due and overdue maintenance across the active fleet",
  })
  @ZodResponse({ type: ServiceScheduleList })
  schedule(
    @Query() query: ListServiceScheduleQuery,
  ): Promise<v1.maintenance.ServiceScheduleList> {
    return this.queries.listServiceSchedule(query);
  }

  @Get("dashboard")
  @ApiOperation({
    operationId: "MaintenanceController_dashboard_v1",
    summary: "Get fleet maintenance attention counts and priority queue",
  })
  @ZodResponse({ type: FleetMaintenanceDashboard })
  dashboard(): Promise<v1.maintenance.FleetMaintenanceDashboard> {
    return this.queries.dashboard();
  }
}

@ApiTags("maintenance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "scooters/:scooterId", version: "1" })
export class ScooterMaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly queries: MaintenanceQueryService,
  ) {}

  @Get("issues")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_listIssues_v1",
    summary: "List reported issues for one active scooter",
  })
  @ZodResponse({ type: ScooterIssueList })
  async listIssues(
    @Param("scooterId") scooterId: string,
    @Query() query: ListScooterIssuesQuery,
  ): Promise<v1.maintenance.ScooterIssueList> {
    const result = await this.maintenance.listIssues(scooterId, query);
    return { ...result, items: result.items.map(toScooterIssue) };
  }

  @Post("issues")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_createIssue_v1",
    summary: "Report an issue for one active scooter",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ScooterIssue })
  async createIssue(
    @Param("scooterId") scooterId: string,
    @Body() input: CreateScooterIssueInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.maintenance.ScooterIssue> {
    return toScooterIssue(
      await this.maintenance.createIssue(scooterId, input, user.id),
    );
  }

  @Patch("issues/:issueId")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_updateIssue_v1",
    summary: "Update one scooter issue",
  })
  @ZodResponse({ type: ScooterIssue })
  async updateIssue(
    @Param("scooterId") scooterId: string,
    @Param("issueId") issueId: string,
    @Body() input: UpdateScooterIssueInput,
  ): Promise<v1.maintenance.ScooterIssue> {
    return toScooterIssue(
      await this.maintenance.updateIssue(scooterId, issueId, input),
    );
  }

  @Post("issues/:issueId/fix")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "ScooterMaintenanceController_fixIssue_v1",
    summary: "Mark one scooter issue as fixed",
  })
  @ZodResponse({ type: ScooterIssue })
  async fixIssue(
    @Param("scooterId") scooterId: string,
    @Param("issueId") issueId: string,
    @Body() input: FixScooterIssueInput,
  ): Promise<v1.maintenance.ScooterIssue> {
    void input;
    return toScooterIssue(await this.maintenance.fixIssue(scooterId, issueId));
  }

  @Post("issues/:issueId/reopen")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "ScooterMaintenanceController_reopenIssue_v1",
    summary: "Reopen one fixed scooter issue",
  })
  @ZodResponse({ type: ScooterIssue })
  async reopenIssue(
    @Param("scooterId") scooterId: string,
    @Param("issueId") issueId: string,
    @Body() input: ReopenScooterIssueInput,
  ): Promise<v1.maintenance.ScooterIssue> {
    void input;
    return toScooterIssue(
      await this.maintenance.reopenIssue(scooterId, issueId),
    );
  }

  @Get("maintenance-records")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_listRecords_v1",
    summary: "List completed maintenance records for one active scooter",
  })
  @ZodResponse({ type: MaintenanceRecordList })
  async listRecords(
    @Param("scooterId") scooterId: string,
    @Query() query: ListMaintenanceRecordsQuery,
  ): Promise<v1.maintenance.MaintenanceRecordList> {
    const result = await this.maintenance.listRecords(scooterId, query);
    return { ...result, items: result.items.map(toMaintenanceRecord) };
  }

  @Post("maintenance-records")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_createRecord_v1",
    summary: "Record completed maintenance for one active scooter",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: MaintenanceRecord })
  async createRecord(
    @Param("scooterId") scooterId: string,
    @Body() input: CreateMaintenanceRecordInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.maintenance.MaintenanceRecord> {
    return toMaintenanceRecord(
      await this.maintenance.createRecord(scooterId, input, user.id),
    );
  }

  @Patch("maintenance-records/:recordId")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_updateRecord_v1",
    summary: "Update one completed scooter maintenance record",
  })
  @ZodResponse({ type: MaintenanceRecord })
  async updateRecord(
    @Param("scooterId") scooterId: string,
    @Param("recordId") recordId: string,
    @Body() input: UpdateMaintenanceRecordInput,
  ): Promise<v1.maintenance.MaintenanceRecord> {
    return toMaintenanceRecord(
      await this.maintenance.updateRecord(scooterId, recordId, input),
    );
  }

  @Get("maintenance-overview")
  @ApiOperation({
    operationId: "ScooterMaintenanceController_overview_v1",
    summary: "Get issue, service-status, and activity overview for a scooter",
  })
  @ZodResponse({ type: ScooterMaintenanceOverview })
  overview(
    @Param("scooterId") scooterId: string,
  ): Promise<v1.maintenance.ScooterMaintenanceOverview> {
    return this.queries.overview(scooterId);
  }
}
