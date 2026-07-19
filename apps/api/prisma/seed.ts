/**
 * Deterministic seed for local dev + E2E tests.
 *
 * Every row this script creates uses a fixed primary key derived from
 * its purpose, so tests can rely on stable IDs across `prisma migrate
 * reset` cycles. Idempotent: re-running upserts existing rows in place.
 *
 * NOT for production. These users exist for the sole purpose of giving
 * developers and the E2E suite known accounts to log in with. The script
 * refuses to run when NODE_ENV=production.
 *
 * Uses Prisma 7's canonical setup per AGENTS.md → prisma-verify-rule:
 *   - PrismaClient comes from `../src/generated/prisma/client`
 *     (not `@prisma/client` — that import path is empty in v7)
 *   - Connection goes through PrismaPg driver adapter with explicit pool
 *     settings (pg's defaults differ from what Prisma 6 used)
 *
 * Users created:
 *
 *   | Email                          | Purpose                       | Notes                               |
 *   |--------------------------------|-------------------------------|-------------------------------------|
 *   | test-email-otp@example.com     | Email-OTP flow                | no OAuth links                      |
 *   | test-sms@example.com           | SMS-OTP flow                  | phone +40700000001                  |
 *   | test-google@example.com        | Google OAuth                  | linked AuthAccount row              |
 *   | test-apple@example.com         | Apple OAuth                   | linked AuthAccount row, email saved |
 *
 * Persons created:
 *
 *   | Email                              | Purpose                                |
 *   |------------------------------------|----------------------------------------|
 *   | seed-ana.popescu@example.com       | Romanian ID plus driver license        |
 *   | seed-mihai.ionescu@example.com     | passport plus rejected driver license  |
 *   | seed-elena.marinescu@example.com   | active person without documents        |
 *   | seed-victor.dumitrescu@example.com | soft-deleted person                    |
 *   | seed-person-0001@example.com       | generated local dataset, 120 records   |
 *
 * Scooters created:
 *
 *   | Type                    | Count | Notes                         |
 *   |-------------------------|-------|-------------------------------|
 *   | combustion, 50cc active | 180   | generated local inventory     |
 *   | combustion, 125cc active| 10    | generated larger scooter set  |
 *   | electric active         | 5     | generated electric edge cases |
 *   | combustion, 50cc deleted| 5     | includeDeleted coverage       |
 *
 * Run via `pnpm db:seed` (which calls `prisma db seed` → `tsx prisma/seed.ts`).
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to seed test users in production. This seed exists only for local dev and E2E tests.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const prisma = new PrismaClient({ adapter });

const FIXED_IDS = {
  emailOtp: "seed-user-email-otp",
  sms: "seed-user-sms",
  google: "seed-user-google",
  apple: "seed-user-apple",
} as const;

const FIXED_PERSON_IDS = {
  ana: "seed-person-ana-popescu",
  mihai: "seed-person-mihai-ionescu",
  elena: "seed-person-elena-marinescu",
  victor: "seed-person-victor-dumitrescu",
} as const;

const FIXED_PERSON_DOCUMENT_IDS = {
  anaNationalId: "seed-person-document-ana-national-id",
  anaDriverLicense: "seed-person-document-ana-driver-license",
  mihaiPassport: "seed-person-document-mihai-passport",
  mihaiDriverLicense: "seed-person-document-mihai-driver-license",
  victorNationalId: "seed-person-document-victor-national-id",
} as const;

const GENERATED_PERSON_COUNT = 120;
const GENERATED_SCOOTER_COUNT = 200;
const PERSON_AUDIT_TARGET_TYPE = "person";
const SEED_AUDIT_ACTOR = {
  kind: "system",
  userId: null,
  email: null,
  name: "Seed data",
} as const;
const REDACTED_VALUE = "[redacted]";
const SET_VALUE = "[set]";

type PersonDocumentSeed = {
  id: string;
  type: PersonDocumentType;
  series: string | null;
  number: string | null;
  cnp: string | null;
  issuingCountryCode: string | null;
  issuedBy: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
  status: PersonDocumentStatus;
  notes: string | null;
  deletedAt: Date | null;
};

type PersonDocumentType =
  | "passport"
  | "nationalId"
  | "driverLicense"
  | "residencePermit"
  | "other";

type PersonDocumentStatus = "unverified" | "verified" | "rejected" | "expired";

type PersonSeed = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  notes: string | null;
  deletedAt: Date | null;
  documents: PersonDocumentSeed[];
};

type ScooterPowertrainType = "electric" | "combustion";
type ScooterRegistrationType = "unregistered";

type ScooterSeed = {
  id: string;
  vin: string;
  brand: string;
  model: string;
  color: string | null;
  manufactureYear: number;
  powertrainType: ScooterPowertrainType;
  engineCc: number | null;
  powerKw: number | null;
  purchasedOn: Date;
  registrationType: ScooterRegistrationType;
  plateNumber: string | null;
  plateNumberNormalized: string | null;
  registeredOn: Date | null;
  registrationExpiresOn: Date | null;
  requiredDriverLicenseType: "none";
  notes: string | null;
  deletedAt: Date | null;
};

const CURATED_PERSON_SEEDS: PersonSeed[] = [
  {
    id: FIXED_PERSON_IDS.ana,
    email: "seed-ana.popescu@example.com",
    phone: "+40700001001",
    firstName: "Ana",
    lastName: "Popescu",
    dateOfBirth: dateOnly("1992-04-12"),
    addressLine1: "Strada Academiei 10",
    addressLine2: null,
    city: "Bucuresti",
    region: "B",
    postalCode: "010013",
    countryCode: "RO",
    notes: "Seed person with verified national ID and active driver license.",
    deletedAt: null,
    documents: [
      {
        id: FIXED_PERSON_DOCUMENT_IDS.anaNationalId,
        type: "nationalId",
        series: "RX",
        number: "100001",
        cnp: "2920412123454",
        issuingCountryCode: "RO",
        issuedBy: "SPCLEP Sector 1",
        issuedOn: dateOnly("2022-03-01"),
        expiresOn: dateOnly("2032-03-01"),
        status: "verified",
        notes: "Primary verified Romanian ID.",
        deletedAt: null,
      },
      {
        id: FIXED_PERSON_DOCUMENT_IDS.anaDriverLicense,
        type: "driverLicense",
        series: "B",
        number: "B100001",
        cnp: null,
        issuingCountryCode: "RO",
        issuedBy: "DRPCIV Bucuresti",
        issuedOn: dateOnly("2021-06-15"),
        expiresOn: dateOnly("2031-06-15"),
        status: "unverified",
        notes: "Pending back-office verification.",
        deletedAt: null,
      },
    ],
  },
  {
    id: FIXED_PERSON_IDS.mihai,
    email: "seed-mihai.ionescu@example.com",
    phone: "+40700001002",
    firstName: "Mihai",
    lastName: "Ionescu",
    dateOfBirth: dateOnly("1987-09-08"),
    addressLine1: "Calea Victoriei 120",
    addressLine2: "Ap. 8",
    city: "Bucuresti",
    region: "B",
    postalCode: "010094",
    countryCode: "RO",
    notes: "Seed person with an expired passport and rejected driver license.",
    deletedAt: null,
    documents: [
      {
        id: FIXED_PERSON_DOCUMENT_IDS.mihaiPassport,
        type: "passport",
        series: "PE",
        number: "900001",
        cnp: null,
        issuingCountryCode: "RO",
        issuedBy: "Directia Generala de Pasapoarte",
        issuedOn: dateOnly("2014-02-10"),
        expiresOn: dateOnly("2024-02-10"),
        status: "expired",
        notes: "Expired passport retained for search and renewal flows.",
        deletedAt: null,
      },
      {
        id: FIXED_PERSON_DOCUMENT_IDS.mihaiDriverLicense,
        type: "driverLicense",
        series: "B",
        number: "B200001",
        cnp: null,
        issuingCountryCode: "RO",
        issuedBy: "DRPCIV Bucuresti",
        issuedOn: dateOnly("2024-02-10"),
        expiresOn: dateOnly("2034-02-10"),
        status: "rejected",
        notes: "Rejected driver license sample for admin UI states.",
        deletedAt: null,
      },
    ],
  },
  {
    id: FIXED_PERSON_IDS.elena,
    email: "seed-elena.marinescu@example.com",
    phone: "+40700001003",
    firstName: "Elena",
    lastName: "Marinescu",
    dateOfBirth: dateOnly("1995-12-03"),
    addressLine1: "Strada Memorandumului 4",
    addressLine2: null,
    city: "Cluj-Napoca",
    region: "CJ",
    postalCode: "400114",
    countryCode: "RO",
    notes: "Seed person without uploaded documents.",
    deletedAt: null,
    documents: [],
  },
  {
    id: FIXED_PERSON_IDS.victor,
    email: "seed-victor.dumitrescu@example.com",
    phone: "+40700001004",
    firstName: "Victor",
    lastName: "Dumitrescu",
    dateOfBirth: dateOnly("1978-07-22"),
    addressLine1: "Bulevardul Decebal 25",
    addressLine2: null,
    city: "Timisoara",
    region: "TM",
    postalCode: "300222",
    countryCode: "RO",
    notes: "Soft-deleted seed person for includeDeleted flows.",
    deletedAt: new Date("2026-01-15T10:00:00.000Z"),
    documents: [
      {
        id: FIXED_PERSON_DOCUMENT_IDS.victorNationalId,
        type: "nationalId",
        series: "TM",
        number: "300001",
        cnp: "1780722123455",
        issuingCountryCode: "RO",
        issuedBy: "SPCLEP Timisoara",
        issuedOn: dateOnly("2019-05-10"),
        expiresOn: dateOnly("2029-05-10"),
        status: "verified",
        notes: "Document attached to soft-deleted seed person.",
        deletedAt: null,
      },
    ],
  },
];

const GENERATED_FIRST_NAMES = [
  "Andrei",
  "Bianca",
  "Catalin",
  "Daria",
  "Emil",
  "Florina",
  "Gabriel",
  "Ioana",
  "Lucian",
  "Mara",
  "Nicoleta",
  "Octavian",
] as const;

const GENERATED_LAST_NAMES = [
  "Stan",
  "Dobre",
  "Matei",
  "Radu",
  "Neagu",
  "Toma",
  "Serban",
  "Ilie",
  "Barbu",
  "Preda",
  "Lazar",
  "Enache",
] as const;

const GENERATED_LOCATIONS = [
  {
    city: "Bucuresti",
    region: "B",
    postalCode: "010101",
    street: "Strada Plantelor",
  },
  {
    city: "Cluj-Napoca",
    region: "CJ",
    postalCode: "400101",
    street: "Strada Horea",
  },
  {
    city: "Timisoara",
    region: "TM",
    postalCode: "300101",
    street: "Strada Alba Iulia",
  },
  {
    city: "Iasi",
    region: "IS",
    postalCode: "700101",
    street: "Bulevardul Independentei",
  },
  {
    city: "Brasov",
    region: "BV",
    postalCode: "500101",
    street: "Strada Lunga",
  },
  {
    city: "Constanta",
    region: "CT",
    postalCode: "900101",
    street: "Bulevardul Tomis",
  },
] as const;

const GENERATED_SCOOTER_50CC_MODELS = [
  { brand: "Piaggio", model: "Liberty 50" },
  { brand: "Kymco", model: "Agility 50" },
  { brand: "SYM", model: "Fiddle 50" },
  { brand: "Yamaha", model: "Neos 50" },
  { brand: "Honda", model: "Vision 50" },
  { brand: "Keeway", model: "Fact Evo 50" },
  { brand: "Aprilia", model: "SR 50" },
  { brand: "Peugeot", model: "Kisbee 50" },
  { brand: "Rieju", model: "MRT 50" },
  { brand: "Znen", model: "Classic 50" },
] as const;

const GENERATED_SCOOTER_125CC_MODELS = [
  { brand: "Yamaha", model: "NMAX 125" },
  { brand: "Honda", model: "PCX 125" },
  { brand: "Kymco", model: "People S 125" },
  { brand: "SYM", model: "Jet X 125" },
  { brand: "Piaggio", model: "Medley 125" },
] as const;

const GENERATED_ELECTRIC_SCOOTER_MODELS = [
  { brand: "NIU", model: "MQi GT" },
  { brand: "Silence", model: "S01" },
  { brand: "Horwin", model: "EK1" },
  { brand: "Super Soco", model: "CUx" },
  { brand: "Askoll", model: "eS2" },
] as const;

const GENERATED_SCOOTER_COLORS = [
  "white",
  "black",
  "blue",
  "red",
  "silver",
  "grey",
  "green",
  "yellow",
  "orange",
  "matte black",
] as const;

const PERSON_SEEDS: PersonSeed[] = [
  ...CURATED_PERSON_SEEDS,
  ...buildGeneratedPersonSeeds(GENERATED_PERSON_COUNT),
];

const SCOOTER_SEEDS: ScooterSeed[] = buildGeneratedScooterSeeds(
  GENERATED_SCOOTER_COUNT,
);

async function main(): Promise<void> {
  const now = new Date();

  // Email-OTP user — no OAuth links.
  await prisma.user.upsert({
    where: { id: FIXED_IDS.emailOtp },
    create: {
      id: FIXED_IDS.emailOtp,
      email: "test-email-otp@example.com",
      firstName: "Test",
      lastName: "EmailOtp",
    },
    update: {},
  });

  // SMS-OTP user — has phone, no email-verified.
  await prisma.user.upsert({
    where: { id: FIXED_IDS.sms },
    create: {
      id: FIXED_IDS.sms,
      email: "test-sms@example.com",
      phone: "+40700000001",
      firstName: "Test",
      lastName: "Sms",
    },
    update: { phone: "+40700000001" },
  });

  // OAuth-linked users — one AuthAccount row each.
  const oauthSeeds = [
    {
      id: FIXED_IDS.google,
      email: "test-google@example.com",
      provider: "google" as const,
      providerId: "seed-google-sub-001",
    },
    {
      id: FIXED_IDS.apple,
      email: "test-apple@example.com",
      provider: "apple" as const,
      providerId: "seed-apple-sub-001",
    },
  ];

  for (const seed of oauthSeeds) {
    await prisma.user.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        email: seed.email,
        emailVerified: now,
        firstName: "Test",
        lastName:
          seed.provider.charAt(0).toUpperCase() + seed.provider.slice(1),
      },
      update: { emailVerified: now },
    });

    await prisma.authAccount.upsert({
      where: {
        provider_providerId: {
          provider: seed.provider,
          providerId: seed.providerId,
        },
      },
      create: {
        provider: seed.provider,
        providerId: seed.providerId,
        userId: seed.id,
        email: seed.email,
      },
      update: { email: seed.email },
    });
  }

  await seedPersons();
  await seedScooters();

  console.log(
    `Seeded ${Object.keys(FIXED_IDS).length} users, ${PERSON_SEEDS.length} persons, and ${SCOOTER_SEEDS.length} scooters.`,
  );
}

async function seedPersons(): Promise<void> {
  for (const seed of PERSON_SEEDS) {
    await prisma.person.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        ...personData(seed),
      },
      update: personData(seed),
    });

    await prisma.personDocument.deleteMany({
      where: {
        personId: seed.id,
        id: { notIn: seed.documents.map((document) => document.id) },
      },
    });

    for (const document of seed.documents) {
      await prisma.personDocument.upsert({
        where: { id: document.id },
        create: {
          id: document.id,
          personId: seed.id,
          ...personDocumentData(document),
        },
        update: {
          personId: seed.id,
          ...personDocumentData(document),
        },
      });
    }

    await seedPersonAuditEvents(seed);
  }
}

async function seedScooters(): Promise<void> {
  for (const seed of SCOOTER_SEEDS) {
    await prisma.scooter.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        ...scooterData(seed),
      },
      update: scooterData(seed),
    });
  }
}

async function seedPersonAuditEvents(seed: PersonSeed): Promise<void> {
  await upsertPersonAuditEvent({
    id: `seed-audit-person-created-${seed.id}`,
    type: "PERSON_CREATED",
    personId: seed.id,
    changes: personSeedAuditChanges(seed),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  for (const document of seed.documents) {
    await upsertPersonAuditEvent({
      id: `seed-audit-document-created-${document.id}`,
      type: "PERSON_DOCUMENT_CREATED",
      personId: seed.id,
      document: documentSeedSummary(document),
      changes: documentSeedAuditChanges(document),
      createdAt: new Date("2026-01-01T00:01:00.000Z"),
    });
  }

  if (seed.deletedAt) {
    await upsertPersonAuditEvent({
      id: `seed-audit-person-deleted-${seed.id}`,
      type: "PERSON_DELETED",
      personId: seed.id,
      changes: [],
      createdAt: seed.deletedAt,
    });
  }
}

async function upsertPersonAuditEvent({
  id,
  type,
  personId,
  document = null,
  replacement = null,
  changes,
  createdAt,
}: {
  id: string;
  type: string;
  personId: string;
  document?: ReturnType<typeof documentSeedSummary> | null;
  replacement?: null;
  changes: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
  createdAt: Date;
}): Promise<void> {
  const data = {
    userId: null,
    type,
    targetType: PERSON_AUDIT_TARGET_TYPE,
    targetId: personId,
    ip: null,
    userAgent: null,
    meta: {
      actor: SEED_AUDIT_ACTOR,
      document,
      replacement,
      changes,
    },
    createdAt,
  };

  await prisma.auditEvent.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

function personData(seed: PersonSeed) {
  return {
    email: seed.email,
    phone: seed.phone,
    firstName: seed.firstName,
    lastName: seed.lastName,
    dateOfBirth: seed.dateOfBirth,
    addressLine1: seed.addressLine1,
    addressLine2: seed.addressLine2,
    city: seed.city,
    region: seed.region,
    postalCode: seed.postalCode,
    countryCode: seed.countryCode,
    notes: seed.notes,
    deletedAt: seed.deletedAt,
  };
}

function personDocumentData(seed: PersonDocumentSeed) {
  return {
    type: seed.type,
    series: seed.series,
    number: seed.number,
    cnp: seed.cnp,
    issuingCountryCode: seed.issuingCountryCode,
    issuedBy: seed.issuedBy,
    issuedOn: seed.issuedOn,
    expiresOn: seed.expiresOn,
    status: seed.status,
    notes: seed.notes,
    deletedAt: seed.deletedAt,
  };
}

function scooterData(seed: ScooterSeed) {
  return {
    vin: seed.vin,
    brand: seed.brand,
    model: seed.model,
    color: seed.color,
    manufactureYear: seed.manufactureYear,
    powertrainType: seed.powertrainType,
    engineCc: seed.engineCc,
    powerKw: seed.powerKw,
    purchasedOn: seed.purchasedOn,
    registrationType: seed.registrationType,
    plateNumber: seed.plateNumber,
    plateNumberNormalized: seed.plateNumberNormalized,
    registeredOn: seed.registeredOn,
    registrationExpiresOn: seed.registrationExpiresOn,
    requiredDriverLicenseType: seed.requiredDriverLicenseType,
    notes: seed.notes,
    deletedAt: seed.deletedAt,
  };
}

function personSeedAuditChanges(seed: PersonSeed) {
  return compactSeedChanges([
    createSeedChange("email", seed.email),
    createSeedChange("phone", seed.phone),
    createSeedChange("firstName", seed.firstName),
    createSeedChange("lastName", seed.lastName),
    createSeedChange("dateOfBirth", dateOnlyString(seed.dateOfBirth)),
    createSeedChange("addressLine1", seed.addressLine1),
    createSeedChange("addressLine2", seed.addressLine2),
    createSeedChange("city", seed.city),
    createSeedChange("region", seed.region),
    createSeedChange("postalCode", seed.postalCode),
    createSeedChange("countryCode", seed.countryCode),
    createSeedChange("notes", seed.notes ? SET_VALUE : null),
  ]);
}

function documentSeedAuditChanges(seed: PersonDocumentSeed) {
  return compactSeedChanges([
    createSeedChange("document.type", seed.type),
    createSeedChange("document.series", seed.series),
    createSeedChange("document.number", maskSensitiveSeedValue(seed.number)),
    createSeedChange("document.cnp", maskSensitiveSeedValue(seed.cnp)),
    createSeedChange("document.issuingCountryCode", seed.issuingCountryCode),
    createSeedChange("document.issuedBy", seed.issuedBy),
    createSeedChange("document.issuedOn", dateOnlyString(seed.issuedOn)),
    createSeedChange("document.expiresOn", dateOnlyString(seed.expiresOn)),
    createSeedChange("document.status", seed.status),
    createSeedChange("document.notes", seed.notes ? SET_VALUE : null),
  ]);
}

function documentSeedSummary(seed: PersonDocumentSeed) {
  return {
    id: seed.id,
    type: seed.type,
    status: seed.status,
  };
}

function createSeedChange(field: string, value: string | null) {
  return value === null ? null : { field, oldValue: null, newValue: value };
}

function compactSeedChanges(
  changes: Array<ReturnType<typeof createSeedChange>>,
) {
  return changes.filter(
    (change): change is NonNullable<typeof change> => change !== null,
  );
}

function maskSensitiveSeedValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const visibleLength = Math.min(4, value.length);
  return `${REDACTED_VALUE} ${value.slice(-visibleLength)}`;
}

function dateOnlyString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function buildGeneratedPersonSeeds(count: number): PersonSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const padded = ordinal.toString().padStart(4, "0");
    const firstName =
      GENERATED_FIRST_NAMES[index % GENERATED_FIRST_NAMES.length];
    const lastName =
      GENERATED_LAST_NAMES[
        Math.floor(index / GENERATED_FIRST_NAMES.length) %
          GENERATED_LAST_NAMES.length
      ];
    const location = GENERATED_LOCATIONS[index % GENERATED_LOCATIONS.length];
    const birthYear = 1975 + (index % 28);
    const birthMonth = (index % 12) + 1;
    const birthDay = (index % 27) + 1;

    return {
      id: `seed-person-generated-${padded}`,
      email: `seed-person-${padded}@example.com`,
      phone: `+4070001${padded}`,
      firstName,
      lastName,
      dateOfBirth: dateOnly(
        `${birthYear}-${pad2(birthMonth)}-${pad2(birthDay)}`,
      ),
      addressLine1: `${location.street} ${ordinal}`,
      addressLine2:
        ordinal % 4 === 0
          ? `Sc. ${String.fromCharCode(65 + (index % 4))}`
          : null,
      city: location.city,
      region: location.region,
      postalCode: location.postalCode,
      countryCode: "RO",
      notes: generatedPersonNotes(ordinal),
      deletedAt:
        ordinal % 29 === 0
          ? new Date(`2026-02-${pad2((ordinal % 20) + 1)}T09:00:00.000Z`)
          : null,
      documents: buildGeneratedPersonDocuments({
        ordinal,
        padded,
        birthYear,
        birthMonth,
        birthDay,
      }),
    };
  });
}

function buildGeneratedScooterSeeds(count: number): ScooterSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const padded = ordinal.toString().padStart(4, "0");
    const is125Cc = ordinal > 180 && ordinal <= 190;
    const isElectric = ordinal > 190 && ordinal <= 195;
    const isDeleted = ordinal > 195;
    const model = generatedScooterModel({ ordinal, is125Cc, isElectric });

    return {
      id: `seed-scooter-generated-${padded}`,
      vin: generatedScooterVin(ordinal),
      brand: model.brand,
      model: model.model,
      color: GENERATED_SCOOTER_COLORS[index % GENERATED_SCOOTER_COLORS.length],
      manufactureYear: 2021 + (index % 6),
      powertrainType: isElectric ? "electric" : "combustion",
      engineCc: isElectric ? null : is125Cc ? 125 : 50,
      powerKw: isElectric ? 3.2 : is125Cc ? 8.5 : 2.8,
      purchasedOn: generatedScooterPurchasedOn(ordinal),
      registrationType: "unregistered",
      plateNumber: null,
      plateNumberNormalized: null,
      registeredOn: null,
      registrationExpiresOn: null,
      requiredDriverLicenseType: "none",
      notes: generatedScooterNotes({ is125Cc, isElectric, isDeleted }),
      deletedAt: isDeleted
        ? new Date(`2026-03-${pad2(ordinal - 195)}T10:00:00.000Z`)
        : null,
    };
  });
}

function buildGeneratedPersonDocuments({
  ordinal,
  padded,
  birthYear,
  birthMonth,
  birthDay,
}: {
  ordinal: number;
  padded: string;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
}): PersonDocumentSeed[] {
  if (ordinal % 10 === 0) {
    return [];
  }

  const usesPassportIdentity = ordinal % 4 === 0;
  const documents: PersonDocumentSeed[] = [
    usesPassportIdentity
      ? {
          id: `seed-person-generated-${padded}-passport`,
          type: "passport",
          series: generatedSeries("PE", ordinal),
          number: generatedDocumentNumber(300_000, ordinal),
          cnp: null,
          issuingCountryCode: "RO",
          issuedBy: "Directia Generala de Pasapoarte",
          issuedOn: dateOnly(
            `${2020 + (ordinal % 5)}-${pad2(((ordinal + 4) % 12) + 1)}-20`,
          ),
          expiresOn: dateOnly(
            `${2030 + (ordinal % 5)}-${pad2(((ordinal + 4) % 12) + 1)}-20`,
          ),
          status: generatedDocumentStatus(ordinal),
          notes: "Generated passport seed document.",
          deletedAt: null,
        }
      : {
          id: `seed-person-generated-${padded}-national-id`,
          type: "nationalId",
          series: generatedSeries("RX", ordinal),
          number: generatedDocumentNumber(100_000, ordinal),
          cnp: generatedCnp({
            ordinal,
            birthYear,
            birthMonth,
            birthDay,
          }),
          issuingCountryCode: "RO",
          issuedBy: generatedIssuedBy(ordinal),
          issuedOn: dateOnly(
            `${2018 + (ordinal % 7)}-${pad2((ordinal % 12) + 1)}-15`,
          ),
          expiresOn: dateOnly(
            `${2028 + (ordinal % 7)}-${pad2((ordinal % 12) + 1)}-15`,
          ),
          status: generatedDocumentStatus(ordinal),
          notes: "Generated national ID seed document.",
          deletedAt: null,
        },
  ];

  if (ordinal % 3 === 0) {
    documents.push({
      id: `seed-person-generated-${padded}-driver-license`,
      type: "driverLicense",
      series: generatedSeries("DL", ordinal),
      number: `B${generatedDocumentNumber(200_000, ordinal)}`,
      cnp: null,
      issuingCountryCode: "RO",
      issuedBy: "DRPCIV",
      issuedOn: dateOnly(
        `${2017 + (ordinal % 8)}-${pad2(((ordinal + 2) % 12) + 1)}-10`,
      ),
      expiresOn: dateOnly(
        `${2027 + (ordinal % 8)}-${pad2(((ordinal + 2) % 12) + 1)}-10`,
      ),
      status: generatedDocumentStatus(ordinal + 1),
      notes: "Generated driver license seed document.",
      deletedAt: null,
    });
  }

  if (!usesPassportIdentity && ordinal % 13 === 0) {
    documents[0] = {
      ...documents[0],
      expiresOn: dateOnly("2024-12-31"),
      status: "expired",
      notes: "Generated expired national ID seed document.",
    };
  }

  return documents;
}

function generatedPersonNotes(ordinal: number): string {
  if (ordinal % 29 === 0) {
    return "Generated soft-deleted person for includeDeleted paging checks.";
  }
  if (ordinal % 10 === 0) {
    return "Generated person without documents.";
  }
  return "Generated person seed for local list, search, and pagination flows.";
}

function generatedScooterModel({
  ordinal,
  is125Cc,
  isElectric,
}: {
  ordinal: number;
  is125Cc: boolean;
  isElectric: boolean;
}): { brand: string; model: string } {
  if (isElectric) {
    return GENERATED_ELECTRIC_SCOOTER_MODELS[
      (ordinal - 191) % GENERATED_ELECTRIC_SCOOTER_MODELS.length
    ];
  }

  if (is125Cc) {
    return GENERATED_SCOOTER_125CC_MODELS[
      (ordinal - 181) % GENERATED_SCOOTER_125CC_MODELS.length
    ];
  }

  return GENERATED_SCOOTER_50CC_MODELS[
    (ordinal - 1) % GENERATED_SCOOTER_50CC_MODELS.length
  ];
}

function generatedScooterVin(ordinal: number): string {
  return `LXYTCKP05P${5_000_000 + ordinal}`;
}

function generatedScooterPurchasedOn(ordinal: number): Date {
  const month = ((ordinal - 1) % 12) + 1;
  const day = ((ordinal - 1) % 27) + 1;

  return dateOnly(`${2025 + (ordinal % 2)}-${pad2(month)}-${pad2(day)}`);
}

function generatedScooterNotes({
  is125Cc,
  isElectric,
  isDeleted,
}: {
  is125Cc: boolean;
  isElectric: boolean;
  isDeleted: boolean;
}): string {
  if (isDeleted) {
    return "Generated soft-deleted 50cc scooter for includeDeleted paging checks.";
  }

  if (isElectric) {
    return "Generated electric scooter seed for powertrain filter checks.";
  }

  if (is125Cc) {
    return "Generated 125cc combustion scooter seed for capacity filter checks.";
  }

  return "Generated 50cc combustion scooter seed for local inventory flows.";
}

function generatedDocumentStatus(ordinal: number): PersonDocumentStatus {
  if (ordinal % 17 === 0) return "rejected";
  if (ordinal % 13 === 0) return "expired";
  if (ordinal % 5 === 0) return "unverified";
  return "verified";
}

function generatedIssuedBy(ordinal: number): string {
  const sector = (ordinal % 6) + 1;
  return `SPCLEP Sector ${sector}`;
}

function generatedSeries(prefix: string, ordinal: number): string {
  return `${prefix}${(ordinal % 90) + 10}`;
}

function generatedDocumentNumber(offset: number, ordinal: number): string {
  return String(offset + ordinal);
}

function generatedCnp({
  ordinal,
  birthYear,
  birthMonth,
  birthDay,
}: {
  ordinal: number;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
}): string {
  const centuryAndGender = birthYear >= 2000 ? 5 : 1;
  const year = birthYear % 100;
  const county = (ordinal % 42) + 1;
  const serial = (ordinal % 899) + 100;
  const prefix = `${centuryAndGender}${pad2(year)}${pad2(birthMonth)}${pad2(
    birthDay,
  )}${pad2(county)}${serial}`;

  return `${prefix}${cnpControlDigit(prefix)}`;
}

function cnpControlDigit(prefix: string): number {
  const weights = "279146358279";
  let sum = 0;

  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(prefix.charAt(i)) * Number(weights.charAt(i));
  }

  const remainder = sum % 11;
  return remainder === 10 ? 1 : remainder;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
