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
      documentType: "passport",
      documentNumber: "P1234567",
      documentIssuingCountryCode: "RO",
      documentExpiresOn: "2030-01-31",
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
    expect(created.documentStatus).toBe("unverified");
    expect(created.deletedAt).toBeNull();

    const listRes = await req()
      .get(`${v1.persons.ROUTES.list}?search=hopper&page=1&pageSize=10`)
      .set("Cookie", [`access_token=${session.accessToken}`]);
    const list = v1.persons.personListSchema.parse(listRes.body);

    expect(listRes.status).toBe(200);
    expect(list.items.some((person) => person.id === created.id)).toBe(true);

    const getRes = await req()
      .get(v1.persons.ROUTES.get(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`]);
    expect(getRes.status).toBe(200);
    expect(v1.persons.personSchema.parse(getRes.body).id).toBe(created.id);

    const newPhone = uniquePhone();
    createdPersonPhones.push(newPhone);
    const updateRes = await req()
      .patch(v1.persons.ROUTES.update(created.id))
      .set("Cookie", [`access_token=${session.accessToken}`])
      .send({
        phone: newPhone,
        documentStatus: "verified",
        addressLine1: "  1 Test Street ",
      });
    const updated = v1.persons.personSchema.parse(updateRes.body);

    expect(updateRes.status).toBe(200);
    expect(updated.phone).toBe(newPhone);
    expect(updated.documentStatus).toBe("verified");
    expect(updated.addressLine1).toBe("1 Test Street");

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
  });
});
