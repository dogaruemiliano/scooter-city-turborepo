/**
 * Scooter-maintenance shared constants and route helpers.
 */

export const SCOOTER_ISSUE_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type ScooterIssueSeverity = (typeof SCOOTER_ISSUE_SEVERITIES)[number];

export const SCOOTER_ISSUE_STATUSES = ["OPEN", "FIXED"] as const;

export type ScooterIssueStatus = (typeof SCOOTER_ISSUE_STATUSES)[number];

export const MAINTENANCE_STATUSES = [
  "OK",
  "DUE_SOON",
  "OVERDUE",
  "UNKNOWN",
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_ACTIVITY_KINDS = [
  "ISSUE_REPORTED",
  "ISSUE_FIXED",
  "ISSUE_REOPENED",
  "MAINTENANCE_COMPLETED",
] as const;

export type MaintenanceActivityKind =
  (typeof MAINTENANCE_ACTIVITY_KINDS)[number];

export const RECOMMENDED_OPERATIONAL_STATUSES = [
  "AVAILABLE",
  "UNAVAILABLE",
] as const;

export type RecommendedOperationalStatus =
  (typeof RECOMMENDED_OPERATIONAL_STATUSES)[number];

export const MAINTENANCE_PRIORITY_REASONS = [
  "CRITICAL_ISSUE",
  "HIGH_ISSUE",
  "OVERDUE_MAINTENANCE",
  "MEDIUM_ISSUE",
  "MAINTENANCE_DUE_SOON",
  "LOW_ISSUE",
] as const;

export type MaintenancePriorityReason =
  (typeof MAINTENANCE_PRIORITY_REASONS)[number];

export const ROUTES = {
  types: {
    list: "/v1/maintenance/types",
  },
  issues: {
    fleetList: "/v1/maintenance/issues",
    list: (scooterId: string): string => `/v1/scooters/${scooterId}/issues`,
    create: (scooterId: string): string => `/v1/scooters/${scooterId}/issues`,
    update: (scooterId: string, issueId: string): string =>
      `/v1/scooters/${scooterId}/issues/${issueId}`,
    fix: (scooterId: string, issueId: string): string =>
      `/v1/scooters/${scooterId}/issues/${issueId}/fix`,
    reopen: (scooterId: string, issueId: string): string =>
      `/v1/scooters/${scooterId}/issues/${issueId}/reopen`,
  },
  records: {
    list: (scooterId: string): string =>
      `/v1/scooters/${scooterId}/maintenance-records`,
    create: (scooterId: string): string =>
      `/v1/scooters/${scooterId}/maintenance-records`,
    update: (scooterId: string, recordId: string): string =>
      `/v1/scooters/${scooterId}/maintenance-records/${recordId}`,
  },
  overview: (scooterId: string): string =>
    `/v1/scooters/${scooterId}/maintenance-overview`,
  dashboard: "/v1/maintenance/dashboard",
  schedule: "/v1/maintenance/schedule",
} as const;
