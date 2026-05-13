/**
 * UsersService CRUD against the real Postgres test DB. Reuses the seed
 * users so we never have to think about ordering or cleanup of the rows
 * we touch — we operate on fresh emails per test.
 */
import { Test } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

describe("UsersService (e2e)", () => {
  let users: UsersService;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    users = app.get(UsersService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up only the rows we created, leave seed users intact.
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await prisma.$disconnect();
  });

  it("findById returns null for an unknown id", async () => {
    expect(await users.findById("user-does-not-exist")).toBeNull();
  });

  it("findByEmail returns the seeded credentials user", async () => {
    const user = await users.findByEmail("test-credentials@example.com");
    expect(user).not.toBeNull();
    expect(user?.id).toBe("seed-user-credentials");
    expect(user?.passwordHash).not.toBeNull();
  });

  it("findByPhone returns the seeded SMS user", async () => {
    const user = await users.findByPhone("+40700000001");
    expect(user?.email).toBe("test-sms@example.com");
  });

  it("createOne creates a row with cuid-generated id", async () => {
    const email = `pr4-test-${Date.now()}@example.com`;
    createdEmails.push(email);
    const user = await users.createOne({
      email,
      firstName: "Pr4",
      lastName: "Test",
    });
    expect(user.id).toMatch(/^[a-z0-9]{20,30}$/);
    expect(user.email).toBe(email);
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("deleteOne cascades the user out of the table", async () => {
    const email = `pr4-delete-${Date.now()}@example.com`;
    const created = await users.createOne({ email });
    await users.deleteOne(created.id);
    expect(await users.findById(created.id)).toBeNull();
  });
});
