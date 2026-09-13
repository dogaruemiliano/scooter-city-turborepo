import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDashboard } from "./dashboard-server";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cookies: vi.fn(),
  meFromApi: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.apiFetch } }));
vi.mock("@/lib/auth-server", () => ({ meFromApi: mocks.meFromApi }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

const user = { id: "admin-1", email: "admin@example.com", roles: ["ADMIN"] };
const companyBook = {
  id: "company-book",
  name: "Company",
  type: "COMPANY",
  functionalCurrency: "EUR",
  members: [],
};
const fleet: v1.maintenance.FleetMaintenanceDashboard = {
  totalScooters: 12,
  scootersWithOpenIssues: 3,
  scootersWithBlockingIssues: 1,
  scootersWithOverdueMaintenance: 2,
  scootersWithMaintenanceDueSoon: 4,
  requiresAttention: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.meFromApi.mockResolvedValue(user);
  mocks.cookies.mockResolvedValue({ toString: () => "session=abc" });
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
  mocks.notFound.mockImplementation(() => {
    throw new Error("not-found");
  });
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === v1.finance.ROUTES.books) return { items: [companyBook] };
    if (path.startsWith(v1.finance.ROUTES.accounts.balances))
      return { items: [account("bank", "BANK", 10_000)] };
    if (path.startsWith(v1.finance.ROUTES.operations.list))
      return { items: [] };
    if (path === v1.maintenance.ROUTES.dashboard) return fleet;
    throw new Error(`Unexpected path: ${path}`);
  });
});

describe("dashboard data", () => {
  it("redirects signed-out visitors before accessing administrative resources", async () => {
    mocks.meFromApi.mockResolvedValue(null);

    await expect(loadDashboard("en")).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/en/sign-in?next=%2Fen");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it.each([{ roles: [] }, { roles: ["SUPER_ADMIN"] }, { roles: ["USER"] }])(
    "only exposes account access when the current user lacks ADMIN ($roles)",
    async ({ roles }) => {
      const member = { ...user, roles };
      mocks.meFromApi.mockResolvedValue(member);

      await expect(loadDashboard("ro")).resolves.toEqual({
        user: member,
        overview: null,
      });
      expect(mocks.apiFetch).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    },
  );

  it("starts bounded company and fleet reads in parallel with the request cookies", async () => {
    const pending = new Promise<never>(() => {});
    mocks.apiFetch.mockReturnValue(pending);

    const result = await loadDashboard("en");

    expect(result.overview).toBeInstanceOf(Promise);
    expect(mocks.apiFetch.mock.calls.map(([path]) => path)).toEqual([
      v1.finance.ROUTES.books,
      `${v1.finance.ROUTES.accounts.balances}?bookType=COMPANY&includeInactive=true`,
      `${v1.finance.ROUTES.operations.list}?bookType=COMPANY&pageSize=4`,
      v1.maintenance.ROUTES.dashboard,
    ]);
    for (const call of mocks.apiFetch.mock.calls) {
      expect(call[2]).toEqual({
        headers: { cookie: "session=abc" },
        cache: "no-store",
      });
    }
  });

  it("totals company cash only and uses the company's actual currency", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ items: [companyBook] });
    mocks.apiFetch.mockResolvedValueOnce({
      items: [
        account("bank", "BANK", 10_000),
        account("cash", "CASH_REGISTER", -500),
        account("custody", "COMPANY_CASH_CUSTODY", 2_000),
        account("expense", "OPERATING_EXPENSE", 80_000),
        { ...account("private", "BANK", 900_000), bookId: "private-book" },
      ],
    });

    const { overview } = await loadDashboard("en");
    const data = await overview;

    expect(data?.cash?.totalMinor).toBe(11_500);
    expect(data?.cash?.currency).toBe("EUR");
    expect(data?.cash?.accounts.map((item) => item.accountId)).toEqual([
      "bank",
      "cash",
      "custody",
    ]);
    expect(data?.fleet).toEqual(fleet);
  });

  it("keeps available fleet data when books fail without inventing a currency or zero balances", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new ApiError(503, "Unavailable"));

    const { overview } = await loadDashboard("en");
    await expect(overview).resolves.toEqual({
      cash: null,
      operations: null,
      fleet,
    });
  });

  it("retains company money held in an inactive former associate's custody account", async () => {
    const defaultFetch = mocks.apiFetch.getMockImplementation()!;
    const accounts = [
      { isActive: true, balance: account("bank", "BANK", 10_000) },
      {
        isActive: false,
        balance: account(
          "former-associate-custody",
          "COMPANY_CASH_CUSTODY",
          2_500,
        ),
      },
    ];
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (!path.startsWith(v1.finance.ROUTES.accounts.balances)) {
        return defaultFetch(path);
      }

      // Match the API's default active-only filtering. Balance responses do not
      // include isActive, so omitted inactive money cannot be recovered locally.
      const query = new URLSearchParams(path.split("?")[1]);
      const includeInactive = query.get("includeInactive") === "true";
      return {
        items: accounts
          .filter((item) => includeInactive || item.isActive)
          .map((item) => item.balance),
      };
    });

    const { overview } = await loadDashboard("en");
    const data = await overview;

    expect(data?.cash?.totalMinor).toBe(12_500);
    expect(data?.cash?.accounts).toContainEqual(accounts[1]!.balance);
  });

  it("keeps company summaries when maintenance is unavailable", async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({ items: [companyBook] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(new ApiError(503, "Unavailable"));

    const { overview } = await loadDashboard("ro");
    await expect(overview).resolves.toMatchObject({
      cash: { accounts: [], totalMinor: 0, currency: "EUR" },
      operations: { items: [], currency: "EUR" },
      fleet: null,
    });
  });

  it.each([401, 403])(
    "propagates an API authorization failure (%i)",
    async (status) => {
      mocks.apiFetch.mockRejectedValueOnce(
        new ApiError(status, "Access denied"),
      );

      const { overview } = await loadDashboard("ro");
      await expect(overview).rejects.toThrow(
        status === 401 ? "redirect" : "not-found",
      );
      if (status === 401)
        expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?next=%2F");
      else expect(mocks.notFound).toHaveBeenCalledOnce();
    },
  );
});

function account(
  accountId: string,
  role: v1.finance.LedgerAccountRole,
  displayBalanceMinor: number,
): v1.finance.LedgerAccountBalance {
  return {
    accountId,
    bookId: companyBook.id,
    code: accountId,
    name: accountId,
    category: "ASSET",
    role,
    associateId: null,
    signedBalanceMinor: displayBalanceMinor,
    displayBalanceMinor,
    postingCount: 1,
    asOf: "2026-09-11T08:00:00.000Z",
  };
}
