import { messages } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "./DashboardOverview";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
}));
vi.mock("../finance/_components/OperationList", () => ({
  OperationList: () => <div>Recent operations</div>,
}));

describe("DashboardOverview inventory", () => {
  it.each(["en", "ro"] as const)(
    "shows actual inventory and basic administration links (%s)",
    async (locale) => {
      render(
        await DashboardOverview({
          locale,
          data: Promise.resolve({
            cash: null,
            operations: null,
            fleet: { totalScooters: 12 },
          }),
        }),
      );
      const t = messages[locale].dashboard;
      const fleet = within(screen.getByRole("region", { name: t.fleet.title }));

      expect(fleet.getByText("12")).toBeInTheDocument();
      expect(fleet.getByRole("link", { name: t.fleet.view })).toHaveAttribute(
        "href",
        "/scooters",
      );
      expect(fleet.getByRole("link", { name: t.fleet.add })).toHaveAttribute(
        "href",
        "/scooters/new",
      );
      expect(
        screen.queryByRole("link", { name: /service/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps an unavailable inventory distinct from an empty one", async () => {
    render(
      await DashboardOverview({
        locale: "en",
        data: Promise.resolve({ cash: null, operations: null, fleet: null }),
      }),
    );
    const t = messages.en.dashboard;
    const fleet = within(screen.getByRole("region", { name: t.fleet.title }));

    expect(fleet.getByText(t.unavailable)).toBeInTheDocument();
    expect(fleet.queryByText("0")).not.toBeInTheDocument();
    expect(fleet.queryByText(t.fleet.empty)).not.toBeInTheDocument();
    expect(fleet.getByRole("link", { name: t.fleet.add })).toHaveAttribute(
      "href",
      "/scooters/new",
    );
  });
});
