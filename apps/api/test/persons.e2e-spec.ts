/**
 * HTTP-level e2e tests for the admin-managed `/v1/persons` endpoints.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import {
  S3_CLIENT,
  S3_PRESIGNER,
} from "../src/image-storage/image-storage.constants";
import type { S3PresignOptions } from "../src/image-storage/image-storage.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { PersonDocumentExtractionService } from "../src/person-document-extraction/person-document-extraction.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  accessToken: string;
  userId: string;
}

interface StoredS3Object {
  body: Buffer;
  contentType: string;
}

describe("Persons HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];
  const createdPersonEmails: string[] = [];
  const createdPersonPhones: string[] = [];
  const s3Objects = new Map<string, StoredS3Object>();
  const presignedPutKeys: string[] = [];
  // Emails already vary per run via `Date.now()`. Phones must too: a fixed
  // start makes every run reuse `+40710000001...`, so re-running against a
  // database that still holds an earlier run's rows collides on the unique
  // phone and fails the very first create with a 409.
  let phoneSeq = 10_000_000 + Math.floor(Math.random() * 89_000_000);

  const fakePersonExtraction = {
    analyze: jest.fn().mockResolvedValue({
      detectedDocumentType: "nationalId",
      suggestions: [
        {
          target: "person",
          field: "firstName",
          value: "Ștefan",
          sourceSlot: "front",
          needsReview: false,
        },
      ],
      licenseCategories: [],
      warnings: [],
    }),
  };

  const fakeS3 = {
    send: jest.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key;
        const body = command.input.Body;
        if (typeof key !== "string" || !Buffer.isBuffer(body)) {
          throw new Error("Unexpected PutObjectCommand input");
        }
        s3Objects.set(key, {
          body,
          contentType: command.input.ContentType ?? "application/octet-stream",
        });
        return {};
      }

      if (command instanceof GetObjectCommand) {
        const key = command.input.Key;
        if (typeof key !== "string") {
          throw new Error("Unexpected GetObjectCommand input");
        }
        const object = s3Objects.get(key);
        if (!object) {
          const error = new Error("NoSuchKey") as Error & {
            name: string;
            $metadata: { httpStatusCode: number };
          };
          error.name = "NoSuchKey";
          error.$metadata = { httpStatusCode: 404 };
          throw error;
        }
        return {
          Body: Readable.from([object.body]),
          ContentType: object.contentType,
          ContentLength: object.body.length,
        };
      }

      if (command instanceof HeadObjectCommand) {
        const key = command.input.Key;
        if (typeof key !== "string") {
          throw new Error("Unexpected HeadObjectCommand input");
        }
        const object = s3Objects.get(key);
        if (!object) {
          const error = new Error("NoSuchKey") as Error & {
            name: string;
            $metadata: { httpStatusCode: number };
          };
          error.name = "NoSuchKey";
          error.$metadata = { httpStatusCode: 404 };
          throw error;
        }
        return {
          ContentType: object.contentType,
          ContentLength: object.body.length,
        };
      }

      if (command instanceof DeleteObjectCommand) {
        const key = command.input.Key;
        if (typeof key !== "string") {
          throw new Error("Unexpected DeleteObjectCommand input");
        }
        s3Objects.delete(key);
        return {};
      }

      throw new Error("Unexpected S3 command");
    }),
  };
  const fakePresigner = {
    getSignedUrl: jest.fn(
      (
        command: PutObjectCommand,
        expiresIn: number,
        options?: S3PresignOptions,
      ): Promise<string> => {
        const key = command.input.Key;
        if (typeof key !== "string") {
          throw new Error("Unexpected signed URL command input");
        }
        const extraSignedHeaders = options?.unhoistableHeaders
          ? Array.from(options.unhoistableHeaders).sort()
          : [];
        const signedHeaders = ["host", ...extraSignedHeaders].join(";");
        presignedPutKeys.push(key);
        return Promise.resolve(
          `https://s3.test/upload/${encodeURIComponent(
            key,
          )}?X-Amz-SignedHeaders=${encodeURIComponent(
            signedHeaders,
          )}&expires=${expiresIn}`,
        );
      },
    ),
  };

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
    put: (path: string) => RequestBuilder;
    patch: (path: string) => RequestBuilder;
    delete: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (b: RequestBuilder) => b.set("x-requested-with", "fetch");
    return {
      get: (p) => tag(base.get(p)),
      post: (p) => tag(base.post(p)),
      put: (p) => tag(base.put(p)),
      patch: (p) => tag(base.patch(p)),
      delete: (p) => tag(base.delete(p)),
    };
  };

  beforeAll(async () => {
    process.env.IMAGE_STORAGE_MAX_BYTES = "64";
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PersonDocumentExtractionService)
      .useValue(fakePersonExtraction)
      .overrideProvider(S3_CLIENT)
      .useValue(fakeS3)
      .overrideProvider(S3_PRESIGNER)
      .useValue(fakePresigner)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);
  });

  afterAll(async () => {
    if (
      prisma &&
      (createdPersonEmails.length > 0 || createdPersonPhones.length > 0)
    ) {
      const personWhere = {
        OR: [
          { email: { in: createdPersonEmails } },
          { phone: { in: createdPersonPhones } },
        ],
      };
      await prisma.person.deleteMany({ where: personWhere });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.draftUpload.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app?.close();
  });

  async function freshSession(roles: string[]): Promise<IssuedSession> {
    const user = await users.createOne({
      email: `persons-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      roles,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return {
      accessToken: issued.accessToken,
      userId: user.id,
    };
  }

  function uniquePhone(): string {
    phoneSeq += 1;
    return `+407${phoneSeq}`;
  }

  function dateOnlyDaysFromNow(days: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function personInput(overrides: Partial<v1.persons.CreatePersonInput> = {}) {
    const email = `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const phone = uniquePhone();
    createdPersonEmails.push(email);
    createdPersonPhones.push(phone);
    return {
      email,
      phone,
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-02-28",
      documents: [
        {
          type: "nationalId",
          series: "RX",
          number: "123456",
          cnp: overrides.cnp ?? undefined,
          issuingCountryCode: "RO",
          issuedBy: "SPCLEP Bucuresti",
          issuedOn: "2024-01-15",
          expiresOn: "2030-01-31",
          status: "unverified",
        },
      ],
      ...overrides,
    };
  }

  async function listAuditEvents(
    personId: string,
    accessToken: string,
  ): Promise<v1.persons.PersonAuditEvent[]> {
    const res = await req()
      .get(v1.persons.ROUTES.auditEvents.list(personId))
      .set("Cookie", [`access_token=${accessToken}`]);

    expect(res.status).toBe(200);
    return v1.persons.personAuditEventListSchema.parse(res.body);
  }

  function expectAuditPayloadToOmit(
    auditPayload: unknown,
    values: string[],
  ): void {
    const serialized = JSON.stringify(auditPayload);

    for (const value of values) {
      expect(serialized).not.toContain(value);
    }
  }

  it("backfills only unambiguous legacy CNPs without deleting document history", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'CREATE TEMP TABLE "Person" (id text PRIMARY KEY) ON COMMIT DROP',
      );
      await client.query(
        'CREATE TEMP TABLE "PersonDocument" ("personId" text, cnp text) ON COMMIT DROP',
      );
      await client.query(`INSERT INTO "Person" VALUES ('one'), ('conflict'), ('duplicate'), ('empty');
        INSERT INTO "PersonDocument" VALUES
        ('one', '1900228123450'), ('one', ' 1900228123450 '),
        ('conflict', '1900228123469'), ('conflict', '1900228123477'),
        ('duplicate', '1900228123469'), ('empty', NULL)`);
      await client.query(
        readFileSync(
          join(
            __dirname,
            "../prisma/migrations/20260912140000_person_cnp/migration.sql",
          ),
          "utf8",
        ),
      );
      const result = await client.query(
        'SELECT id, cnp FROM "Person" ORDER BY id',
      );
      expect(result.rows).toEqual([
        { id: "conflict", cnp: null },
        { id: "duplicate", cnp: null },
        { id: "empty", cnp: null },
        { id: "one", cnp: "1900228123450" },
      ]);
      const documents = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM "PersonDocument"',
      );
      expect(documents.rows[0].count).toBe(6);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("requires authentication", async () => {
    const res = await req().get(v1.persons.ROUTES.list);
    expect(res.status).toBe(401);
  });

  it("requires the ADMIN role", async () => {
    const session = await freshSession(["USER"]);

    const res = await req()
      .get(v1.persons.ROUTES.list)
      .set("Cookie", [`access_token=${session.accessToken}`]);

    expect(res.status).toBe(403);
  });

  it("keeps a unique person CNP when an ID is replaced", async () => {
    const session = await freshSession(["ADMIN"]);
    const cookie = [`access_token=${session.accessToken}`];
    const cnp = "1900228123469";
    const create = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", cookie)
      .send(personInput({ cnp, dateOfBirth: undefined }));
    expect(create.status).toBe(201);
    const person = v1.persons.personSchema.parse(create.body);
    expect(person.cnp).toBe(cnp);
    expect(person.dateOfBirth).toBe("1990-02-28");

    const duplicate = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", cookie)
      .send(personInput({ cnp }));
    expect(duplicate.status).toBe(409);

    const wrongBirthDate = await req()
      .patch(v1.persons.ROUTES.update(person.id))
      .set("Cookie", cookie)
      .send({ dateOfBirth: "1991-02-28" });
    expect(wrongBirthDate.status).toBe(400);

    const replacement = await req()
      .post(
        v1.persons.ROUTES.documents.replace(person.id, person.documents[0].id),
      )
      .set("Cookie", cookie)
      .send({
        type: "nationalId",
        series: "RX",
        number: "999999",
        issuingCountryCode: "RO",
        expiresOn: "2035-01-31",
      });
    expect(replacement.status).toBe(201);
    const replacementDocument = v1.persons.personDocumentSchema.parse(
      replacement.body,
    );
    expect(replacementDocument.cnp).toBeNull();
    const after = await req()
      .get(v1.persons.ROUTES.get(person.id))
      .set("Cookie", cookie);
    expect(v1.persons.personSchema.parse(after.body).cnp).toBe(cnp);

    const incorrectDocumentCnp = await req()
      .patch(
        v1.persons.ROUTES.documents.update(person.id, replacementDocument.id),
      )
      .set("Cookie", cookie)
      .send({ cnp: "1900228123450" });
    expect(incorrectDocumentCnp.status).toBe(400);
    expectAuditPayloadToOmit(
      await listAuditEvents(person.id, session.accessToken),
      [cnp],
    );
  });

  it("lets admins create, list, get, update, and soft-delete persons", async () => {
    const session = await freshSession(["ADMIN"]);
    const input = personInput({
      cnp: "1900228123450",
      firstName: "  Grace ",
      lastName: " Hopper ",
    });

    const createRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(input);
    const created = v1.persons.personSchema.parse(createRes.body);

    expect(createRes.status).toBe(201);
    expect(created.email).toBe(input.email);
    expect(created.phone).toBe(input.phone);
    expect(created.cnp).toBe("1900228123450");
    expect(created.firstName).toBe("Grace");
    expect(created.lastName).toBe("Hopper");
    expect(created.documents).toHaveLength(1);
    expect(created.documents[0]?.type).toBe("nationalId");
    expect(created.documents[0]?.series).toBe("RX");
    expect(created.documents[0]?.number).toBe("123456");
    expect(created.documents[0]?.cnp).toBe("1900228123450");
    expect(created.documents[0]?.issuingCountryCode).toBe("RO");
    expect(created.documents[0]?.issuedBy).toBe("SPCLEP Bucuresti");
    expect(created.documents[0]?.issuedOn).toBe("2024-01-15");
    expect(created.documents[0]?.status).toBe("unverified");
    expect(created.deletedAt).toBeNull();

    let auditEvents = await listAuditEvents(created.id, session.accessToken);
    expect(auditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["PERSON_CREATED", "PERSON_DOCUMENT_CREATED"]),
    );
    expect(
      auditEvents.find((event) => event.type === "PERSON_CREATED")?.actor,
    ).toEqual(
      expect.objectContaining({
        kind: "user",
        userId: session.userId,
      }),
    );
    expect(
      auditEvents.find((event) => event.type === "PERSON_DOCUMENT_CREATED")
        ?.changes,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "document.number",
          newValue: "**3456",
        }),
        expect.objectContaining({
          field: "document.cnp",
          newValue: "*********3450",
        }),
      ]),
    );
    expectAuditPayloadToOmit(auditEvents, ["123456", "1900228123450"]);

    const duplicateInitialDocumentRes = await req()
      .post(v1.persons.ROUTES.documents.create(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "nationalId",
        number: "RR999999",
        issuingCountryCode: "RO",
      });
    expect(duplicateInitialDocumentRes.status).toBe(409);

    const duplicateIdentityDocumentRes = await req()
      .post(v1.persons.ROUTES.documents.create(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "passport",
        number: "123456789",
        issuingCountryCode: "RO",
      });
    expect(duplicateIdentityDocumentRes.status).toBe(409);

    const driverLicenseRes = await req()
      .post(v1.persons.ROUTES.documents.create(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "driverLicense",
        number: "B7654321",
        issuingCountryCode: "RO",
        expiresOn: "2032-05-20",
      });
    const driverLicense = v1.persons.personDocumentSchema.parse(
      driverLicenseRes.body,
    );

    expect(driverLicenseRes.status).toBe(201);
    expect(driverLicense.personId).toBe(created.id);
    expect(driverLicense.type).toBe("driverLicense");

    const documentsRes = await req()
      .get(v1.persons.ROUTES.documents.list(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const documents = v1.persons.personDocumentListSchema.parse(
      documentsRes.body,
    );

    expect(documentsRes.status).toBe(200);
    expect(documents.map((document) => document.type).sort()).toEqual([
      "driverLicense",
      "nationalId",
    ]);

    const updateDocumentRes = await req()
      .patch(v1.persons.ROUTES.documents.update(created.id, driverLicense.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({ status: "unverified" });
    const updatedDocument = v1.persons.personDocumentSchema.parse(
      updateDocumentRes.body,
    );
    expect(updateDocumentRes.status).toBe(200);
    expect(updatedDocument.status).toBe("unverified");

    const documentUpdateAuditsBeforeNoop = (
      await listAuditEvents(created.id, session.accessToken)
    ).filter((event) => event.type === "PERSON_DOCUMENT_UPDATED");
    expect(documentUpdateAuditsBeforeNoop).toHaveLength(1);
    expect(documentUpdateAuditsBeforeNoop[0]?.changes).toEqual([
      expect.objectContaining({
        field: "document.status",
        oldValue: "verified",
        newValue: "unverified",
      }),
    ]);
    const noOpDocumentUpdateRes = await req()
      .patch(v1.persons.ROUTES.documents.update(created.id, driverLicense.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: updatedDocument.type,
        series: updatedDocument.series,
        number: updatedDocument.number,
        cnp: updatedDocument.cnp,
        issuingCountryCode: updatedDocument.issuingCountryCode,
        issuedBy: updatedDocument.issuedBy,
        issuedOn: updatedDocument.issuedOn,
        expiresOn: updatedDocument.expiresOn,
        status: updatedDocument.status,
        notes: updatedDocument.notes,
      });
    const unchangedDocument = v1.persons.personDocumentSchema.parse(
      noOpDocumentUpdateRes.body,
    );

    expect(noOpDocumentUpdateRes.status).toBe(200);
    expect(unchangedDocument.updatedAt).toBe(updatedDocument.updatedAt);
    expect(
      (await listAuditEvents(created.id, session.accessToken)).filter(
        (event) => event.type === "PERSON_DOCUMENT_UPDATED",
      ),
    ).toHaveLength(documentUpdateAuditsBeforeNoop.length);

    const duplicateDocumentUpdateRes = await req()
      .patch(
        v1.persons.ROUTES.documents.update(created.id, created.documents[0].id),
      )
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({ type: "driverLicense" });
    expect(duplicateDocumentUpdateRes.status).toBe(409);

    const listRes = await req()
      .get(`${v1.persons.ROUTES.list}?search=hopper&page=1&pageSize=10`)
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const list = v1.persons.personListSchema.parse(listRes.body);

    expect(listRes.status).toBe(200);
    expect(list.items.some((person) => person.id === created.id)).toBe(true);

    const fuzzyNameSearchRes = await req()
      .get(`${v1.persons.ROUTES.list}?search=hoper&page=1&pageSize=10`)
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const fuzzyNameSearch = v1.persons.personListSchema.parse(
      fuzzyNameSearchRes.body,
    );
    expect(
      fuzzyNameSearch.items.some((person) => person.id === created.id),
    ).toBe(true);

    const documentSearchRes = await req()
      .get(`${v1.persons.ROUTES.list}?search=B7654321&page=1&pageSize=10`)
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const documentSearch = v1.persons.personListSchema.parse(
      documentSearchRes.body,
    );
    expect(
      documentSearch.items.some((person) => person.id === created.id),
    ).toBe(true);

    const fuzzyDocumentSearchRes = await req()
      .get(`${v1.persons.ROUTES.list}?search=Bucuretsi&page=1&pageSize=10`)
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const fuzzyDocumentSearch = v1.persons.personListSchema.parse(
      fuzzyDocumentSearchRes.body,
    );
    expect(
      fuzzyDocumentSearch.items.some((person) => person.id === created.id),
    ).toBe(true);

    const getRes = await req()
      .get(v1.persons.ROUTES.get(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(getRes.status).toBe(200);
    const fetched = v1.persons.personSchema.parse(getRes.body);
    expect(fetched.id).toBe(created.id);
    expect(fetched.documents).toHaveLength(2);

    const newPhone = uniquePhone();
    createdPersonPhones.push(newPhone);
    const updateRes = await req()
      .patch(v1.persons.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        phone: newPhone,
        addressLine1: "  1 Test Street ",
      });
    const updated = v1.persons.personSchema.parse(updateRes.body);

    expect(updateRes.status).toBe(200);
    expect(updated.phone).toBe(newPhone);
    expect(updated.addressLine1).toBe("1 Test Street");

    auditEvents = await listAuditEvents(created.id, session.accessToken);
    expect(
      auditEvents.find((event) => event.type === "PERSON_UPDATED")?.changes,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "phone", newValue: newPhone }),
        expect.objectContaining({
          field: "addressLine1",
          newValue: "1 Test Street",
        }),
      ]),
    );

    const deleteDocumentRes = await req()
      .delete(v1.persons.ROUTES.documents.delete(created.id, driverLicense.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(deleteDocumentRes.status).toBe(204);

    const getDeletedDocumentRes = await req()
      .get(v1.persons.ROUTES.documents.get(created.id, driverLicense.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(getDeletedDocumentRes.status).toBe(404);

    const recreatedDriverLicenseRes = await req()
      .post(v1.persons.ROUTES.documents.create(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "driverLicense",
        number: "B7654322",
        issuingCountryCode: "RO",
      });
    expect(recreatedDriverLicenseRes.status).toBe(201);
    const recreatedDriverLicense = v1.persons.personDocumentSchema.parse(
      recreatedDriverLicenseRes.body,
    );

    const replaceDocumentRes = await req()
      .post(
        v1.persons.ROUTES.documents.replace(
          created.id,
          recreatedDriverLicense.id,
        ),
      )
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "driverLicense",
        number: "B7654323",
        issuingCountryCode: "RO",
        expiresOn: "2033-05-20",
        status: "verified",
        notes: "Replacement copy collected.",
      });
    const replacementDocument = v1.persons.personDocumentSchema.parse(
      replaceDocumentRes.body,
    );

    expect(replaceDocumentRes.status).toBe(201);
    expect(replacementDocument.id).not.toBe(recreatedDriverLicense.id);
    expect(replacementDocument.type).toBe("driverLicense");
    expect(replacementDocument.status).toBe("verified");

    const getReplacedOldDocumentRes = await req()
      .get(
        v1.persons.ROUTES.documents.get(created.id, recreatedDriverLicense.id),
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(getReplacedOldDocumentRes.status).toBe(404);

    auditEvents = await listAuditEvents(created.id, session.accessToken);
    expect(auditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "PERSON_DOCUMENT_CREATED",
        "PERSON_DOCUMENT_UPDATED",
        "PERSON_DOCUMENT_DELETED",
        "PERSON_DOCUMENT_REPLACED",
      ]),
    );
    const replacementEvent = auditEvents.find(
      (event) => event.type === "PERSON_DOCUMENT_REPLACED",
    );
    expect(replacementEvent?.document?.id).toBe(replacementDocument.id);
    expect(replacementEvent?.replacement?.oldDocument.id).toBe(
      recreatedDriverLicense.id,
    );
    expect(replacementEvent?.replacement?.newDocument.id).toBe(
      replacementDocument.id,
    );
    expect(replacementEvent?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "document.notes",
          oldValue: null,
          newValue: "Replacement copy collected.",
        }),
      ]),
    );
    expectAuditPayloadToOmit(auditEvents, [
      "123456",
      "1900228123450",
      "B7654321",
      "B7654322",
      "B7654323",
    ]);

    const deleteRes = await req()
      .delete(v1.persons.ROUTES.delete(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(deleteRes.status).toBe(204);

    const deletedAudit = await prisma.auditEvent.findFirst({
      where: {
        targetType: "person",
        targetId: created.id,
        type: "PERSON_DELETED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(deletedAudit).toEqual(
      expect.objectContaining({
        userId: session.userId,
        targetType: "person",
        targetId: created.id,
      }),
    );
    expectAuditPayloadToOmit(deletedAudit?.meta, [
      "123456",
      "1900228123450",
      "B7654321",
      "B7654322",
      "B7654323",
      "Replacement copy collected.",
    ]);

    const getDeletedRes = await req()
      .get(v1.persons.ROUTES.get(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(getDeletedRes.status).toBe(404);

    const hiddenListRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=${encodeURIComponent(input.email)}`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const hiddenList = v1.persons.personListSchema.parse(hiddenListRes.body);
    expect(hiddenList.items.some((person) => person.id === created.id)).toBe(
      false,
    );

    const deletedListRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?includeDeleted=true&search=${encodeURIComponent(input.email)}`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const deletedList = v1.persons.personListSchema.parse(deletedListRes.body);
    const deleted = deletedList.items.find(
      (person) => person.id === created.id,
    );

    expect(deleted).toBeDefined();
    expect(deleted?.deletedAt).not.toBeNull();
  });

  it("lets admins manage private document photo slots", async () => {
    s3Objects.clear();
    presignedPutKeys.length = 0;
    fakeS3.send.mockClear();
    fakePresigner.getSignedUrl.mockClear();

    const admin = await freshSession(["ADMIN"]);
    const user = await freshSession(["USER"]);
    const createRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(personInput());
    const person = v1.persons.personSchema.parse(createRes.body);
    const document = person.documents[0];

    const frontRoute = v1.persons.ROUTES.documents.photos.upsert(
      person.id,
      document.id,
      "front",
    );

    const unauthenticatedRes = await req()
      .put(frontRoute)
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    expect(unauthenticatedRes.status).toBe(401);

    const nonAdminRes = await req()
      .put(frontRoute)
      .set("Cookie", [`access_token=${user.accessToken}`])
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    expect(nonAdminRes.status).toBe(403);

    const missingCsrfRes = await request(server())
      .put(frontRoute)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    expect(missingCsrfRes.status).toBe(403);

    const invalidTypeRes = await req()
      .put(frontRoute)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("text"), {
        filename: "front.txt",
        contentType: "text/plain",
      });
    expect(invalidTypeRes.status).toBe(400);

    const oversizedRes = await req()
      .put(frontRoute)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.alloc(65), {
        filename: "large.jpg",
        contentType: "image/jpeg",
      });
    expect(oversizedRes.status).toBe(413);

    const invalidSlotRes = await req()
      .put(`/v1/persons/${person.id}/documents/${document.id}/photos/portrait`)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    expect(invalidSlotRes.status).toBe(400);

    const missingDocumentRes = await req()
      .put(
        v1.persons.ROUTES.documents.photos.upsert(
          person.id,
          "missing-document",
          "front",
        ),
      )
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    expect(missingDocumentRes.status).toBe(404);

    const uploadRes = await req()
      .put(frontRoute)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("front-image"), {
        filename: "front.jpg",
        contentType: "image/jpeg",
      });
    const uploaded = v1.persons.personDocumentPhotoSchema.parse(uploadRes.body);

    expect(uploadRes.status).toBe(200);
    expect(uploaded.personDocumentId).toBe(document.id);
    expect(uploaded.slot).toBe("front");
    expect(uploaded.contentType).toBe("image/jpeg");
    expect(uploaded.contentUrl).toBe(
      v1.persons.ROUTES.documents.photos.content(
        person.id,
        document.id,
        "front",
      ),
    );
    expect(s3Objects.size).toBe(1);

    const listRes = await req()
      .get(v1.persons.ROUTES.documents.photos.list(person.id, document.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    const photos = v1.persons.personDocumentPhotoListSchema.parse(listRes.body);
    expect(listRes.status).toBe(200);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.id).toBe(uploaded.id);

    const unauthenticatedContentRes = await req().get(uploaded.contentUrl);
    expect(unauthenticatedContentRes.status).toBe(401);

    const nonAdminContentRes = await req()
      .get(uploaded.contentUrl)
      .set("Cookie", [`access_token=${user.accessToken}`]);
    expect(nonAdminContentRes.status).toBe(403);

    const contentRes = await req()
      .get(uploaded.contentUrl)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.from(contentRes.body).toString()).toBe("front-image");

    const replaceRes = await req()
      .put(frontRoute)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("replacement"), {
        filename: "front.png",
        contentType: "image/png",
      });
    const replaced = v1.persons.personDocumentPhotoSchema.parse(
      replaceRes.body,
    );

    expect(replaceRes.status).toBe(200);
    expect(replaced.id).not.toBe(uploaded.id);
    expect(replaced.contentType).toBe("image/png");
    expect(s3Objects.size).toBe(1);

    const replacedContentRes = await req()
      .get(replaced.contentUrl)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(replacedContentRes.status).toBe(200);
    expect(Buffer.from(replacedContentRes.body).toString()).toBe("replacement");

    const directBuffer = Buffer.from("direct-put");
    const directChecksum = createHash("sha256")
      .update(directBuffer)
      .digest("hex");
    const uploadUrlRes = await req()
      .post(
        v1.persons.ROUTES.documents.photos.createUploadUrl(
          person.id,
          document.id,
          "front",
        ),
      )
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        contentType: "image/webp",
        byteSize: directBuffer.length,
        checksumSha256: directChecksum,
      });
    const uploadUrl = v1.persons.personDocumentPhotoUploadUrlSchema.parse(
      uploadUrlRes.body,
    );
    expect(uploadUrlRes.status).toBe(201);
    expect(uploadUrl.method).toBe("PUT");
    expect(uploadUrl.uploadUrl).toContain("https://s3.test/upload/");
    expect(uploadUrl.uploadUrl).toContain(
      "X-Amz-SignedHeaders=host%3Bx-amz-checksum-sha256",
    );
    expect(uploadUrl.headers).toMatchObject({
      "Content-Type": "image/webp",
      "x-amz-checksum-sha256": Buffer.from(directChecksum, "hex").toString(
        "base64",
      ),
    });

    const directStorageKey = presignedPutKeys.at(-1);
    expect(directStorageKey).toBeDefined();
    s3Objects.set(directStorageKey ?? "", {
      body: directBuffer,
      contentType: "image/webp",
    });

    const completeUploadRes = await req()
      .post(
        v1.persons.ROUTES.documents.photos.completeUpload(
          person.id,
          document.id,
          "front",
        ),
      )
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ uploadToken: uploadUrl.uploadToken });
    const directlyUploaded = v1.persons.personDocumentPhotoSchema.parse(
      completeUploadRes.body,
    );

    expect(completeUploadRes.status).toBe(201);
    expect(directlyUploaded.id).not.toBe(replaced.id);
    expect(directlyUploaded.contentType).toBe("image/webp");
    expect(directlyUploaded.byteSize).toBe(directBuffer.length);
    expect(directlyUploaded.checksumSha256).toBe(directChecksum);
    expect(s3Objects.size).toBe(1);

    const directContentRes = await req()
      .get(directlyUploaded.contentUrl)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(directContentRes.status).toBe(200);
    expect(Buffer.from(directContentRes.body).toString()).toBe("direct-put");

    const deleteRes = await req()
      .delete(
        v1.persons.ROUTES.documents.photos.delete(
          person.id,
          document.id,
          "front",
        ),
      )
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(deleteRes.status).toBe(204);
    expect(s3Objects.size).toBe(0);

    const emptyListRes = await req()
      .get(v1.persons.ROUTES.documents.photos.list(person.id, document.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(
      v1.persons.personDocumentPhotoListSchema.parse(emptyListRes.body),
    ).toEqual([]);

    const deletedContentRes = await req()
      .get(replaced.contentUrl)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(deletedContentRes.status).toBe(404);
  });

  it("claims draft document photo uploads during person creation", async () => {
    const admin = await freshSession(["ADMIN"]);
    const draftBuffer = Buffer.from("draft-put");
    const draftChecksum = createHash("sha256")
      .update(draftBuffer)
      .digest("hex");
    const uploadUrlRes = await req()
      .post(v1.persons.ROUTES.documents.photos.createDraftUploadUrl)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        contentType: "image/png",
        byteSize: draftBuffer.length,
        checksumSha256: draftChecksum,
      });
    const uploadUrl = v1.persons.personDocumentPhotoUploadUrlSchema.parse(
      uploadUrlRes.body,
    );

    expect(uploadUrlRes.status).toBe(201);
    const draftStorageKey = presignedPutKeys.at(-1);
    expect(draftStorageKey).toBeDefined();
    s3Objects.set(draftStorageKey ?? "", {
      body: draftBuffer,
      contentType: "image/png",
    });

    const input = personInput({
      documents: [
        {
          type: "nationalId",
          series: "DR",
          number: "777777",

          issuingCountryCode: "RO",
          issuedBy: "SPCLEP Bucuresti",
          issuedOn: "2024-01-15",
          expiresOn: "2030-01-31",
          status: "verified",
          photos: { front: uploadUrl.uploadToken },
        },
      ],
    });

    const createRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(input);
    const created = v1.persons.personSchema.parse(createRes.body);

    expect(createRes.status).toBe(201);
    const document = created.documents[0];
    if (!document) {
      throw new Error("Expected created person to include a document");
    }

    const photosRes = await req()
      .get(v1.persons.ROUTES.documents.photos.list(created.id, document.id))
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    const photos = v1.persons.personDocumentPhotoListSchema.parse(
      photosRes.body,
    );
    expect(photosRes.status).toBe(200);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      personDocumentId: document.id,
      slot: "front",
      contentType: "image/png",
      byteSize: draftBuffer.length,
      checksumSha256: draftChecksum,
    });

    const draft = await prisma.draftUpload.findUnique({
      where: { storageKey: draftStorageKey ?? "" },
    });
    expect(draft?.claimedAt).toBeInstanceOf(Date);
    expect(s3Objects.size).toBe(1);
  });

  async function uploadPersonDraft(
    session: IssuedSession,
    contentType: "image/png" | "application/pdf" = "image/png",
  ) {
    const buffer = Buffer.from(
      contentType === "application/pdf" ? "%PDF-proof" : "document-image",
    );
    const response = await req()
      .post(v1.persons.ROUTES.documents.photos.createDraftUploadUrl)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        contentType,
        ...(contentType === "application/pdf"
          ? { documentType: "proofOfAddress" }
          : {}),
        byteSize: buffer.length,
        checksumSha256: createHash("sha256").update(buffer).digest("hex"),
      });
    expect(response.status).toBe(201);
    const upload = v1.persons.personDocumentPhotoUploadUrlSchema.parse(
      response.body,
    );
    const storageKey = presignedPutKeys.at(-1);
    if (!storageKey) throw new Error("Missing draft storage key");
    s3Objects.set(storageKey, { body: buffer, contentType });
    return { ...upload, storageKey };
  }

  it("saves foreign supplementary documents and reviewed licence categories with an audit trail", async () => {
    const admin = await freshSession(["ADMIN"]);
    const upload = await uploadPersonDraft(admin);
    const categories = [
      {
        category: "AM" as const,
        issuedOn: "2022-01-01",
        expiresOn: "2032-01-01",
        restrictions: "01",
      },
    ];
    const response = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documentWorkflow: "foreign",
          documents: [
            {
              type: "passport",
              status: "verified",
              photos: { front: upload.uploadToken },
            },
            { type: "visa", status: "verified", number: "V123" },
            { type: "residencePermit", status: "verified", number: "R123" },
            {
              type: "driverLicense",
              status: "verified",
              licenseCategories: categories,
            },
          ],
        }),
      );
    expect(response.status).toBe(201);
    const person = v1.persons.personSchema.parse(response.body);
    expect(person.documents.map((document) => document.type).sort()).toEqual([
      "driverLicense",
      "passport",
      "residencePermit",
      "visa",
    ]);
    const licence = person.documents.find(
      (document) => document.type === "driverLicense",
    );
    const passport = person.documents.find(
      (document) => document.type === "passport",
    );
    if (!licence || !passport)
      throw new Error("Expected passport and driving licence");
    expect(licence.licenseCategories).toEqual(categories);

    const update = await req()
      .patch(v1.persons.ROUTES.documents.update(person.id, licence.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({
        licenseCategories: [
          { category: "A1", issuedOn: "2023-01-01", expiresOn: "2033-01-01" },
        ],
      });
    expect(update.status).toBe(200);
    expect(
      v1.persons.personDocumentSchema.parse(update.body).licenseCategories?.[0]
        ?.category,
    ).toBe("A1");
    const invalidMetadata = await req()
      .patch(v1.persons.ROUTES.documents.update(person.id, passport.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ licenseCategories: categories });
    expect(invalidMetadata.status).toBe(400);
    const duplicateVisa = await req()
      .post(v1.persons.ROUTES.documents.create(person.id))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ type: "visa" });
    expect(duplicateVisa.status).toBe(409);
    const audit = await listAuditEvents(person.id, admin.accessToken);
    expect(
      audit.find((event) => event.type === "PERSON_DOCUMENT_UPDATED")?.changes,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "document.licenseCategories",
          oldValue: JSON.stringify(categories),
        }),
      ]),
    );
  });

  it("requires electronic ID front, back and proof and accepts private proof PDFs including replacements", async () => {
    const admin = await freshSession(["ADMIN"]);
    const front = await uploadPersonDraft(admin);
    const back = await uploadPersonDraft(admin);
    const proof = await uploadPersonDraft(admin, "application/pdf");
    const nationalId: v1.persons.CreatePersonNestedDocumentInput = {
      type: "nationalId",
      nationalIdFormat: "electronic",
      issuingCountryCode: "RO",
      status: "verified",
      photos: { front: front.uploadToken, back: back.uploadToken },
    };
    const missing = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documentWorkflow: "romanianElectronic",
          documents: [nationalId],
        }),
      );
    expect(missing.status).toBe(400);
    const wrongPdf = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documents: [
            {
              type: "nationalId",
              status: "verified",
              photos: { front: proof.uploadToken },
            },
          ],
        }),
      );
    expect(wrongPdf.status).toBe(400);
    const response = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documentWorkflow: "romanianElectronic",
          documents: [
            nationalId,
            {
              type: "proofOfAddress",
              status: "verified",
              photos: { front: proof.uploadToken },
            },
          ],
        }),
      );
    expect(response.status).toBe(201);
    const person = v1.persons.personSchema.parse(response.body);
    const id = person.documents.find(
      (document) => document.type === "nationalId",
    );
    const address = person.documents.find(
      (document) => document.type === "proofOfAddress",
    );
    if (!id || !address)
      throw new Error("Expected electronic ID and proof of address");
    expect(id.nationalIdFormat).toBe("electronic");
    const contentPath = v1.persons.ROUTES.documents.photos.content(
      person.id,
      address.id,
      "front",
    );
    const content = await req()
      .get(contentPath)
      .set("Cookie", [`access_token=${admin.accessToken}`]);
    expect(content.status).toBe(200);
    expect(content.headers["content-type"]).toContain("application/pdf");
    expect((await req().get(contentPath)).status).toBe(401);
    const replace = await req()
      .put(
        v1.persons.ROUTES.documents.photos.upsert(
          person.id,
          address.id,
          "front",
        ),
      )
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("%PDF-replacement"), {
        filename: "proof.pdf",
        contentType: "application/pdf",
      });
    expect(replace.status).toBe(200);
    expect(
      v1.persons.personDocumentPhotoSchema.parse(replace.body).contentType,
    ).toBe("application/pdf");
    const wrongType = await req()
      .put(v1.persons.ROUTES.documents.photos.upsert(person.id, id.id, "front"))
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .attach("file", Buffer.from("%PDF-wrong"), {
        filename: "id.pdf",
        contentType: "application/pdf",
      });
    expect(wrongType.status).toBe(400);
  });

  it("retains uploaded drafts for review while enforcing owner, expiry and single-use claims", async () => {
    const admin = await freshSession(["ADMIN"]);
    const anotherAdmin = await freshSession(["ADMIN"]);
    const upload = await uploadPersonDraft(admin);
    expect(
      Date.parse(upload.uploadTokenExpiresAt ?? "") -
        Date.parse(upload.expiresAt),
    ).toBeGreaterThan(80_000_000);
    const draft = await prisma.draftUpload.findUniqueOrThrow({
      where: { storageKey: upload.storageKey },
    });
    expect(draft.expiresAt.toISOString()).toBe(upload.uploadTokenExpiresAt);
    const documents: v1.persons.CreatePersonNestedDocumentInput[] = [
      {
        type: "passport",
        status: "verified",
        photos: { front: upload.uploadToken },
      },
    ];
    const wrongOwner = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${anotherAdmin.accessToken}`])
      .send(personInput({ documents }));
    expect(wrongOwner.status).toBe(400);
    const create = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(personInput({ documents }));
    expect(create.status).toBe(201);
    const reused = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(personInput({ documents }));
    expect(reused.status).toBe(400);
    expect(s3Objects.has(upload.storageKey)).toBe(true);

    const expired = await uploadPersonDraft(admin);
    await prisma.draftUpload.update({
      where: { storageKey: expired.storageKey },
      data: { expiresAt: new Date(0) },
    });
    const expiredCreate = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documents: [
            {
              type: "passport",
              status: "verified",
              photos: { front: expired.uploadToken },
            },
          ],
        }),
      );
    expect(expiredCreate.status).toBe(400);
  });

  it("extracts only authenticated admin-owned drafts with CSRF protection and never changes saved records", async () => {
    fakePersonExtraction.analyze.mockClear();
    const admin = await freshSession(["ADMIN"]);
    const otherAdmin = await freshSession(["ADMIN"]);
    const user = await freshSession(["USER"]);
    const upload = await uploadPersonDraft(admin);
    const input = {
      documentType: "nationalId",
      nationalIdFormat: "classic",
      photos: { front: upload.uploadToken },
    };
    expect(
      (await req().post(v1.persons.ROUTES.documents.extract).send(input))
        .status,
    ).toBe(401);
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${user.accessToken}`])
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server())
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${admin.accessToken}`])
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${otherAdmin.accessToken}`])
          .send(input)
      ).status,
    ).toBe(400);
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${admin.accessToken}`])
          .send({ ...input, photos: {} })
      ).status,
    ).toBe(400);
    expect(fakePersonExtraction.analyze).not.toHaveBeenCalled();

    const analyzed = await req()
      .post(v1.persons.ROUTES.documents.extract)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(input);
    expect(analyzed.status).toBe(200);
    const result = v1.persons.personDocumentExtractionSchema.parse(
      analyzed.body,
    );
    const draft = await prisma.draftUpload.findUniqueOrThrow({
      where: { storageKey: upload.storageKey },
    });
    expect(result).toMatchObject({
      documentType: "nationalId",
      sourceUploadIds: [draft.id],
      reviewRequired: true,
      suggestions: [
        {
          target: "person",
          field: "firstName",
          value: "Ștefan",
          sourceSlot: "front",
          needsReview: false,
        },
      ],
    });
    expect(draft.claimedAt).toBeNull();
    expect(fakePersonExtraction.analyze).toHaveBeenCalledTimes(1);
    const create = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(
        personInput({
          documents: [
            {
              type: "nationalId",
              status: "verified",
              photos: { front: upload.uploadToken },
            },
          ],
        }),
      );
    expect(create.status).toBe(201);
    expect(v1.persons.personSchema.parse(create.body).firstName).toBe("Ada");
    const replay = await req()
      .post(v1.persons.ROUTES.documents.extract)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send(input);
    expect(replay.status).toBe(400);
    expect(fakePersonExtraction.analyze).toHaveBeenCalledTimes(1);
  });

  it("rejects extraction for MIME, actual checksum, expired, and cleanup-owned draft mismatches before the provider", async () => {
    fakePersonExtraction.analyze.mockClear();
    const admin = await freshSession(["ADMIN"]);
    const pdf = await uploadPersonDraft(admin, "application/pdf");
    const wrongType = await req()
      .post(v1.persons.ROUTES.documents.extract)
      .set("Cookie", [`access_token=${admin.accessToken}`])
      .send({ documentType: "passport", photos: { front: pdf.uploadToken } });
    expect(wrongType.status).toBe(400);
    const corrupt = await uploadPersonDraft(admin);
    const object = s3Objects.get(corrupt.storageKey);
    if (!object) throw new Error("Expected stored draft object");
    s3Objects.set(corrupt.storageKey, {
      ...object,
      body: Buffer.alloc(object.body.length),
    });
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${admin.accessToken}`])
          .send({
            documentType: "passport",
            photos: { front: corrupt.uploadToken },
          })
      ).status,
    ).toBe(400);
    const expired = await uploadPersonDraft(admin);
    await prisma.draftUpload.update({
      where: { storageKey: expired.storageKey },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${admin.accessToken}`])
          .send({
            documentType: "passport",
            photos: { front: expired.uploadToken },
          })
      ).status,
    ).toBe(400);
    const cleanup = await uploadPersonDraft(admin);
    await prisma.draftUpload.update({
      where: { storageKey: cleanup.storageKey },
      data: { cleanupStartedAt: new Date() },
    });
    expect(
      (
        await req()
          .post(v1.persons.ROUTES.documents.extract)
          .set("Cookie", [`access_token=${admin.accessToken}`])
          .send({
            documentType: "passport",
            photos: { front: cleanup.uploadToken },
          })
      ).status,
    ).toBe(400);
    expect(fakePersonExtraction.analyze).not.toHaveBeenCalled();
  });

  it("returns 409 for duplicate email or phone", async () => {
    const session = await freshSession(["ADMIN"]);
    const input = personInput();

    const firstRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(input);
    expect(firstRes.status).toBe(201);

    const duplicateEmail = personInput({ email: input.email });
    const duplicateEmailRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(duplicateEmail);
    expect(duplicateEmailRes.status).toBe(409);
    expect(duplicateEmailRes.body).toMatchObject({
      error: {
        code: "PERSON_EMAIL_CONFLICT",
        message: "Email already exists.",
        details: { field: "email" },
      },
    });

    const duplicatePhone = personInput({ phone: input.phone });
    const duplicatePhoneRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(duplicatePhone);
    expect(duplicatePhoneRes.status).toBe(409);
    expect(duplicatePhoneRes.body).toMatchObject({
      error: {
        code: "PERSON_PHONE_CONFLICT",
        message: "Phone already exists.",
        details: { field: "phone" },
      },
    });
  });

  it("sorts persons by requested list order", async () => {
    const session = await freshSession(["ADMIN"]);
    const alphaInput = personInput({
      firstName: "Sort",
      lastName: "Alpha",
      countryCode: "XQ",
      notes: "SORT-SCOPE",
    });
    const zuluInput = personInput({
      firstName: "Sort",
      lastName: "Zulu",
      countryCode: "XQ",
      notes: "SORT-SCOPE",
    });

    const alpha = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(alphaInput)
      ).body,
    );
    const zulu = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(zuluInput)
      ).body,
    );

    const sortedListRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?countryCode=XQ&sort=nameDesc&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const sortedList = v1.persons.personListSchema.parse(sortedListRes.body);
    expect(sortedListRes.status).toBe(200);
    expect(
      sortedList.items
        .map((person) => person.id)
        .filter((id) => id === alpha.id || id === zulu.id),
    ).toEqual([zulu.id, alpha.id]);

    const sortedSearchRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=SORT-SCOPE&sort=nameAsc&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const sortedSearch = v1.persons.personListSchema.parse(
      sortedSearchRes.body,
    );
    expect(sortedSearchRes.status).toBe(200);
    expect(
      sortedSearch.items
        .map((person) => person.id)
        .filter((id) => id === alpha.id || id === zulu.id),
    ).toEqual([alpha.id, zulu.id]);
  });

  it("filters persons by record and document operations", async () => {
    const session = await freshSession(["ADMIN"]);
    const activeInput = personInput({
      firstName: "Filter",
      lastName: "Verified",
      countryCode: "RO",
      documents: [
        {
          type: "nationalId",
          number: "FILTER-VERIFIED",
          issuingCountryCode: "RO",
          expiresOn: dateOnlyDaysFromNow(10),
          status: "verified",
        },
      ],
    });
    const rejectedInput = personInput({
      firstName: "Filter",
      lastName: "Rejected",
      countryCode: "US",
      documents: [
        {
          type: "passport",
          number: "FILTER-REJECTED",
          issuingCountryCode: "US",
          expiresOn: "2000-01-01",
          status: "rejected",
        },
      ],
    });
    const missingInput = personInput({
      firstName: "Filter",
      lastName: "Missing",
      documents: [],
    });
    const deletedInput = personInput({
      firstName: "Filter",
      lastName: "Deleted",
      documents: [
        {
          type: "nationalId",
          number: "FILTER-DELETED",
          status: "unverified",
        },
      ],
    });
    const sameDocumentInput = personInput({
      firstName: "Filter",
      lastName: "SameDocument",
      documents: [
        {
          type: "nationalId",
          number: "FILTER-SAME-ID",
          status: "verified",
        },
      ],
    });

    const active = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(activeInput)
      ).body,
    );
    const rejected = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(rejectedInput)
      ).body,
    );
    const missing = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(missingInput)
      ).body,
    );
    const deleted = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(deletedInput)
      ).body,
    );
    const sameDocument = v1.persons.personSchema.parse(
      (
        await req()
          .post(v1.persons.ROUTES.create)
          .set("Cookie", [`access_token=${session.accessToken}`])
          .send(sameDocumentInput)
      ).body,
    );

    const sameDocumentLicenseRes = await req()
      .post(v1.persons.ROUTES.documents.create(sameDocument.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        type: "driverLicense",
        number: "FILTER-SAME-LICENSE",
        status: "rejected",
      });
    expect(sameDocumentLicenseRes.status).toBe(201);

    const deleteRes = await req()
      .delete(v1.persons.ROUTES.delete(deleted.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(deleteRes.status).toBe(204);

    const verifiedNationalIdRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-VERIFIED&documentType=nationalId&documentStatus=verified&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const verifiedNationalId = v1.persons.personListSchema.parse(
      verifiedNationalIdRes.body,
    );
    expect(verifiedNationalId.items.map((person) => person.id)).toContain(
      active.id,
    );

    const sameDocumentPredicateRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-SAME&documentType=driverLicense&documentStatus=verified&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const sameDocumentPredicate = v1.persons.personListSchema.parse(
      sameDocumentPredicateRes.body,
    );
    expect(
      sameDocumentPredicate.items.map((person) => person.id),
    ).not.toContain(sameDocument.id);

    const countryRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-REJECTED&countryCode=US&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const country = v1.persons.personListSchema.parse(countryRes.body);
    expect(country.items.map((person) => person.id)).toContain(rejected.id);
    expect(country.items.map((person) => person.id)).not.toContain(active.id);

    const issuingCountryRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-REJECTED&documentIssuingCountryCode=US&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const issuingCountry = v1.persons.personListSchema.parse(
      issuingCountryRes.body,
    );
    expect(issuingCountry.items.map((person) => person.id)).toContain(
      rejected.id,
    );
    expect(issuingCountry.items.map((person) => person.id)).not.toContain(
      active.id,
    );

    const expiredRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-REJECTED&documentExpiry=expired&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const expired = v1.persons.personListSchema.parse(expiredRes.body);
    expect(expired.items.map((person) => person.id)).toContain(rejected.id);
    expect(expired.items.map((person) => person.id)).not.toContain(active.id);

    const expiresSoonRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=FILTER-VERIFIED&documentExpiry=expiresSoon&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const expiresSoon = v1.persons.personListSchema.parse(expiresSoonRes.body);
    expect(expiresSoon.items.map((person) => person.id)).toContain(active.id);

    const missingRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=${encodeURIComponent(missingInput.email)}&documentExpiry=missing&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const missingDocuments = v1.persons.personListSchema.parse(missingRes.body);
    expect(missingDocuments.items.map((person) => person.id)).toContain(
      missing.id,
    );
    expect(missingDocuments.items.map((person) => person.id)).not.toContain(
      active.id,
    );

    const deletedRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?search=${encodeURIComponent(deletedInput.email)}&recordStatus=deleted&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const deletedList = v1.persons.personListSchema.parse(deletedRes.body);
    expect(deletedList.items.map((person) => person.id)).toContain(deleted.id);
    expect(deletedList.items.map((person) => person.id)).not.toContain(
      active.id,
    );

    const includeDeletedRes = await req()
      .get(
        `${v1.persons.ROUTES.list}?includeDeleted=true&search=${encodeURIComponent(deletedInput.email)}&page=1&pageSize=50`,
      )
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const includeDeleted = v1.persons.personListSchema.parse(
      includeDeletedRes.body,
    );
    expect(includeDeleted.items.map((person) => person.id)).toContain(
      deleted.id,
    );
  });

  it("rejects invalid payloads", async () => {
    const session = await freshSession(["ADMIN"]);

    const res = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        email: "person-invalid@example.com",
        phone: "0712345678",
        firstName: "Ada",
        lastName: "Lovelace",
      });

    expect(res.status).toBe(400);

    const duplicateDocumentTypeRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(
        personInput({
          documents: [
            { type: "nationalId", status: "unverified" },
            { type: "nationalId", status: "unverified" },
          ],
        }),
      );

    expect(duplicateDocumentTypeRes.status).toBe(400);

    const duplicateIdentityDocumentRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(
        personInput({
          documents: [
            { type: "nationalId", status: "unverified" },
            { type: "passport", status: "unverified" },
          ],
        }),
      );

    expect(duplicateIdentityDocumentRes.status).toBe(400);
  });
});
