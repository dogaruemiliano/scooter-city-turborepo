/**
 * Scooters-domain shared constants and route helpers.
 */

export const SCOOTER_POWERTRAIN_TYPES = ["electric", "combustion"] as const;

export type ScooterPowertrainType = (typeof SCOOTER_POWERTRAIN_TYPES)[number];

export const SCOOTER_REGISTRATION_TYPES = [
  "unregistered",
  "national",
  "local",
  "temporary",
] as const;

export type ScooterRegistrationType =
  (typeof SCOOTER_REGISTRATION_TYPES)[number];

export const SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES = [
  "none",
  "AM",
  "A1",
  "A2",
  "A",
] as const;

export type ScooterRequiredDriverLicenseType =
  (typeof SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES)[number];

export const SCOOTER_LIST_SORTS = [
  "relevance",
  "vinAsc",
  "vinDesc",
  "brandAsc",
  "brandDesc",
  "manufactureYearDesc",
  "manufactureYearAsc",
  "purchasedOnDesc",
  "purchasedOnAsc",
  "createdAtDesc",
  "createdAtAsc",
  "updatedAtDesc",
  "updatedAtAsc",
] as const;

export type ScooterListSort = (typeof SCOOTER_LIST_SORTS)[number];

export const ROUTES = {
  list: "/v1/scooters",
  create: "/v1/scooters",
  get: (id: string): string => `/v1/scooters/${id}`,
  update: (id: string): string => `/v1/scooters/${id}`,
  delete: (id: string): string => `/v1/scooters/${id}`,
} as const;
