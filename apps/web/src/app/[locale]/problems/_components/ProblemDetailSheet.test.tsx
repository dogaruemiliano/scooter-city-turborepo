import { render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { PageHeaderActionsContext } from "@/components/PageHeaderActions";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemDetailSheet } from "./ProblemDetailSheet";
import { ProblemDetailScreen } from "./ProblemDetailScreen";
import { ProblemWork } from "./ProblemForms";

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
    coverUrl: "/v1/scooters/scooter/photos/cover/content",
    brandName: "Honda",
    model: "Vision",
    registrationNumber: null,
  },
  status: "in_progress",
  difficulty: "hard",
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
      <main>
        <ProblemWork problem={problem} reload={onChanged} />
      </main>
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
describe("task detail workflow permissions", () => {
  it("lets the assigned mechanic change the checklist but not choose another assignee", async () => {
    const user = userEvent.setup();
    const changed = renderDetail();
    expect(screen.getByText("You")).toBeInTheDocument();
    const detail = screen.getByRole("main");
    expect(
      within(detail).queryByRole("button", { name: "Manage assignment" }),
    ).toBeNull();
    expect(
      within(detail).queryByRole("combobox", { name: "Assignee" }),
    ).toBeNull();
    await user.click(
      within(detail).getByRole("checkbox", { name: "Install pads" }),
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
        screen.getByRole("button", { name: "Manage assignment" }),
      );
      const sheet = await screen.findByRole("dialog", {
        name: "Manage assignment",
      });
      expect(sheet).toHaveClass("bg-popover");
      expect(sheet.querySelector(".bg-background")).toBeNull();
      await user.click(
        await within(sheet).findByRole("button", { name: "Taylor" }),
      );
      expect(
        mocks.fetch.mock.calls.some(
          ([url]) => url === "/v1/problems/problem/assignee",
        ),
      ).toBe(false);
      await user.click(within(sheet).getByRole("button", { name: "Apply" }));
      await waitFor(() =>
        expect(mocks.fetch).toHaveBeenCalledWith(
          "/v1/problems/problem/assignee",
          expect.anything(),
          {
            method: "PUT",
            json: { revision: 3, assigneeIds: ["mechanic", "other"] },
          },
        ),
      );
    },
  );
});

describe("problem preview", () => {
  it("shows a read-only sheet with a link to the full page and a distinct surface", async () => {
    const close = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailSheet problem={problem} onClose={close} />
      </NextIntlClientProvider>,
    );
    const detail = screen.getByRole("dialog", { name: problem.title });
    expect(detail).toHaveClass("bg-popover", "text-popover-foreground");
    for (const slot of [
      "bottom-sheet-header",
      "bottom-sheet-body",
      "bottom-sheet-content",
    ]) {
      expect(detail.querySelector(`[data-slot="${slot}"]`)).not.toHaveClass(
        "bg-background",
      );
    }
    expect(within(detail).getByText(problem.description)).toBeInTheDocument();
    expect(
      within(detail).getByRole("link", { name: "Open problem" }),
    ).toHaveAttribute("href", "/en/problems/problem");
    expect(within(detail).queryByRole("checkbox")).toBeNull();
    expect(
      within(detail).queryByRole("button", { name: "Manage assignment" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(within(detail).getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("problem details page", () => {
  it.each(["open", "in_progress"] as const)(
    "uses the primary action for %s work and keeps pause in more actions",
    async (status) => {
      mocks.user.effectiveScopes = {
        "problems.read": ["ALL"],
        "problems.update": ["ALL"],
        "problems.resolve": ["ALL"],
      };
      mocks.fetch.mockImplementation(async (url: string) =>
        url.includes("/activity")
          ? { items: [], total: 0, page: 1, pageSize: 25 }
          : { ...problem, status },
      );
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <ProblemDetailScreen id="problem" />
        </NextIntlClientProvider>,
      );
      await screen.findByRole("heading", { name: problem.title });
      if (status === "open") {
        await userEvent
          .setup()
          .click(screen.getByRole("button", { name: "Start work" }));
        await waitFor(() =>
          expect(mocks.fetch).toHaveBeenCalledWith(
            "/v1/problems/problem",
            expect.anything(),
            { method: "PATCH", json: { revision: 3, startWork: true } },
          ),
        );
        expect(
          screen.queryByRole("button", { name: "Complete task" }),
        ).toBeNull();
      } else {
        expect(
          screen.getByRole("button", { name: /Complete/ }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Pause work" })).toBeNull();
        await userEvent
          .setup()
          .click(
            screen.getByRole("button", { name: "More actions and activity" }),
          );
        await userEvent
          .setup()
          .click(await screen.findByRole("button", { name: "Pause work" }));
        await waitFor(() =>
          expect(mocks.fetch).toHaveBeenCalledWith(
            "/v1/problems/problem",
            expect.anything(),
            { method: "PATCH", json: { revision: 3, pauseWork: true } },
          ),
        );
      }
    },
  );

  it.each([false, true])(
    "places more actions above priority on desktop and in the mobile header (mobile=%s)",
    async (isMobile) => {
      function Page() {
        const [target, setTarget] = useState<HTMLElement | null>(null);
        return (
          <PageHeaderActionsContext.Provider value={{ isMobile, target }}>
            <header ref={setTarget} />
            <ProblemDetailScreen id="problem" />
          </PageHeaderActionsContext.Provider>
        );
      }
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <Page />
        </NextIntlClientProvider>,
      );
      const trigger = await screen.findByRole("button", {
        name: "More actions and activity",
      });
      const content = screen.getByRole("main");
      const actions = content.querySelector('[data-slot="problem-actions"]')!;
      await waitFor(() =>
        expect(
          (isMobile ? screen.getByRole("banner") : actions).contains(trigger),
        ).toBe(true),
      );
      expect(
        screen.getAllByRole("button", { name: "More actions and activity" }),
      ).toHaveLength(1);
      if (!isMobile) {
        expect(actions).toHaveClass("justify-end", "md:flex");
        expect(actions.nextElementSibling?.tagName).toBe("DL");
        expect(actions.nextElementSibling).toHaveTextContent("Priority");
      } else expect(actions).toBeEmptyDOMElement();
      await userEvent.setup().click(trigger);
      const sheet = await screen.findByRole("dialog", {
        name: "More actions and activity",
      });
      expect(sheet).toHaveClass("bg-popover");
      expect(sheet.querySelector(".bg-background")).toBeNull();
    },
  );

  it("loads direct links and keeps checklist edits on the page", async () => {
    mocks.fetch.mockImplementation(
      async (
        url: string,
        _schema: unknown,
        options?: { json?: Record<string, unknown> },
      ) => {
        if (url.includes("/activity"))
          return { items: [], total: 0, page: 1, pageSize: 25 };
        return {
          ...problem,
          ...options?.json,
          revision: options?.json ? 4 : 3,
        };
      },
    );
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: problem.title, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: /Honda Vision/ })).toHaveAttribute(
      "href",
      "/en/scooters/scooter",
    );
    expect(
      screen.getByRole("link", { name: /Honda Vision/ }).querySelector("img"),
    ).toHaveAttribute("src", "/v1/scooters/scooter/photos/cover/content");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Install pads" }));
    await waitFor(() =>
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
      ),
    );
  });
  it("offers retry when a direct link fails to load", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("Problem unavailable"));
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Problem unavailable",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
