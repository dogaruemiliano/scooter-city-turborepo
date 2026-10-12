import { render, screen, waitFor, within } from "@testing-library/react";
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
    } as Record<string, string[]>,
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
  mocks.user.effectiveScopes = {
    "problems.read": ["AVAILABLE"],
    "problems.claim": ["AVAILABLE"],
    "problems.update": ["ASSIGNED"],
  };
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

function renderWorkspace() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ProblemsWorkspace />
    </NextIntlClientProvider>,
  );
}

describe("service list filters", () => {
  it("keeps nested status selection as a draft and resets paging only on Apply", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({
      items: [problem],
      total: 60,
      page: 1,
      pageSize: 25,
    });
    renderWorkspace();
    await screen.findByRole("button", { name: "Honda Vision · 7" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?view=available&page=2",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Status" }));
    const statusSheet = screen.getByRole("dialog", { name: "Status" });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await user.click(
      within(statusSheet).getByRole("button", { name: "Resolved" }),
    );
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?view=available&page=1&status=resolved",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Resolved",
    );
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Resolved",
    );
  });

  it("only exposes readable service views and retains the permission-dependent default", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("button", { name: "Honda Vision · 7" });
    expect(
      screen.queryByRole("button", { name: "Report problem" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Show" }));
    const sheet = screen.getByRole("dialog", { name: "Show" });
    expect(
      within(sheet).getByRole("button", { name: "Available problems" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "My problems" }),
    ).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "All problems" }),
    ).not.toBeInTheDocument();
  });

  it("offers retry for an initial list failure without hiding its toolbar", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockRejectedValueOnce(new Error("Service is unavailable"));
    renderWorkspace();
    expect(
      await screen.findByText("Service is unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(
      await screen.findByRole("button", { name: "Honda Vision · 7" }),
    ).toBeInTheDocument();
  });
});

it("keeps existing results visibly marked when the next page fails", async () => {
  const user = userEvent.setup();
  mocks.fetch.mockResolvedValueOnce({
    items: [problem],
    total: 60,
    page: 1,
    pageSize: 25,
  });
  mocks.fetch.mockRejectedValueOnce(new Error("Could not update service work"));
  renderWorkspace();
  await screen.findByRole("button", { name: "Honda Vision · 7" });
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    await screen.findByText("Could not update service work"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(messages.en.shared.list.staleResults),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Honda Vision · 7" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
