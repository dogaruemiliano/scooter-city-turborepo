import { ConflictException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import {
  buildSpeedDeclaration,
  type TemplateValues,
} from "./engine/docx-engine";
import { FIELD_REGISTRY, type ContractFieldKey } from "./engine/registry";
import { assertPhysicalSpeedDeclarationSupported } from "./contract-speed-policy";

const displayKeySchema = z.enum(FIELD_REGISTRY.map((f) => f.key));
const pinnedAssetSchema = z.strictObject({
  assetId: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentType: z.enum([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
  ]),
  fileName: z.string().min(1),
});
export const packageSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  finalOtpRequired: z.boolean().default(false),
  signingChannel: z.literal("web").default("web"),
  conclusionContext: v1.rentals.rentalConclusionContextSchema.optional(),
  acceptancePolicyVersion: z.literal("2026-10-30-v1").default("2026-10-30-v1"),
  acceptanceTexts: z
    .object({
      RENTAL_AGREEMENT: z.string().min(1),
      GDPR_NOTICE: z.string().min(1),
      TECHNICAL_HANDOVER: z.string().min(1),
      PROMOTION_ADDENDUM: z.string().min(1),
      LIMITER: z.string().min(1).nullable(),
    })
    .strict()
    .optional(),
  contractNumber: z.string().min(1),
  createdAt: z.iso.datetime(),
  personId: z.string(),
  personName: z.string(),
  phone: z.string(),
  email: z.email(),
  companyId: z.string(),
  companyName: z.string(),
  companySettings: v1.contracts.contractSettingsInputSchema,
  identityDocumentId: z.string(),
  identityPhotos: z
    .array(
      z.object({
        photoId: z.string(),
        assetId: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        slot: z.string(),
        contentType: z.string().optional(),
      }),
    )
    .default([]),
  representativeName: z.string(),
  rentalMedia: z
    .array(
      pinnedAssetSchema.extend({
        photoId: z.string(),
        eventType: v1.rentals.rentalMediaEventSchema,
      }),
    )
    .default([]),
  vehicleDocuments: z
    .array(
      pinnedAssetSchema.extend({ documentId: z.string(), type: z.string() }),
    )
    .default([]),
  terms: v1.rentals.rentalTermsSchema,
  /** Current application policy; historical snapshots predate this optional field. */
  applicationSpeedLimitKmh: z
    .union([z.literal(25), z.literal(45)])
    .nullable()
    .optional(),
  inspection: v1.rentals.rentalInspectionDataSchema,
  limiterKind: z.enum(["LIMITED", "NO_LIMITER"]),
  limiterKmh: z.number().positive().nullable(),
  maxSpeedKmh: z.number().positive(),
  logoAssetId: z.string().nullable(),
  display: z.partialRecord(displayKeySchema, z.string().max(30000)),
});
export type PackageSnapshot = z.infer<typeof packageSnapshotSchema>;
const date = (value: Date) =>
  new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
const datetime = (value: Date) =>
  new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
const money = (value: number) =>
  (value / 100).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const condition = (value: string) =>
  ({
    ok: "OK",
    defect: "Defect",
    not_checked: "Neverificat",
    not_applicable: "Nu se aplică",
  })[value] ?? "Neverificat";
const method = (value: string) =>
  ({ cash: "numerar", transfer: "transfer bancar", card: "card" })[value]!;

/** Compose only recorded source data. An absent resolver remains missing and blocks rendering. */
export async function buildPackageSnapshot(
  tx: Prisma.TransactionClient,
  rentalId: string,
  companyId: string,
  contractNumber: string,
): Promise<{
  snapshot: PackageSnapshot;
  inspectionId: string;
  rentalRevision: number;
}> {
  await tx.$queryRaw`SELECT p.id FROM "Person" p JOIN "Rental" r ON r."personId" = p.id WHERE r.id = ${rentalId} FOR SHARE OF p`;
  await tx.$queryRaw`SELECT p.id FROM "Person" p JOIN "RentalParticipant" rp ON rp."personId" = p.id WHERE rp."rentalId" = ${rentalId} ORDER BY p.id FOR SHARE OF p`;
  const rental = await tx.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: {
      person: {
        include: {
          documents: {
            where: {
              deletedAt: null,
              type: { in: ["nationalId", "passport", "other"] },
            },
          },
        },
      },
      scooter: { include: { brand: true } },
      participants: { include: { person: true } },
    },
  });
  if (rental.status !== "reserved" || rental.workflowVersion < 1)
    throw new ConflictException(
      "Only new reserved rentals can enter contractual checkout",
    );
  const lesseeBirthDate = rental.person.dateOfBirth?.toISOString().slice(0, 10);
  if (
    !v1.rentals.rentalAdultPolicyEligible(
      lesseeBirthDate,
      rental.agreementStartsAt ?? rental.startsAt,
    ) ||
    !v1.rentals.rentalAdultPolicyEligible(lesseeBirthDate, new Date())
  )
    throw new ConflictException(
      "A minor or unknown-age lessee requires an approved representation procedure before contractual issuance",
    );
  if (!rental.conclusionContext)
    throw new ConflictException(
      "Select the actual conclusion context before preparing contractual documents",
    );
  const company = await tx.financeLegalIdentity.findUniqueOrThrow({
    where: { id: companyId },
  });
  const settingsRow = await tx.contractSettings.findUniqueOrThrow({
    where: { companyId },
  });
  const settings = v1.contracts.contractSettingsInputSchema.parse(
    settingsRow.data,
  );
  const representative = await tx.user.findUniqueOrThrow({
    where: { id: settings.representativeUserId },
  });
  if (!representative.firstName?.trim() || !representative.lastName?.trim()) {
    throw new ConflictException(
      "The authorized company representative must have a recorded first and last name",
    );
  }
  const inspectionRow = await tx.rentalInspection.findFirst({
    where: { rentalId, status: "confirmed", eventType: "handover" },
    orderBy: { version: "desc" },
  });
  if (
    !inspectionRow ||
    inspectionRow.scooterUpdatedAt.getTime() !==
      rental.scooter.updatedAt.getTime()
  )
    throw new ConflictException("Confirm a current handover inspection first");
  const inspection = v1.rentals.rentalInspectionDataSchema.parse(
    inspectionRow.dataSnapshot,
  );
  const rentalMedia = await tx.scooterPhoto.findMany({
    where: {
      id: { in: inspection.mediaIds },
      rentalId,
      scooterId: rental.scooterId,
      type: "RENTAL_BEFORE",
      deletedAt: null,
      asset: { deletedAt: null },
    },
    include: { asset: true },
    orderBy: { id: "asc" },
  });
  if (rentalMedia.length !== new Set(inspection.mediaIds).size) {
    throw new ConflictException(
      "Every selected handover photograph must remain available for this rental",
    );
  }
  const terms = v1.rentals.rentalTermsSchema.parse(rental.termsSnapshot);
  const issues = v1.rentals.inspectionReadinessIssues(
    inspection,
    v1.scooters.licenceSpeedLimitKmh(rental.scooter.requiredLicenseCategory),
  );
  if (issues.length)
    throw new ConflictException({
      message: "Inspection is incomplete or unsafe",
      details: { issues },
    });
  const identityReference = rental.person.documents.find(
    (d) =>
      d.status === "verified" &&
      d.expiresOn &&
      d.expiresOn.toISOString().slice(0, 10) >=
        v1.rentals.rentalDateOnly(rental.agreementStartsAt ?? rental.startsAt),
  );
  if (!identityReference)
    throw new ConflictException(
      "A verified valid identity document is required",
    );
  await tx.$queryRaw`SELECT id FROM "PersonDocument" WHERE id = ${identityReference.id} FOR SHARE`;
  const identity = await tx.personDocument.findFirstOrThrow({
    where: {
      id: identityReference.id,
      personId: rental.personId,
      deletedAt: null,
      status: "verified",
    },
    include: {
      photos: {
        where: { deletedAt: null, asset: { deletedAt: null } },
        include: { asset: true },
        orderBy: { id: "asc" },
      },
    },
  });
  const scooter = rental.scooter,
    person = rental.person;
  const applicationSpeedLimitKmh = v1.scooters.licenceSpeedLimitKmh(
    scooter.requiredLicenseCategory,
  );
  // A licence-based application cap never establishes a physical limiter or its absence.
  // The supplied legal templates make physical assertions, so they may only use retained evidence.
  assertPhysicalSpeedDeclarationSupported(
    scooter,
    inspection,
    applicationSpeedLimitKmh,
  );
  if (!scooter.maxSpeedKmh)
    throw new ConflictException(
      "The vehicle's documented constructive speed is missing",
    );
  const now = new Date();
  const fullName = `${person.lastName} ${person.firstName}`;
  const display: Partial<Record<ContractFieldKey, string>> = {
    companyName: company.legalName,
    companyTaxId: company.taxIdentifier,
    companyTradeRegisterNumber: settings.registryNumber,
    companyAddress: [settings.address, settings.city, settings.county].join(
      ", ",
    ),
    companyPrivacyEmail: settings.email,
    companyRepresentativeName: `${representative.lastName} ${representative.firstName}`,
    companyRepresentativeRole: settings.representativeCapacity,
    brandName: settings.brandName,
    gpsHistoryStatement: settings.gpsHistoryStatement,
    contractNumber,
    contractDate: date(now),
    gdprCommunicatedAt: datetime(now),
    renterFirstName: person.firstName,
    renterLastName: person.lastName,
    renterFullName: fullName,
    renterPhone: person.phone,
    renterEmail: person.email,
    renterIdType: identity.type,
    renterIdSeries: identity.series ?? "Nu se aplică",
    renterIdNumber: identity.number ?? undefined,
    renterIdExpiresOn: identity.expiresOn
      ? date(identity.expiresOn)
      : undefined,
    renterNationalId: person.cnp ?? identity.cnp ?? undefined,
    renterAddress:
      person.addressLine1 && person.city
        ? [
            person.addressLine1,
            person.addressLine2,
            person.city,
            person.region,
            person.countryCode,
          ]
            .filter(Boolean)
            .join(", ")
        : undefined,
    renterCitizenship: person.citizenship ?? undefined,
    authorizedUsers: rental.participants.length
      ? rental.participants
          .map((p) => `${p.person.lastName} ${p.person.firstName}`)
          .join("; ")
      : "Nu sunt desemnați utilizatori suplimentari",
    weeklyRent: money(terms.weeklyRateMinor),
    depositAmount: money(terms.depositMinor),
    durationMonths: String(terms.agreementMonths),
    noticeDays: String(terms.noticeDays),
    rentPaymentMethod: method(terms.rentalPaymentMethod),
    depositPaymentMethod: method(terms.depositPaymentMethod),
    rentalStartsOn: rental.agreementStartsAt
      ? date(rental.agreementStartsAt)
      : undefined,
    rentalEndsOn: rental.agreementEndsAt
      ? date(rental.agreementEndsAt)
      : undefined,
    billingAnchorAt: rental.billingAnchorAt
      ? datetime(rental.billingAnchorAt)
      : undefined,
    billingStartsAt: rental.billingAnchorAt
      ? datetime(rental.billingAnchorAt)
      : undefined,
    billingCycleDays: "7",
    paymentGraceDays: "3",
    paymentGraceDaysWords: "trei",
    latePenaltyPercent: "0,3",
    maintenanceNoticeHours: "24",
    returnAfterNoticeHours: "24",
    scooterBrand: scooter.brand.name,
    scooterModel: scooter.model ?? undefined,
    scooterVin: scooter.vin,
    scooterYear:
      scooter.manufactureYear === null
        ? "An neconsemnat"
        : String(scooter.manufactureYear),
    scooterColor: scooter.color ?? undefined,
    scooterInternalCode: v1.scooters.scooterDisplayCode({
      fleetNumber: scooter.fleetNumber,
      brandCode: scooter.brand.code,
    }),
    scooterRegistrationNumber: scooter.registrationNumber ?? undefined,
    scooterMaxSpeedKmh: String(scooter.maxSpeedKmh),
    scooterMaxSpeedSource: scooter.maxSpeedSource,
    scooterLimiterStatus:
      scooter.limiterKind === "LIMITED"
        ? "Limitare prezentă"
        : "Fără sistem de limitare distinct",
    scooterLimiterValue:
      scooter.limiterKind === "LIMITED"
        ? `${scooter.limiterKmh} km/h`
        : "Nu se aplică",
    scooterLimiterBasis: scooter.configurationEvidence,
    speedDeclaration: buildSpeedDeclaration(
      scooter.limiterKind,
      scooter.maxSpeedKmh,
      scooter.limiterKmh,
    ),
    speedCheckMethod:
      scooter.limiterKind === "NO_LIMITER"
        ? "Nu se aplică"
        : (inspection.speedVerificationMethod ?? undefined),
    speedCheckResult:
      scooter.limiterKind === "NO_LIMITER"
        ? "Nu se aplică"
        : `Rezultat ${condition(inspection.limiterCheck)}; viteză observată ${inspection.observedSpeedKmh} km/h`,
    speedCheckedAt:
      scooter.limiterKind === "NO_LIMITER"
        ? "Nu se aplică"
        : datetime(inspectionRow.confirmedAt!),
    handoverDate: date(inspectionRow.confirmedAt!),
    handoverTime: datetime(inspectionRow.confirmedAt!),
    mileageAtHandover: `${inspection.odometerDisplayedKm === null ? "Fără valoare afișată" : `${inspection.odometerDisplayedKm} km indicați`}; odometru ${condition(inspection.odometer)}; ultima valoare cunoscută ${scooter.currentMileageKm ?? "necunoscută"}. Kilometrajul real nu este dedus dintr-un odometru defect.`,
    odometerCondition: condition(inspection.odometer),
    odometerNotes: "Valoarea afișată este distinctă de kilometrajul real",
    speedometerCondition: condition(inspection.speedometer),
    speedometerNotes:
      inspection.speedVerificationMethod ??
      "Fără metodă suplimentară consemnată",
    fuelLevel:
      inspection.fuelPercent === null
        ? undefined
        : `${inspection.fuelPercent}%`,
    aestheticCondition:
      inspection.cosmeticNotes || "Fără observații estetice consemnate",
    helmetQuantity: String(inspection.helmetCount),
    helmetHandover: inspection.helmetCount ? "Se predă" : "Nu se predă",
    keysQuantity: String(inspection.keysCount),
    helmetNotes:
      inspection.equipmentNotes || "Fără observații suplimentare consemnate",
    technicalNotes:
      inspection.technicalNotes || "Fără observații suplimentare consemnate",
    otherEquipment:
      inspection.equipmentNotes || "Nu se predau alte echipamente",
    handoverMedia: inspection.mediaIds.length
      ? inspection.mediaIds.map((id) => `Fișier arhivat ${id}`).join("; ")
      : "Nu sunt materiale media consemnate",
    phoneHolderPresence:
      inspection.phoneStand.presence === "present" ? "Prezent" : "Absent",
    phoneHolderCondition: condition(inspection.phoneStand.condition),
    phoneHolderNotes:
      inspection.equipmentNotes || "Fără observații suplimentare consemnate",
    usbPresence:
      inspection.chargingOutlet.presence === "present" ? "Prezentă" : "Absentă",
    usbCondition: condition(inspection.chargingOutlet.condition),
    usbNotes:
      inspection.equipmentNotes || "Fără observații suplimentare consemnate",
  };
  for (const [key, value] of Object.entries(inspection.additionalChecks)) {
    const prefix = key === "keys" ? "key" : key;
    display[`${prefix}Condition` as ContractFieldKey] = condition(value);
    if (
      `${prefix}Notes` in
      Object.fromEntries(FIELD_REGISTRY.map((f) => [f.key, true]))
    )
      display[`${prefix}Notes` as ContractFieldKey] =
        inspection.technicalNotes || "Fără observații suplimentare consemnate";
  }
  for (const [key, value] of Object.entries(inspection.additionalEquipment))
    display[`${key}Handover` as ContractFieldKey] =
      value.presence === "present"
        ? `Se predă; ${condition(value.condition)}`
        : "Nu se predă";
  const vehicleDocuments = await tx.scooterDocument.findMany({
    where: {
      scooterId: scooter.id,
      deletedAt: null,
      customerVisible: true,
      clientCopyAsset: { deletedAt: null },
    },
    include: { clientCopyAsset: true },
    orderBy: { id: "asc" },
  });
  for (const [prefix, type] of [
    ["civ", "civ"],
    ["insurance", "insurance"],
    ["registration", "registration_certificate"],
    ["other", "other"],
  ]) {
    const available = vehicleDocuments.filter(
      (d) => d.type === type && d.clientCopyAssetId,
    );
    display[`${prefix}DocDelivery` as ContractFieldKey] = available.length
      ? "Copie autorizată disponibilă în dosar; primirea se consemnează separat"
      : "Nu se predă";
    display[`${prefix}DocNotes` as ContractFieldKey] = available.length
      ? available.map((d) => `Document ${d.id}`).join("; ")
      : "Nu se aplică";
  }
  // Undefined is intentionally removed; renderer reports every unresolved required token.
  for (const key of Object.keys(display) as ContractFieldKey[])
    if (display[key] === undefined) delete display[key];
  return {
    inspectionId: inspectionRow.id,
    rentalRevision: rental.revision,
    snapshot: packageSnapshotSchema.parse({
      schemaVersion: 1,
      conclusionContext: rental.conclusionContext,
      signingChannel: "web",
      contractNumber,
      createdAt: now.toISOString(),
      personId: person.id,
      personName: fullName,
      phone: person.phone,
      email: person.email,
      companyId,
      companyName: company.legalName,
      companySettings: settings,
      identityDocumentId: identity.id,
      identityPhotos: identity.photos.map((photo) => ({
        photoId: photo.id,
        assetId: photo.assetId,
        sha256: photo.asset.checksumSha256,
        slot: photo.slot,
        contentType: photo.asset.contentType,
      })),
      representativeName: display.companyRepresentativeName,
      rentalMedia: rentalMedia.map((photo) => ({
        photoId: photo.id,
        eventType: "handover",
        assetId: photo.assetId,
        sha256: photo.asset.checksumSha256,
        contentType: photo.asset.contentType,
        fileName: photo.fileName,
      })),
      vehicleDocuments: vehicleDocuments.flatMap((document) =>
        document.clientCopyAsset
          ? [
              {
                documentId: document.id,
                type: document.type,
                assetId: document.clientCopyAsset.id,
                sha256: document.clientCopyAsset.checksumSha256,
                contentType: document.clientCopyAsset.contentType,
                fileName: document.clientCopyFileName ?? document.fileName,
              },
            ]
          : [],
      ),
      terms,
      applicationSpeedLimitKmh,
      inspection,
      limiterKind: scooter.limiterKind,
      limiterKmh: scooter.limiterKmh,
      maxSpeedKmh: scooter.maxSpeedKmh,
      logoAssetId: settings.logoAssetId ?? null,
      display,
    }),
  };
}

export function snapshotValues(
  snapshot: PackageSnapshot,
  templateVersion: string,
): TemplateValues {
  const values: Record<string, import("./engine/docx-engine").TemplateValue> = {
    ...snapshot.display,
    templateVersion,
  };
  for (const field of FIELD_REGISTRY)
    if (field.type === "signature")
      values[field.key] =
        field.key === "renterSignSpeed" && snapshot.limiterKind === "NO_LIMITER"
          ? { kind: "not-applicable" }
          : { kind: "unsigned" };
  values.companyLogo = { kind: "not-applicable" };
  return values;
}
