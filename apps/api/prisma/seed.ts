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

const PERSON_SEEDS: PersonSeed[] = [
  ...CURATED_PERSON_SEEDS,
  ...buildGeneratedPersonSeeds(GENERATED_PERSON_COUNT),
];

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

  console.log(
    `Seeded ${Object.keys(FIXED_IDS).length} users and ${PERSON_SEEDS.length} persons.`,
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
  }
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
