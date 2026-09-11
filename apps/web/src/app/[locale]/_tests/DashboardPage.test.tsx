import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../page";

const mocks = vi.hoisted(() => ({ loadDashboard: vi.fn() }));

vi.mock("../_lib/dashboard-server", () => ({
  loadDashboard: mocks.loadDashboard,
}));
vi.mock("../_components/DashboardOverview", () => ({
  DashboardOverview: () => <section aria-label="Company overview" />,
  DashboardOverviewSkeleton: () => <p>Loading</p>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
}));

beforeEach(() => {
  mocks.loadDashboard.mockReset();
});

describe("dashboard page", () => {
  it.each(["en", "ro"] as const)(
    "gives members account access without any administrative actions (%s)",
    async (locale) => {
      mocks.loadDashboard.mockResolvedValue({
        user: { email: "member@example.com" },
        overview: null,
      });

      render(await DashboardPage({ params: Promise.resolve({ locale }) }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        messages[locale].dashboard.account.title,
      );
      expect(screen.getByText("member@example.com")).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: messages[locale].dashboard.account.settings,
        }),
      ).toHaveAttribute("href", "/account/settings");
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(
        screen.queryByRole("region", { name: "Company overview" }),
      ).not.toBeInTheDocument();
    },
  );

  it("gives admins direct links into the existing financial and fleet workflows", async () => {
    mocks.loadDashboard.mockResolvedValue({
      user: { email: "admin@example.com" },
      overview: Promise.resolve({ cash: null, fleet: null, operations: null }),
    });

    render(await DashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute(
      "href",
      "/finance/expenses/new",
    );
    expect(
      screen.getByRole("link", { name: "Add company money" }),
    ).toHaveAttribute("href", "/finance/funding/new");
    expect(
      screen.getByRole("link", { name: "Manage scooters" }),
    ).toHaveAttribute("href", "/scooters");
    expect(screen.getByRole("link", { name: "Manage people" })).toHaveAttribute(
      "href",
      "/persons",
    );
    expect(
      screen.getByRole("region", { name: "Company overview" }),
    ).toBeInTheDocument();
  });
});
