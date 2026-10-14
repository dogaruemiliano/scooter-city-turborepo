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
vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.fetch, url: (path: string) => path },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
const problem = {
  id: "problem",
  revision: 4,
  scooter: {
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
  },
  description: "Rear brake",
  assigneeId: null,
  status: "open",
  priority: "normal",
  title: "Inspect rear brake",
  severity: "high",
  photos: [],
  createdAt: "2026-10-14T08:00:00Z",
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
  it("uses shared cards in status lanes without duplicating the mobile collection", async () => {
    mocks.fetch.mockResolvedValue({
      items: [
        problem,
        {
          ...problem,
          id: "resolved",
          title: "Replace spring",
          status: "resolved",
        },
      ],
      total: 2,
      page: 1,
      pageSize: 25,
    });
    renderWorkspace();
    const open = await screen.findByRole("region", { name: "Open" });
    const resolved = screen.getByRole("region", { name: "Resolved" });
    expect(
      within(open).getByRole("button", {
        name: "Inspect rear brake · Honda Vision · 007 HON",
      }),
    ).toBeInTheDocument();
    const scooterIdentity = within(open).getByRole("button", {
      name: "Inspect rear brake · Honda Vision · 007 HON",
    });
    expect(within(open).getByText("007 HON")).toBeInTheDocument();
    expect(within(open).getByText("Honda Vision")).toBeInTheDocument();
    expect(scooterIdentity).toHaveAttribute("aria-haspopup", "dialog");
    expect(scooterIdentity).toHaveClass(
      "absolute",
      "inset-0",
      "h-full",
      "w-full",
    );
    expect(scooterIdentity.querySelector("svg")).toBeNull();
    expect(within(resolved).getByText("Replace spring")).toBeInTheDocument();
    expect(document.querySelectorAll('article[data-slot="card"]')).toHaveLength(
      2,
    );
    expect(document.querySelectorAll('[data-slot="card-accent"]')).toHaveLength(
      2,
    );
    expect(
      document.querySelectorAll('[data-slot="avatar-fallback"]'),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /Honda Vision · 007 HON/ }),
    ).toHaveLength(2);
  });
  it("claims with a revision and never sends another user as assignee", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/claim"))
        return { ...problem, assigneeId: "mechanic", revision: 5 };
      if (url.includes("/activity"))
        return { items: [], total: 0, page: 1, pageSize: 25 };
      return { items: [problem], total: 1, page: 1, pageSize: 25 };
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemsWorkspace />
      </NextIntlClientProvider>,
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Inspect rear brake · Honda Vision · 007 HON",
      }),
    );
    const detail = screen.getByRole("dialog", { name: "Inspect rear brake" });
    expect(
      within(detail).getByRole("heading", { name: "Inspect rear brake" }),
    ).toBeInTheDocument();
    expect(within(detail).getByText("007 HON")).toBeInTheDocument();
    expect(detail).toHaveClass("bg-popover", "text-popover-foreground");
    expect(detail.querySelectorAll(".bg-background")).toHaveLength(0);
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
  it("keeps segmented status selection as a draft and resets paging only on Apply", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({
      items: [problem],
      total: 60,
      page: 1,
      pageSize: 25,
    });
    renderWorkspace();
    await screen.findByRole("button", {
      name: "Inspect rear brake · Honda Vision · 007 HON",
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?page=2",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const statusGroup = screen.getByRole("radiogroup", { name: "Status" });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await user.click(
      within(statusGroup).getByRole("radio", { name: "Resolved" }),
    );
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.filter(([url]) =>
        String(url).startsWith("/v1/problems?"),
      ),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?page=1&status=resolved",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      within(screen.getByRole("radiogroup", { name: "Status" })).getByRole(
        "radio",
        { name: "Resolved" },
      ),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      within(screen.getByRole("radiogroup", { name: "Status" })).getByRole(
        "radio",
        { name: "Resolved" },
      ),
    ).toBeChecked();
  });

  it("only exposes readable service views and treats no selection as all accessible problems", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("button", {
      name: "Inspect rear brake · Honda Vision · 007 HON",
    });
    expect(
      screen.queryByRole("link", { name: "Report problem" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const group = screen.getByRole("radiogroup", { name: "Show" });
    const available = within(group).getByRole("radio", {
      name: "Available problems",
    });
    expect(available).not.toBeChecked();
    expect(
      within(group).queryByRole("radio", { name: "Assigned to me" }),
    ).toBeNull();
    expect(within(group).queryByRole("radio", { name: /All/ })).toBeNull();
    await user.click(available);
    expect(available).toBeChecked();
    await user.click(available);
    expect(available).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems?page=1",
      expect.anything(),
      { cache: "no-store" },
    );
  });

  it("uses fixed 2×2 status and severity groups, keeping the scooter and assignee pickers", async () => {
    const user = userEvent.setup();
    mocks.user.effectiveScopes = { "problems.read": ["ALL"] };
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    for (const name of ["Status", "Severity"]) {
      const group = within(sheet).getByRole("radiogroup", { name });
      expect(within(group).getAllByRole("radio")).toHaveLength(4);
      expect(group).toHaveStyle({ "--segmented-columns": "2" });
      expect(within(group).queryByRole("radio", { name: /All/ })).toBeNull();
      expect(
        within(group)
          .getAllByRole("radio")
          .every((radio) => !(radio as HTMLInputElement).checked),
      ).toBe(true);
    }
    expect(
      within(sheet).getByRole("button", { name: "Scooter" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Assignee" }),
    ).toBeInTheDocument();
    const high = within(
      within(sheet).getByRole("radiogroup", { name: "Severity" }),
    ).getByRole("radio", { name: "High" });
    await user.click(high);
    expect(high).toBeChecked();
    await user.keyboard(" ");
    expect(high).not.toBeChecked();
  });

  it("filters both usable and unusable problems, and deselecting removes the restriction", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ro" messages={messages.ro}>
        <ProblemsWorkspace />
      </NextIntlClientProvider>,
    );
    await screen.findByRole("button", {
      name: "Inspect rear brake · Honda Vision · 007 HON",
    });
    const filterName = messages.ro.shared.list.filters;
    const applyName = messages.ro.shared.list.apply;
    const conditionName = messages.ro.workspace.problems.scooterCondition;
    await user.click(screen.getByRole("button", { name: filterName }));
    let group = screen.getByRole("radiogroup", { name: conditionName });
    await user.click(within(group).getByRole("radio", { name: "Utilizabil" }));
    await user.click(screen.getByRole("button", { name: applyName }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?page=1&blocking=false",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    await user.click(screen.getByRole("button", { name: filterName }));
    group = screen.getByRole("radiogroup", { name: conditionName });
    await user.click(
      within(group).getByRole("radio", { name: "Neutilizabil" }),
    );
    await user.click(screen.getByRole("button", { name: applyName }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?page=1&blocking=true",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    await user.click(screen.getByRole("button", { name: filterName }));
    group = screen.getByRole("radiogroup", { name: conditionName });
    await user.click(
      within(group).getByRole("radio", { name: "Neutilizabil" }),
    );
    expect(
      within(group)
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: applyName }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/problems?page=1",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
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
      await screen.findByRole("button", {
        name: "Inspect rear brake · Honda Vision · 007 HON",
      }),
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
  await screen.findByRole("button", {
    name: "Inspect rear brake · Honda Vision · 007 HON",
  });
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    await screen.findByText("Could not update service work"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(messages.en.shared.list.staleResults),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Inspect rear brake · Honda Vision · 007 HON",
    }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("places the quick radios under the creation action and applies quick filters immediately with empty selection meaning All", async () => {
  const user = userEvent.setup();
  mocks.user.effectiveScopes = {
    "problems.read": ["ALL"],
    "problems.create": ["ALL"],
  };
  mocks.fetch.mockResolvedValue({
    items: [problem],
    total: 60,
    page: 1,
    pageSize: 25,
  });
  renderWorkspace();
  await screen.findByRole("button", {
    name: "Inspect rear brake · Honda Vision · 007 HON",
  });
  const group = screen.getByRole("radiogroup", { name: "Quick filters" });
  const create = screen.getByRole("link", { name: "Report problem" });
  expect(
    create.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(group).queryByRole("radio", { name: "All" })).toBeNull();
  expect(
    within(group)
      .getAllByRole("radio")
      .every((radio) => !(radio as HTMLInputElement).checked),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(within(group).getByRole("radio", { name: "Open" }));
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems?page=1&status=open",
      expect.anything(),
      { cache: "no-store" },
    ),
  );
  await user.click(within(group).getByRole("radio", { name: "Mine" }));
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems?view=assigned&page=1",
      expect.anything(),
      { cache: "no-store" },
    ),
  );
  await user.click(within(group).getByRole("radio", { name: "Mine" }));
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems?page=1",
      expect.anything(),
      { cache: "no-store" },
    ),
  );
  await user.click(within(group).getByRole("radio", { name: "Resolved" }));
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems?page=1&status=resolved",
      expect.anything(),
      { cache: "no-store" },
    ),
  );
  expect(within(group).getByRole("radio", { name: "Resolved" })).toBeChecked();
});

it("uses short Romanian labels and hides Mine when assigned access is absent", async () => {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="ro" messages={messages.ro}>
      <ProblemsWorkspace />
    </NextIntlClientProvider>,
  );
  const group = screen.getByRole("radiogroup", { name: "Filtre rapide" });
  expect(within(group).queryByRole("radio", { name: "All" })).toBeNull();
  expect(
    within(group)
      .getAllByRole("radio")
      .every((radio) => !(radio as HTMLInputElement).checked),
  ).toBe(true);
  expect(
    within(group).getByRole("radio", { name: "Rezolvate" }),
  ).toBeInTheDocument();
  expect(
    within(group).queryByRole("radio", { name: "Ale mele" }),
  ).not.toBeInTheDocument();
  await user.click(within(group).getByRole("radio", { name: "Open" }));
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems?page=1&status=open",
      expect.anything(),
      { cache: "no-store" },
    ),
  );
});
