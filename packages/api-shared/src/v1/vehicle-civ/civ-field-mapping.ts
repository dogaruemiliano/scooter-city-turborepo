import type { CivVersion } from "./vehicle-civ.schemas";

export const CIV_MAPPING_SOURCES = {
  order2024: "https://legislatie.just.ro/Public/DetaliiDocumentAfis/279948",
  rarConsolidation: "https://www.rarom.ro/cs-uploads/CIV.pdf",
  checkedOn: "2026-10-10",
} as const;
export interface CivFieldReference {
  status: "confirmed" | "ambiguous" | "not_present";
  code?: string;
  subfield?: string;
  note?: string;
}
const reference = (code?: string, subfield?: string): CivFieldReference => ({
  status: "confirmed",
  ...(code ? { code } : {}),
  ...(subfield ? { subfield } : {}),
});
const absent: CivFieldReference = { status: "not_present" };
const grouped: CivFieldReference = {
  status: "ambiguous",
  note: "The 1993 layout groups multiple modern fields; retain original text without automatic assignment.",
};

/** Semantic property names are stable; document codes belong only to this mapping. */
export const CIV_FIELD_MAPPING = {
  brandId: {
    "2024": reference("D.1"),
    "2016": reference("D.1"),
    "1993": reference("3"),
  },
  vehicleType: {
    "2024": reference("D.2"),
    "2016": reference("D.2"),
    "1993": reference("4"),
  },
  variant: { "2024": reference(), "2016": reference(), "1993": grouped },
  version: { "2024": reference(), "2016": reference(), "1993": grouped },
  commercialName: {
    "2024": reference("D.3"),
    "2016": reference("D.3"),
    "1993": absent,
  },
  vin: {
    "2024": reference("E"),
    "2016": reference("E"),
    "1993": reference("6"),
  },
  manufactureYear: {
    "2024": reference("1"),
    "2016": reference("2"),
    "1993": reference(),
  },
  vehicleCategory: {
    "2024": reference("J"),
    "2016": reference("J"),
    "1993": grouped,
  },
  nationalCategory: {
    "2024": reference("2"),
    "2016": reference("3"),
    "1993": grouped,
  },
  vehicleClass: {
    "2024": reference("3"),
    "2016": reference("4"),
    "1993": grouped,
  },
  bodyType: {
    "2024": reference("4"),
    "2016": reference("5"),
    "1993": reference("2"),
  },
  typeApprovalNumber: {
    "2024": reference("K"),
    "2016": reference("K"),
    "1993": absent,
  },
  nationalRegistryNumber: {
    "2024": reference("5"),
    "2016": {
      status: "ambiguous",
      note: "The 2024 correspondence table prints 5 for the 2016 registry field, colliding with body type 5; not used as an automatic mapping.",
    },
    "1993": reference("5"),
  },
  axlesCount: {
    "2024": reference("L"),
    "2016": reference("L"),
    "1993": reference("11"),
  },
  maxTechnicallyPermissibleMassKg: {
    "2024": reference("F.1"),
    "2016": reference("F.1"),
    "1993": reference("7", "Total max. autorizată"),
  },
  maxTrainMassKg: {
    "2024": reference("6"),
    "2016": reference("7"),
    "1993": absent,
  },
  maxAxle1MassKg: {
    "2024": reference("N.1"),
    "2016": reference("N.1"),
    "1993": grouped,
  },
  maxAxle2MassKg: {
    "2024": reference("N.2"),
    "2016": reference("N.2"),
    "1993": grouped,
  },
  maxAxle3MassKg: {
    "2024": reference("N.3"),
    "2016": reference("N.3"),
    "1993": grouped,
  },
  maxAxle4MassKg: {
    "2024": reference("N.4"),
    "2016": reference("N.4"),
    "1993": grouped,
  },
  maxAxle5MassKg: {
    "2024": reference("N.5"),
    "2016": reference("N.5"),
    "1993": grouped,
  },
  curbWeightKg: {
    "2024": reference("G"),
    "2016": reference("G"),
    "1993": reference("7", "Proprie"),
  },
  actualWeightKg: {
    "2024": reference("7"),
    "2016": reference("8"),
    "1993": absent,
  },
  brakedTrailerMassKg: {
    "2024": reference("O.1"),
    "2016": reference("O.1"),
    "1993": reference("7", "Remorcabilă cu disp. de frânare"),
  },
  unbrakedTrailerMassKg: {
    "2024": reference("O.2"),
    "2016": reference("O.2"),
    "1993": reference("7", "Remorcabilă fără disp. de frânare"),
  },
  couplingPointMassKg: {
    "2024": reference("8"),
    "2016": reference("9"),
    "1993": reference("7", "Sarcină pe cârligul de remorcare"),
  },
  lengthMm: {
    "2024": reference("9"),
    "2016": reference("10"),
    "1993": reference("9", "L"),
  },
  widthMm: {
    "2024": reference("10"),
    "2016": reference("11"),
    "1993": reference("9", "l"),
  },
  heightMm: {
    "2024": reference("11"),
    "2016": reference("12"),
    "1993": reference("9", "h"),
  },
  wheelbaseMm: {
    "2024": reference("12"),
    "2016": reference("13"),
    "1993": absent,
  },
  engineCode: {
    "2024": reference("13"),
    "2016": reference("14"),
    "1993": reference("10", "Tipul"),
  },
  engineDisplacementCc: {
    "2024": reference("P.1"),
    "2016": reference("P.1"),
    "1993": reference("10", "Cilindree (cm3)"),
  },
  powerKw: {
    "2024": reference("P.2"),
    "2016": reference("P.2"),
    "1993": reference("10", "Putere max. (kW)"),
  },
  fuelType: {
    "2024": reference("P.3"),
    "2016": reference("P.3"),
    "1993": reference("10", "Sursa de energie"),
  },
  ratedEngineRpm: {
    "2024": reference("P.4"),
    "2016": reference("P.4"),
    "1993": reference("10", "Turație (min-1)"),
  },
  engineSerialNumber: {
    "2024": reference("P.5"),
    "2016": reference("P.5"),
    "1993": reference("10", "Serie"),
  },
  propulsionSystem: {
    "2024": reference("14"),
    "2016": reference("15"),
    "1993": absent,
  },
  electricMotorPowerKw: {
    "2024": reference("15"),
    "2016": reference("16"),
    "1993": absent,
  },
  emissionsStandard: {
    "2024": reference("V.9"),
    "2016": reference("V.9"),
    "1993": absent,
  },
  nationalEmissionsCode: {
    "2024": reference("16"),
    "2016": reference("17"),
    "1993": absent,
  },
  color: {
    "2024": reference("R"),
    "2016": reference("R"),
    "1993": reference("18"),
  },
  seatsCount: {
    "2024": reference("S.1"),
    "2016": reference("S.1"),
    "1993": reference("8", "total"),
  },
  standingCapacity: {
    "2024": reference("S.2"),
    "2016": reference("S.2"),
    "1993": reference("8", "în picioare"),
  },
  maxSpeedKmh: {
    "2024": reference("T"),
    "2016": reference("T"),
    "1993": reference("16"),
  },
  stationaryNoiseDb: {
    "2024": reference("U.1"),
    "2016": reference("U.1"),
    "1993": reference("14", "în staționare"),
  },
  noiseMeasurementRpm: {
    "2024": reference("U.2"),
    "2016": reference("U.2"),
    "1993": absent,
  },
  drivingNoiseDb: {
    "2024": reference("U.3"),
    "2016": reference("U.3"),
    "1993": reference("14", "în mers"),
  },
  powerToWeightRatioKwKg: {
    "2024": reference("Q"),
    "2016": reference("Q"),
    "1993": absent,
  },
  co2EmissionsGKm: {
    "2024": reference("V.7"),
    "2016": reference("V.7"),
    "1993": absent,
  },
  driveType: {
    "2024": reference("17"),
    "2016": reference("18"),
    "1993": reference("12"),
  },
  frontTyreSpecification: {
    "2024": reference("18.1"),
    "2016": reference("19.1"),
    "1993": reference("13", "Față"),
  },
  rearTyreSpecification: {
    "2024": reference("18.2"),
    "2016": reference("19.2"),
    "1993": reference("13", "Mijloc-Spate"),
  },
  frontSuspension: {
    "2024": reference("19.1"),
    "2016": reference("20.1"),
    "1993": absent,
  },
  rearSuspension: {
    "2024": reference("19.2"),
    "2016": reference("20.2"),
    "1993": absent,
  },
  fuelTankCapacityLiters: {
    "2024": reference("W"),
    "2016": reference("W"),
    "1993": reference("17"),
  },
} satisfies Record<
  string,
  Record<Exclude<CivVersion, "unknown">, CivFieldReference>
>;
export type CivField = keyof typeof CIV_FIELD_MAPPING;

/** Returns no invented code when the layout is unknown, ambiguous or unnumbered. */
export function civFieldHint(
  version: CivVersion,
  field: string,
): string | undefined {
  if (version === "unknown" || !(field in CIV_FIELD_MAPPING)) return undefined;
  const entry: CivFieldReference =
    CIV_FIELD_MAPPING[field as CivField][version];
  return entry.status === "confirmed" && entry.code
    ? [entry.code, entry.subfield].filter(Boolean).join(" / ")
    : undefined;
}

/** Import helpers must never guess which subfield of a historical grouped rubric was intended. */
export function resolveCivField(
  version: CivVersion,
  code: string,
  subfield?: string,
): CivField | undefined {
  if (version === "unknown") return undefined;
  const matches = (Object.keys(CIV_FIELD_MAPPING) as CivField[]).filter(
    (field) => {
      const entry: CivFieldReference = CIV_FIELD_MAPPING[field][version];
      return (
        entry.status === "confirmed" &&
        entry.code === code &&
        entry.subfield === subfield
      );
    },
  );
  return matches.length === 1 ? matches[0] : undefined;
}
