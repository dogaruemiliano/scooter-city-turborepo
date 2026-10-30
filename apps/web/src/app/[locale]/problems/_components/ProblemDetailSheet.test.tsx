import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  refresh: vi.fn(),
  user: {
    id: "mechanic",
    isSuperAdmin: false,
    isAdmin: false,
    effectiveScopes: {} as Record<string, string[]>,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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
  mocks.refresh.mockReset();
  mocks.user.id = "mechanic";
  mocks.user.isSuperAdmin = false;
  mocks.user.isAdmin = false;
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
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
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
      await user.click(
        within(sheet).getByRole("button", { name: "Save assignees" }),
      );
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
  it("shows completion and reopening messages in a non-admin's comment thread", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes("/activity"))
        return {
          items: [
            {
              id: "complete",
              type: "PROBLEM_RESOLVED",
              actor: { id: "mechanic", firstName: "Alex", lastName: null },
              createdAt: "2026-10-24T10:00:00Z",
              note: "Brake pads replaced",
            },
            {
              id: "reopen",
              type: "PROBLEM_REOPENED",
              actor: { id: "manager", firstName: "Maria", lastName: null },
              createdAt: "2026-10-24T11:00:00Z",
              note: "Noise returned after road test",
            },
          ],
          total: 2,
          page: 1,
          pageSize: 25,
        };
      if (url.includes("eligible-assignees")) return { items: [] };
      return problem;
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("Brake pads replaced")).toBeVisible();
    expect(screen.getByText("Task completed")).toBeVisible();
    expect(screen.getByText("Task reopened")).toBeVisible();
    expect(screen.getByText("Noise returned after road test")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Activity/ })).toBeNull();
  });

  it("separates collapsed system activity from visible comments", async () => {
    mocks.user.isAdmin = true;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes("/activity"))
        return {
          items: url.includes("kind=activity")
            ? [
                {
                  id: "resolved",
                  type: "PROBLEM_RESOLVED",
                  actor: { id: "mechanic", firstName: "Alex", lastName: null },
                  createdAt: "2026-10-24T10:00:00Z",
                  before: { status: "in_progress" },
                  after: { status: "resolved" },
                  note: "Brakes replaced",
                },
              ]
            : [
                {
                  id: "comment",
                  type: "PROBLEM_COMMENTED",
                  actor: { id: "mechanic", firstName: "Alex", lastName: null },
                  createdAt: "2026-10-24T09:00:00Z",
                  note: "Parts arrived",
                },
              ],
          total: 1,
          page: 1,
          pageSize: 25,
        };
      if (url.includes("eligible-assignees")) return { items: [] };
      return problem;
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("Parts arrived")).toBeVisible();
    const activity = screen.getByRole("button", { name: /Activity/ });
    expect(activity).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(activity);
    expect(screen.getByText("In progress → Resolved")).toBeVisible();
    expect(screen.getByText("Parts arrived")).toBeVisible();
    expect(screen.getByText("Brakes replaced")).not.toBeVisible();
    await userEvent.setup().click(screen.getByText("View changes"));
    expect(screen.getByText("Brakes replaced")).toBeVisible();
  });

  it("keeps comments on the page and refreshes activity after posting", async () => {
    mocks.user.effectiveScopes = {
      "problems.read": ["ALL"],
      "problems.update": ["ALL"],
    };
    let posted = false;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/comments")) {
        posted = true;
        return { ...problem, revision: 4 };
      }
      if (url.includes("/activity"))
        return {
          items: posted
            ? [
                {
                  id: "comment",
                  type: "PROBLEM_COMMENTED",
                  actor: { id: "mechanic", firstName: "Alex", lastName: null },
                  createdAt: "2026-10-24T10:00:00Z",
                  note: "Inspection complete",
                },
              ]
            : [],
          total: posted ? 1 : 0,
          page: 1,
          pageSize: 25,
        };
      if (url.includes("eligible-assignees")) return { items: [] };
      return problem;
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    const comment = await screen.findByRole("textbox", { name: "Comment" });
    expect(comment.closest('[role="dialog"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Activity/ })).toBeNull();
    await user.type(comment, "Inspection complete");
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    const postedBody = await screen.findByText("Inspection complete");
    const item = postedBody.closest('[data-slot="comment-item"]')!;
    await waitFor(() => expect(item).toHaveClass("motion-safe:animate-in"));
    expect(item).toHaveClass("motion-reduce:animate-none");
    fireEvent(item, new Event("webkitAnimationEnd", { bubbles: true }));
    await waitFor(() => expect(item).not.toHaveClass("motion-safe:animate-in"));
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu", { name: "More actions" });
    expect(within(menu).queryByRole("textbox", { name: "Comment" })).toBeNull();
    expect(within(menu).queryByText("Inspection complete")).toBeNull();
  });

  it("provides a desktop close icon in task completion without a Cancel button", async () => {
    mocks.user.effectiveScopes = {
      "problems.read": ["ALL"],
      "problems.resolve": ["ALL"],
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProblemDetailScreen id="problem" />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Complete/ }));
    const modal = await screen.findByRole("dialog", { name: /Complete/ });
    const close = within(modal).getByRole("button", { name: "Close" });
    expect(close).toHaveClass("hidden", "lg:inline-flex");
    expect(within(modal).queryByRole("button", { name: "Cancel" })).toBeNull();
    await user.click(close);
    await waitFor(() => expect(modal).not.toBeInTheDocument());
  });

  it.each([
    ["scooter problem", "open", false],
    ["scooter problem", "in_progress", false],
    ["to-do", "open", true],
    ["to-do", "in_progress", true],
  ] as const)(
    "%s uses the primary action for %s work and keeps pause in more actions",
    async (_kind, status, todo) => {
      mocks.user.effectiveScopes = {
        "problems.read": ["ALL"],
        "problems.update": ["ALL"],
        "problems.resolve": ["ALL"],
      };
      mocks.fetch.mockImplementation(async (url: string) =>
        url.includes("/activity")
          ? { items: [], total: 0, page: 1, pageSize: 25 }
          : {
              ...problem,
              status,
              ...(todo
                ? { scooterId: null, scooter: null, difficulty: null }
                : {}),
            },
      );
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <ProblemDetailScreen id="problem" />
        </NextIntlClientProvider>,
      );
      await screen.findByRole("heading", { name: problem.title });
      const user = userEvent.setup();
      expect(screen.queryByRole("button", { name: "Pause work" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "More actions" }));
      const menu = await screen.findByRole("menu", { name: "More actions" });
      if (status === "open") {
        expect(
          within(menu).queryByRole("menuitem", { name: "Pause work" }),
        ).toBeNull();
        await user.keyboard("{Escape}");
        await user.click(screen.getByRole("button", { name: "Start work" }));
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
        await user.click(
          within(menu).getByRole("menuitem", { name: "Pause work" }),
        );
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
        name: "More actions",
      });
      const content = screen.getByRole("main");
      const actions = content.querySelector('[data-slot="problem-actions"]')!;
      await waitFor(() =>
        expect(
          (isMobile ? screen.getByRole("banner") : actions).contains(trigger),
        ).toBe(true),
      );
      expect(
        screen.getAllByRole("button", { name: "More actions" }),
      ).toHaveLength(1);
      if (!isMobile) {
        expect(actions).toHaveClass("justify-end", "md:flex");
        expect(actions.nextElementSibling?.tagName).toBe("DL");
        expect(actions.nextElementSibling).toHaveTextContent("Priority");
      } else expect(actions).toBeEmptyDOMElement();
      await userEvent.setup().click(trigger);
      const sheet = await screen.findByRole("menu", {
        name: "More actions",
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
