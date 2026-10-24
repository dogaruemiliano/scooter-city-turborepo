import { AccessService } from "./access.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { MailerService } from "../mailer/mailer.service";
import type { Env } from "../config/env";

describe("user directory role pagination", () => {
  it("fills a page across role groups, keeping email order within each group", async () => {
    const count = jest.fn();
    for (const size of [2, 105, 10]) count.mockResolvedValueOnce(size);
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AccessService(
      { user: { count, findMany } } as unknown as PrismaService,
      {} as AuditService,
      {} as MailerService,
      {} as Env,
    );
    const result = await service.listUsers("alex", 100);
    expect(result.total).toBe(117);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(
      findMany.mock.calls.map(([query]) => [query.skip, query.take]),
    ).toEqual([
      [98, 7],
      [0, 10],
    ]);
    for (const [query] of findMany.mock.calls) {
      expect(query.orderBy).toEqual({ email: "asc" });
      expect(query.where.AND[0].OR[0]).toEqual({
        email: { contains: "alex", mode: "insensitive" },
      });
    }
    expect(count).toHaveBeenCalledTimes(3);
    expect(count.mock.calls[2][0].where.AND[1]).toEqual({
      isSuperAdmin: false,
      AND: [
        {
          roleMemberships: {
            some: { role: { slug: "mechanic", archivedAt: null } },
          },
        },
      ],
      NOT: {
        roleMemberships: {
          some: { role: { slug: "admin", archivedAt: null } },
        },
      },
    });
    expect(count.mock.calls[0][0].where.AND[1]).toEqual({ isSuperAdmin: true });
    expect(count.mock.calls[1][0].where.AND[1].AND[0]).toEqual({
      roleMemberships: { some: { role: { slug: "admin", archivedAt: null } } },
    });
  });
});
