import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateScooterIssueInput extends createZodDto(
  v1.maintenance.createScooterIssueInputSchema,
) {}

export class UpdateScooterIssueInput extends createZodDto(
  v1.maintenance.updateScooterIssueInputSchema,
) {}

export class FixScooterIssueInput extends createZodDto(
  v1.maintenance.fixScooterIssueInputSchema,
) {}

export class ReopenScooterIssueInput extends createZodDto(
  v1.maintenance.reopenScooterIssueInputSchema,
) {}

export class ListScooterIssuesQuery extends createZodDto(
  v1.maintenance.listScooterIssuesQuerySchema,
) {}

export class ScooterIssue extends createZodDto(
  v1.maintenance.scooterIssueSchema,
) {}

export class ScooterIssueList extends createZodDto(
  v1.maintenance.scooterIssueListSchema,
) {}

export class ListFleetIssuesQuery extends createZodDto(
  v1.maintenance.listFleetIssuesQuerySchema,
) {}

export class FleetIssueList extends createZodDto(
  v1.maintenance.fleetIssueListSchema,
) {}

export class MaintenanceTypeList extends createZodDto(
  v1.maintenance.maintenanceTypeListSchema,
) {}

export class CreateMaintenanceRecordInput extends createZodDto(
  v1.maintenance.createMaintenanceRecordInputSchema,
) {}

export class UpdateMaintenanceRecordInput extends createZodDto(
  v1.maintenance.updateMaintenanceRecordInputSchema,
) {}

export class ListMaintenanceRecordsQuery extends createZodDto(
  v1.maintenance.listMaintenanceRecordsQuerySchema,
) {}

export class MaintenanceRecord extends createZodDto(
  v1.maintenance.maintenanceRecordSchema,
) {}

export class MaintenanceRecordList extends createZodDto(
  v1.maintenance.maintenanceRecordListSchema,
) {}

export class ListServiceScheduleQuery extends createZodDto(
  v1.maintenance.listServiceScheduleQuerySchema,
) {}

export class ServiceScheduleList extends createZodDto(
  v1.maintenance.serviceScheduleListSchema,
) {}

export class ScooterMaintenanceOverview extends createZodDto(
  v1.maintenance.scooterMaintenanceOverviewSchema,
) {}

export class FleetMaintenanceDashboard extends createZodDto(
  v1.maintenance.fleetMaintenanceDashboardSchema,
) {}
