import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ApiError, v1 } from "@repo/api-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { motion } from "@repo/theme";
import { ProblemCompletion } from "./ProblemCompletion";
import { ProblemAssignment } from "./ProblemAssignment";
import { ProblemsWorkspace } from "./ProblemsWorkspace";
import { SwipeAction } from "@repo/ui/components/swipe-action";
import { ProblemScooterPicker } from "./ProblemScooterPicker";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
  user: {
    id: "admin",
    isAdmin: true,
    isSuperAdmin: false,
    effectiveScopes: {
      "problems.read": ["ALL"],
      "problems.assign": ["ALL"],
      "problems.resolve": ["ALL"],
    } as Record<string, string[]>,
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
const problem: v1.problems.Problem = {
  id: "task",
  revision: 3,
  title: "Order supplies",
  description: "",
  scooterId: null,
  scooter: null,
  difficulty: null,
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  checklist: [],
  sections: [],
  buyList: [],
  location: null,
  assigneeId: null,
  assignee: null,
  status: "open",
  priority: "normal",
  createdAt: "2026-11-04T12:00:00Z",
  updatedAt: "2026-11-04T12:00:00Z",
  resolvedAt: null,
};
function wrapper(children: React.ReactNode, locale: "en" | "ro" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  mocks.user.id = "admin";
  mocks.user.isAdmin = true;
  mocks.user.effectiveScopes = {
    "problems.read": ["ALL"],
    "problems.assign": ["ALL"],
    "problems.resolve": ["ALL"],
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("admin and worker completion", () => {
  it("loads only authorized creation scooters for a mechanic", async () => {
    mocks.user.isAdmin = false;
    mocks.user.id = "mechanic";
    mocks.user.effectiveScopes = {
      "problems.create": ["ALL"],
      "problems.read": ["ASSIGNED"],
      "scooters.read": ["ASSIGNED"],
    };
    mocks.fetch.mockResolvedValue({
      items: [
        {
          id: "assigned-scooter",
          fleetNumber: 7,
          brandCode: "HON",
          brandName: "Honda",
          model: "Vision",
          registrationNumber: null,
        },
      ],
    });
    const select = vi.fn();
    wrapper(<ProblemScooterPicker value="" onChange={select} />);
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/creation-scooters",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    const picker = screen.getByRole("button", { name: "Scooter" });
    await waitFor(() => expect(picker).toBeEnabled());
    const user = userEvent.setup();
    await user.click(picker);
    await user.click(await screen.findByRole("button", { name: /007 HON/ }));
    expect(select).toHaveBeenCalledWith("assigned-scooter");
    expect(
      mocks.fetch.mock.calls.some(([path]) =>
        String(path).startsWith("/v1/scooters"),
      ),
    ).toBe(false);
  });
  it.each(["en", "ro"] as const)(
    "completes an unassigned open todo without a note (%s)",
    async (locale) => {
      const onCompleted = vi.fn();
      mocks.fetch.mockResolvedValue({ ...problem, status: "resolved" });
      wrapper(
        <ProblemCompletion
          problem={problem}
          compact
          open
          onCompleted={onCompleted}
        />,
        locale,
      );
      const sheet = screen.getByRole("dialog");
      expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
      expect(sheet.querySelector(".bg-background")).toBeNull();
      expect(within(sheet).getByRole("textbox")).not.toBeRequired();
      await userEvent.setup().click(
        within(sheet).getByRole("button", {
          name: messages[locale].shared.formActions.complete.idle,
        }),
      );
      await waitFor(() => expect(onCompleted).toHaveBeenCalled());
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/task/resolve",
        expect.anything(),
        { method: "POST", json: { revision: 3 } },
      );
    },
  );
  it("keeps worker notes required and prevents completion of another worker's task", () => {
    mocks.user.isAdmin = false;
    mocks.user.id = "mechanic";
    mocks.user.effectiveScopes = { "problems.resolve": ["ASSIGNED"] };
    const own = {
      ...problem,
      status: "in_progress" as const,
      assignees: [{ id: "mechanic", firstName: "Alex", lastName: null }],
    };
    const view = wrapper(
      <ProblemCompletion problem={own} onCompleted={vi.fn()} />,
    );
    expect(screen.getByRole("textbox")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Complete task" }),
    ).toBeDisabled();
    view.unmount();
    wrapper(
      <ProblemCompletion
        problem={{
          ...own,
          assignees: [{ id: "other", firstName: "Other", lastName: null }],
        }}
        onCompleted={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Complete task" })).toBeNull();
  });
  it("blocks duplicate submission and closing while pending", async () => {
    let finish!: (value: unknown) => void;
    mocks.fetch.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const close = vi.fn();
    wrapper(
      <ProblemCompletion
        problem={problem}
        compact
        open
        onOpenChange={close}
        onCompleted={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "Complete task" });
    await userEvent.setup().click(button);
    fireEvent.submit(button.closest("form")!);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({ ...problem, status: "resolved" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  });
  it("retains the note and requires reloading after a stale write", async () => {
    mocks.fetch.mockRejectedValueOnce(new ApiError(409, "Changed"));
    wrapper(<ProblemCompletion problem={problem} onCompleted={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Supplies received");
    await user.click(screen.getByRole("button", { name: "Complete task" }));
    await screen.findByRole("button", { name: "Reload latest version" });
    expect(screen.getByRole("textbox")).toHaveValue("Supplies received");
    expect(
      screen.getByRole("button", { name: "Complete task" }),
    ).toBeDisabled();
    mocks.fetch.mockResolvedValueOnce({ ...problem, revision: 4 });
    await user.click(
      screen.getByRole("button", { name: "Reload latest version" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Complete task" }),
      ).toBeEnabled(),
    );
    mocks.fetch.mockResolvedValueOnce({ ...problem, status: "resolved" });
    await user.click(screen.getByRole("button", { name: "Complete task" }));
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems/task/resolve",
      expect.anything(),
      {
        method: "POST",
        json: { revision: 4, resolutionNotes: "Supplies received" },
      },
    );
  });
  it("opens the same sheet using the list's keyboard-accessible action", async () => {
    mocks.fetch.mockResolvedValue({
      items: [problem],
      total: 1,
      page: 1,
      pageSize: 25,
      quickFilterCounts: {
        all: 1,
        open: 1,
        in_progress: 0,
        mine: 0,
        resolved: 0,
      },
    });
    wrapper(<ProblemsWorkspace todo />);
    const action = await screen.findByRole("button", {
      name: "Complete task: Order supplies",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.setup().click(action);
    expect(screen.getByRole("dialog", { name: "Complete task" })).toBeVisible();
    expect(
      mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "POST",
      ),
    ).toHaveLength(0);
  });
});

describe("reminder bell", () => {
  function assignment() {
    return (
      <ProblemAssignment
        problem={{
          ...problem,
          assignees: [{ id: "alex", firstName: "Alex", lastName: null }],
        }}
        mayAssign
        mayClaim={false}
        busy={false}
        members={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onAssign={vi.fn()}
        saveError={null}
        onClaim={vi.fn()}
      />
    );
  }
  it("sends once and observes the server cooldown despite local clock skew", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    mocks.fetch.mockResolvedValueOnce({
      serverNow: now.toISOString(),
      items: [{ assigneeId: "alex", nextAllowedAt: null }],
    });
    wrapper(assignment());
    const user = userEvent.setup();
    const bell = screen.getByRole("button", { name: "Send reminder to Alex" });
    await waitFor(() => expect(bell).toBeEnabled());
    mocks.fetch.mockResolvedValueOnce({
      sent: true,
      serverNow: now.toISOString(),
      nextAllowedAt: new Date(now.getTime() + 60_000).toISOString(),
    });
    await user.click(bell);
    await screen.findByText("Reminder sent.");
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/v1/problems/task/reminders",
      expect.anything(),
      { method: "POST", json: { revision: 3, assigneeId: "alex" } },
    );
    expect(screen.getByTitle(/Remind Alex again in 60s/)).toBeDisabled();
  });
  it("enables another reminder when the server deadline expires", async () => {
    vi.useFakeTimers();
    const serverNow = new Date("2026-11-04T12:00:00Z").toISOString();
    mocks.fetch.mockResolvedValue({
      serverNow,
      items: [
        { assigneeId: "alex", nextAllowedAt: "2026-11-04T12:01:00.000Z" },
      ],
    });
    wrapper(assignment());
    await act(async () => {});
    expect(
      screen.getByRole("button", { name: /Reminder to Alex is on cooldown/ }),
    ).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(
      screen.getByRole("button", { name: "Send reminder to Alex" }),
    ).toBeEnabled();
  });
  it("loads an existing cooldown on mount and hides bells from mechanics", async () => {
    const serverNow = new Date().toISOString();
    mocks.fetch.mockResolvedValue({
      serverNow,
      items: [
        {
          assigneeId: "alex",
          nextAllowedAt: new Date(Date.parse(serverNow) + 30_000).toISOString(),
        },
      ],
    });
    const view = wrapper(assignment());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Reminder to Alex is on cooldown/ }),
      ).toBeDisabled(),
    );
    view.unmount();
    mocks.user.isAdmin = false;
    wrapper(assignment());
    expect(
      screen.queryByRole("button", { name: /reminder|Remind/ }),
    ).toBeNull();
  });
});

describe("shared swipe action", () => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  function gesture(dx: number, dy: number, cancel = false) {
    const item = document.querySelector('[data-slot="swipe-action"]')!;
    fireEvent.pointerDown(item, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(item, {
      clientX: 200 + dx,
      clientY: 100 + dy,
      pointerId: 1,
    });
    if (cancel) fireEvent.pointerCancel(item, { pointerId: 1 });
    else fireEvent.pointerUp(item, { pointerId: 1 });
  }
  it("requests confirmation only after a full left swipe and suppresses the link click", () => {
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const action = vi.fn(),
      navigate = vi.fn();
    wrapper(
      <SwipeAction action="Complete" onAction={action}>
        <a href="https://example.test/task" onClick={navigate}>
          Task
        </a>
      </SwipeAction>,
    );
    gesture(-motion.gesture.swipeAction.threshold, 0);
    expect(action).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link"));
    expect(navigate).not.toHaveBeenCalled();
  });
  it.each([
    [-10, 0, false],
    [-100, 0, true],
    [0, 100, false],
    [100, 0, false],
  ])(
    "ignores short, cancelled, vertical and opposite gestures (%i,%i,%s)",
    (dx, dy, cancel) => {
      vi.stubGlobal("PointerEvent", TestPointerEvent);
      const action = vi.fn();
      wrapper(
        <SwipeAction action="Complete" onAction={action}>
          <span>Task</span>
        </SwipeAction>,
      );
      gesture(dx, dy, cancel);
      expect(action).not.toHaveBeenCalled();
    },
  );
});
