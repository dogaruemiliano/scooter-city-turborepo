import type { Prisma } from "../generated/prisma/client";
import { AccessService } from "./access.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { MailerService } from "../mailer/mailer.service";
import type { Env } from "../config/env";

describe("user directory role pagination", () => {
  it("fills a page across role groups, keeping email order within each group", async () => {
    const count = jest.fn<Promise<number>, [Prisma.UserCountArgs]>();
    for (const size of [2, 105, 10]) count.mockResolvedValueOnce(size);
    const findMany = jest
      .fn<Promise<never[]>, [Prisma.UserFindManyArgs]>()
      .mockResolvedValue([]);
    const service = new AccessService(
      { user: { count, findMany } } as unknown as PrismaService,
      {} as AuditService,
      {} as MailerService,
      {} as Env,
    );
    const search = {
      OR: [
        { email: { contains: "alex", mode: "insensitive" } },
        { firstName: { contains: "alex", mode: "insensitive" } },
        { lastName: { contains: "alex", mode: "insensitive" } },
      ],
    };
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
      expect(query.where).toEqual({ AND: [search, expect.any(Object)] });
    }
    expect(count).toHaveBeenCalledTimes(3);
    expect(count).toHaveBeenNthCalledWith(3, {
      where: {
        AND: [
          search,
          {
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
          },
        ],
      },
    });
    expect(count).toHaveBeenNthCalledWith(1, {
      where: { AND: [search, { isSuperAdmin: true }] },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          search,
          {
            isSuperAdmin: false,
            AND: [
              {
                roleMemberships: {
                  some: { role: { slug: "admin", archivedAt: null } },
                },
              },
            ],
          },
        ],
      },
    });
  });
});
