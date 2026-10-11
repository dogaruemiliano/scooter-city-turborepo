import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemsWorkspace } from "./ProblemsWorkspace";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: {
    id: "mechanic",
    effectiveScopes: {
      "problems.read": ["AVAILABLE"],
      "problems.claim": ["AVAILABLE"],
      "problems.update": ["ASSIGNED"],
    },
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
const problem = {
  id: "problem",
  revision: 4,
  scooter: { fleetNumber: 7, brandName: "Honda", model: "Vision" },
  description: "Rear brake",
  assigneeId: null,
  status: "open",
  priority: "normal",
};
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({
    items: [problem],
    total: 1,
    page: 1,
    pageSize: 25,
  });
});
describe("mechanic workspace", () => {
  it("claims with a revision and never sends another user as assignee", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemsWorkspace />
      </NextIntlClientProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: "Honda Vision · 7" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Work notes" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim problem" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/problem/claim",
        expect.anything(),
        { method: "POST", json: { revision: 4 } },
      ),
    );
    expect(
      screen.queryByRole("combobox", { name: "Assigned mechanic" }),
    ).not.toBeInTheDocument();
  });
});
