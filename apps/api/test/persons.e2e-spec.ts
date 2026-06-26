/**
 * HTTP-level e2e tests for the admin-managed `/v1/persons` endpoints.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  accessToken: string;
  userId: string;
}

describe("Persons HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];
  const createdPersonEmails: string[] = [];
  const createdPersonPhones: string[] = [];
  let phoneSeq = 10_000_000;

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
    patch: (path: string) => RequestBuilder;
    delete: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (b: RequestBuilder) => b.set("x-requested-with", "fetch");
    return {
      get: (p) => tag(base.get(p)),
      post: (p) => tag(base.post(p)),
      patch: (p) => tag(base.patch(p)),
      delete: (p) => tag(base.delete(p)),
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);
  });

  afterAll(async () => {
    if (createdPersonEmails.length > 0 || createdPersonPhones.length > 0) {
      await prisma.person.deleteMany({
        where: {
          OR: [
            { email: { in: createdPersonEmails } },
            { phone: { in: createdPersonPhones } },
          ],
        },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
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
          cnp: "1900228123450",
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

  it("lets admins create, list, get, update, and soft-delete persons", async () => {
    const session = await freshSession(["ADMIN"]);
    const input = personInput({
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
      .send({ status: "verified" });
    const updatedDocument = v1.persons.personDocumentSchema.parse(
      updateDocumentRes.body,
    );
    expect(updateDocumentRes.status).toBe(200);
    expect(updatedDocument.status).toBe("verified");

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

    const deleteRes = await req()
      .delete(v1.persons.ROUTES.delete(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(deleteRes.status).toBe(204);

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

    const duplicatePhone = personInput({ phone: input.phone });
    const duplicatePhoneRes = await req()
      .post(v1.persons.ROUTES.create)
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send(duplicatePhone);
    expect(duplicatePhoneRes.status).toBe(409);
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
