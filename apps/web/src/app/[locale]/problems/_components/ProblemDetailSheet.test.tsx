import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemDetailSheet } from "./ProblemDetailSheet";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: {
    id: "mechanic",
    isSuperAdmin: false,
    effectiveScopes: {} as Record<string, string[]>,
  },
}));
vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.fetch, url: (path: string) => path },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
const problem = v1.problems.problemSchema.parse({
  id: "problem",
  scooterId: "scooter",
  title: "Replace pads",
  description: "Check hydraulic levels.",
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
    registrationNumber: null,
  },
  status: "in_progress",
  severity: "high",
  priority: "high",
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  checklist: [{ id: "pads", text: "Install pads", completed: false }],
  assigneeId: "mechanic",
  assignee: { id: "mechanic", firstName: "Alex", lastName: null },
  revision: 3,
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
  resolvedAt: null,
});
function renderDetail() {
  const onChanged = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ProblemDetailSheet
        problem={problem}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    </NextIntlClientProvider>,
  );
  return onChanged;
}
beforeEach(() => {
  mocks.user.id = "mechanic";
  mocks.user.isSuperAdmin = false;
  mocks.user.effectiveScopes = {
    "problems.read": ["ASSIGNED"],
    "problems.update": ["ASSIGNED"],
  };
  mocks.fetch
    .mockReset()
    .mockImplementation(
      async (
        url: string,
        _schema: unknown,
        options?: { json?: Record<string, unknown> },
      ) => {
        if (url.includes("/activity"))
          return { items: [], total: 0, page: 1, pageSize: 25 };
        if (url.includes("eligible-assignees"))
          return {
            items: [{ id: "other", firstName: "Taylor", lastName: null }],
          };
        return { ...problem, ...options?.json, revision: 4 };
      },
    );
});
describe("task detail sheet permissions", () => {
  it("lets the assigned mechanic change the checklist but not choose another assignee", async () => {
    const user = userEvent.setup();
    const changed = renderDetail();
    const detail = screen.getByRole("dialog", { name: "Replace pads" });
    expect(detail).toHaveClass("bg-popover");
    // Small control surfaces may use their shared defaults; full-sheet containers must inherit popover.
    for (const slot of [
      "bottom-sheet-header",
      "bottom-sheet-body",
      "bottom-sheet-content",
    ]) {
      expect(detail.querySelector(`[data-slot="${slot}"]`)).not.toHaveClass(
        "bg-background",
      );
    }
    expect(
      within(detail).queryByRole("button", { name: "Update assignment" }),
    ).toBeNull();
    expect(
      within(detail).queryByRole("combobox", { name: "Assignee" }),
    ).toBeNull();
    await user.click(
      within(detail).getByRole("checkbox", { name: "Install pads" }),
    );
    await user.click(
      within(detail).getByRole("button", { name: "Save checklist" }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/problem",
      expect.anything(),
      {
        method: "PATCH",
        json: {
          revision: 3,
          checklist: [{ id: "pads", text: "Install pads", completed: true }],
        },
      },
    );
  });

  it("shows a read-only checklist to an unassigned viewer", () => {
    mocks.user.id = "viewer";
    mocks.user.effectiveScopes = { "problems.read": ["ALL"] };
    renderDetail();
    expect(
      screen.getByRole("checkbox", { name: "Install pads" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "Save checklist" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Take photos" })).toBeNull();
  });

  it.each([false, true])(
    "lets an admin choose another eligible assignee (superadmin=%s)",
    async (superadmin) => {
      const user = userEvent.setup();
      mocks.user.id = "admin";
      mocks.user.isSuperAdmin = superadmin;
      mocks.user.effectiveScopes = {
        "problems.read": ["ALL"],
        "problems.update": ["ALL"],
        "problems.assign": ["ALL"],
      };
      renderDetail();
      await user.click(
        screen.getByRole("button", { name: "Update assignment" }),
      );
      await user.click(
        await screen.findByRole("combobox", { name: "Assignee" }),
      );
      await user.click(await screen.findByRole("option", { name: "Taylor" }));
      await user.click(
        screen.getAllByRole("button", { name: "Update assignment" }).at(-1)!,
      );
      await waitFor(() =>
        expect(mocks.fetch).toHaveBeenCalledWith(
          "/v1/problems/problem/assignee",
          expect.anything(),
          {
            method: "PUT",
            json: { revision: 3, assigneeId: "other" },
          },
        ),
      );
    },
  );
});
