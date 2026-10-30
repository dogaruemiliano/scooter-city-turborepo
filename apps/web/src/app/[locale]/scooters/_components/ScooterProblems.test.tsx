import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterProblems } from "./ScooterProblems";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: null }),
}));
vi.mock("../../problems/_components/ProblemListItem", () => ({
  ProblemListItem: ({
    problem,
    onToggle,
  }: {
    problem: { title: string };
    onToggle: () => void;
  }) => <button onClick={onToggle}>{problem.title}</button>,
}));
vi.mock("../../problems/_components/ProblemDetailSheet", () => ({
  ProblemDetailSheet: ({
    problem,
    onClose,
  }: {
    problem: { title: string } | null;
    onClose: () => void;
  }) =>
    problem ? (
      <button onClick={onClose}>Close detail: {problem.title}</button>
    ) : null,
}));
const problem = (id: string, status: string) => ({
  id,
  title: id,
  status,
  createdAt: "2026-10-30T08:00:00Z",
});
const open = problem("Open repair", "open");
const progress = problem("Repair in progress", "in_progress");
const resolved = problem("Resolved repair", "resolved");
const dismissed = problem("Dismissed report", "cancelled");

beforeEach(() => {
  mocks.fetch.mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith("/hold")) return { onHold: false, count: 0, blockers: [] };
    const query = new URL(url, "http://localhost").searchParams;
    const status = query.get("status");
    return {
      items:
        status === "open"
          ? [open]
          : status === "in_progress"
            ? [progress]
            : [open, progress, resolved, dismissed],
      page: Number(query.get("page")),
      pageSize: status ? 100 : 25,
      total: status ? 1 : 4,
    };
  });
});
function renderProblems() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterProblems scooterId="scooter" />
    </NextIntlClientProvider>,
  );
}

describe("scooter problem history", () => {
  it("shows active work by default and reveals all statuses in the history sheet", async () => {
    renderProblems();
    await screen.findByText("Open repair");
    expect(screen.getByText("Repair in progress")).toBeInTheDocument();
    expect(screen.queryByText("Resolved repair")).not.toBeInTheDocument();
    expect(screen.queryByText("Dismissed report")).not.toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.filter(([url]) => !url.includes("/hold")),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "View all problems" }));
    const dialog = await screen.findByRole("dialog", { name: "All problems" });
    await within(dialog).findByText("Resolved repair");
    expect(within(dialog).getByText("Dismissed report")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Resolved repair"));
    expect(
      within(dialog).getByText("Close detail: Resolved repair"),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Close detail: Resolved repair"));
    expect(within(dialog).getByText("Dismissed report")).toBeInTheDocument();

    const popup = dialog.closest('[data-slot="bottom-sheet-popup"]') ?? dialog;
    expect(popup.className).toContain("bg-popover");
    for (const surface of [
      popup,
      ...popup.querySelectorAll('[data-slot^="bottom-sheet-"]'),
    ]) {
      expect(surface.className).not.toMatch(/(?:^|\s)bg-background(?:\s|$)/);
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows an active-specific empty state while preserving access to history", async () => {
    mocks.fetch.mockImplementation(async (url: string) =>
      url.endsWith("/hold")
        ? { onHold: false, count: 0, blockers: [] }
        : { items: [], page: 1, pageSize: 100, total: 0 },
    );
    renderProblems();
    expect(
      await screen.findByText("No active problems for this scooter."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View all problems" }),
    ).toBeEnabled();
  });

  it("paginates the full history inside the sheet", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/hold"))
        return { onHold: false, count: 0, blockers: [] };
      const query = new URL(url, "http://localhost").searchParams;
      if (query.has("status"))
        return { items: [], total: 0, pageSize: 25, page: 1 };
      return {
        items: [query.get("page") === "1" ? resolved : dismissed],
        total: 2,
        pageSize: 1,
        page: Number(query.get("page")),
      };
    });
    renderProblems();
    fireEvent.click(screen.getByRole("button", { name: "View all problems" }));
    const dialog = await screen.findByRole("dialog", { name: "All problems" });
    await within(dialog).findByText("Resolved repair");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await within(dialog).findByText("Dismissed report");
    expect(
      within(dialog).queryByText("Resolved repair"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Previous" }));
    await within(dialog).findByText("Resolved repair");
  });

  it("fetches every active page so old history cannot hide active work", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/hold"))
        return { onHold: false, count: 0, blockers: [] };
      const query = new URL(url, "http://localhost").searchParams;
      if (query.get("status") === "in_progress")
        return { items: [], total: 0, pageSize: 1, page: 1 };
      return {
        items: [query.get("page") === "1" ? open : progress],
        total: 2,
        pageSize: 1,
        page: Number(query.get("page")),
      };
    });
    renderProblems();
    expect(await screen.findByText("Repair in progress")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining("page=2&status=open"),
      expect.anything(),
      expect.anything(),
    );
  });
});
