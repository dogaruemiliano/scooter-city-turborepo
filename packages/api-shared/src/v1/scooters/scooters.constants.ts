/**
 * Scooters-domain shared constants and route helpers.
 */

export const SCOOTER_POWERTRAIN_TYPES = [
  "electric",
  "combustion",
  "hybrid",
  "unpowered",
] as const;

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
  "fleetNumberAsc",
  "fleetNumberDesc",
  "vinAsc",
  "vinDesc",
  "brandAsc",
  "brandDesc",
  "manufactureYearDesc",
  "manufactureYearAsc",
  "createdAtDesc",
  "createdAtAsc",
  "updatedAtDesc",
  "updatedAtAsc",
] as const;

export type ScooterListSort = (typeof SCOOTER_LIST_SORTS)[number];

export const ROUTES = {
  photos: {
    draftUpload: "/v1/scooters/photo-draft-upload-url",
    list: (id: string) => `/v1/scooters/${encodeURIComponent(id)}/photos`,
    upload: (id: string) =>
      `/v1/scooters/${encodeURIComponent(id)}/photos/upload-url`,
    reorder: (id: string) =>
      `/v1/scooters/${encodeURIComponent(id)}/photos/reorder`,
    photo: (id: string, photoId: string) =>
      `/v1/scooters/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
    content: (id: string, photoId: string) =>
      `/v1/scooters/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/content`,
  },
  documents: {
    extract: "/v1/scooters/document-extraction",
    createEditorSession: "/v1/scooters/document-editor-sessions",
    discardEditorSession: (id: string): string =>
      `/v1/scooters/document-editor-sessions/${encodeURIComponent(id)}/discard`,
    startExtractionJob: "/v1/scooters/document-extraction-jobs",
    extractionJob: (id: string): string =>
      `/v1/scooters/document-extraction-jobs/${encodeURIComponent(id)}`,
    cancelExtractionJob: (id: string): string =>
      `/v1/scooters/document-extraction-jobs/${encodeURIComponent(id)}/cancel`,
    createDraftUpload: "/v1/scooters/document-draft-upload-url",
    list: (id: string): string => `/v1/scooters/${id}/documents`,
    content: (id: string, documentId: string): string =>
      `/v1/scooters/${id}/documents/${documentId}/content`,
  },
  list: "/v1/scooters",
  create: "/v1/scooters",
  get: (id: string): string => `/v1/scooters/${id}`,
  update: (id: string): string => `/v1/scooters/${id}`,
  delete: (id: string): string => `/v1/scooters/${id}`,
} as const;

/** Fields that cannot describe the selected architecture. Unknown selection hides nothing. */
export function inactivePowertrainFields(powertrain: string) {
  if (powertrain === "unpowered")
    return [
      "engineCode",
      "engineSerialNumber",
      "engineDisplacementCc",
      "powerKw",
      "ratedEngineRpm",
      "fuelType",
      "fuelTypeOther",
      "electricMotorPowerKw",
      "powerToWeightRatioKwKg",
      "fuelTankCapacityLiters",
      "emissionsStandard",
      "nationalEmissionsCode",
      "stationaryNoiseDb",
      "drivingNoiseDb",
      "noiseMeasurementRpm",
      "co2EmissionsGKm",
    ] as const;
  if (powertrain === "electric")
    return [
      "engineDisplacementCc",
      "ratedEngineRpm",
      "fuelTankCapacityLiters",
      "emissionsStandard",
      "nationalEmissionsCode",
    ] as const;
  if (powertrain === "combustion") return ["electricMotorPowerKw"] as const;
  return [] as const;
}

/**
 * Supported CIV options, not an exhaustive RAR nomenclature. `other` keeps the
 * exact document text. Enum membership is checked against Prisma in the API.
 * Category L references: https://www.rarom.ro/cs-uploads/R168-2013ro.pdf
 * CIV rubric definitions: https://www.rarom.ro/cs-uploads/CIV.pdf
 */
export const SCOOTER_CIV_OPTIONS = {
  vehicleCategory: [
    "L1e",
    "L2e",
    "L3e",
    "L4e",
    "L5e",
    "L6e",
    "L7e",
    "M1",
    "M2",
    "M3",
    "N1",
    "N2",
    "N3",
    "O1",
    "O2",
    "O3",
    "O4",
    "other",
  ],
  nationalCategory: ["motorcycle", "other"],
  bodyType: ["two_wheel_moped", "two_wheel_motorcycle", "other"],
  fuelType: [
    "petrol",
    "diesel",
    "electric",
    "petrol_electric",
    "diesel_electric",
    "other",
  ],
} as const;

export const SCOOTER_CIV_FIELDS = [
  "vehicleCategory",
  "nationalCategory",
  "bodyType",
  "fuelType",
] as const;

export function fuelMatchesPowertrain(
  powertrain: string | undefined,
  fuel: string | null | undefined,
): boolean {
  if (powertrain === "unpowered") return !fuel;
  if (!powertrain || !fuel || fuel === "other") return true;
  if (powertrain === "electric") return fuel === "electric";
  if (powertrain === "combustion") return !fuel.includes("electric");
  return fuel !== "electric";
}
