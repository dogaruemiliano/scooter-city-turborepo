import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProblem, ProblemWork, memberName } from "./ProblemForms";
import { ProblemCreateScreen } from "./ProblemCreateScreen";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  user: {
    id: "member",
    effectiveScopes: {
      "problems.read": ["ALL"],
      "problems.create": ["ALL"],
      "problems.assign": ["ALL"],
      "problems.update": ["ALL"],
      "problems.resolve": ["ALL"],
      "problems.reopen": ["ALL"],
    },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.fetch, url: (path: string) => path },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
const problem: v1.problems.Problem = {
  id: "report",
  scooterId: "scooter",
  title: "Broken belt",
  description: "",
  severity: "critical",
  blocksUsage: true,
  holdClearedAt: null,
  photos: [],
  checklist: [],
  sections: ["checklist"],
  buyList: [],
  location: null,
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    model: "Vision",
    brandName: "Honda",
    registrationNumber: null,
  },
  assigneeId: "member",
  assignee: { id: "member", firstName: "Alex", lastName: null },
  reporter: { id: "reporter", firstName: "Sam", lastName: null },
  revision: 3,
  priority: "normal",
  status: "in_progress",
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
  resolvedAt: null,
};
function renderForm(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {node}
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:problem-photo");
  URL.revokeObjectURL = vi.fn();
  mocks.fetch.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.fetch.mockImplementation((url: string) => {
    if (url.includes("eligible-assignees"))
      return Promise.resolve({
        items: [{ id: "other", firstName: "Taylor", lastName: null }],
      });
    if (url === "/v1/problems/locations") return Promise.resolve({ items: [] });
    if (url.includes("/activity"))
      return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 });
    return Promise.resolve(problem);
  });
});

describe("problem release forms", () => {
  it("creates optional sections in one request without submitting while editing them", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    renderForm(<CreateProblem scooterId="scooter" onSaved={saved} />);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Service");
    await user.click(screen.getByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("radio", { name: "Usable" }));
    for (const [section, label, text] of [
      ["Checklist", "New checklist item", "Check brakes"],
      ["Buy list", "Item to buy", "Brake pads"],
    ]) {
      await user.click(screen.getByRole("button", { name: "Add" }));
      await user.click(screen.getByRole("button", { name: section }));
      const region = await screen.findByRole("region", { name: section });
      await user.click(
        within(region).getByRole("button", { name: "Add item" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: label }),
        `${text}{Enter}`,
      );
      await user.click(
        screen.getByRole("button", {
          name: section === "Checklist" ? "Save checklist" : "Save buy list",
        }),
      );
      expect(
        await screen.findByRole("checkbox", { name: text }),
      ).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "Pickup",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Address" }),
      "10 Main Street",
    );
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await screen.findByText("Pickup");
    expect(saved).not.toHaveBeenCalled();
    expect(
      mocks.fetch.mock.calls.filter(
        ([url, , options]) =>
          url === "/v1/problems" && options?.method === "POST",
      ),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Report problem" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        json: expect.objectContaining({
          sections: ["checklist", "buyList", "location"],
          checklist: [
            { id: expect.any(String), text: "Check brakes", completed: false },
          ],
          buyList: [
            { id: expect.any(String), text: "Brake pads", completed: false },
          ],
          location: {
            name: "Pickup",
            address: "10 Main Street",
            savedLocationId: null,
          },
        }),
      }),
    );
  });

  it("never produces a blank member label for older responses missing email", () => {
    expect(
      memberName({ id: "older-account", firstName: null, lastName: null }),
    ).toBe("older-account");
    expect(
      memberName({
        id: "account",
        firstName: "  ",
        lastName: null,
        email: "mechanic@example.com",
      }),
    ).toBe("mechanic@example.com");
  });
  it("shows email rather than an internal ID when an assignee has no profile name", async () => {
    mocks.fetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("eligible-assignees")
          ? {
              items: [
                {
                  id: "internal-user-id",
                  firstName: null,
                  lastName: null,
                  email: "mechanic@example.com",
                },
              ],
            }
          : url.includes("/activity")
            ? { items: [], total: 0, page: 1, pageSize: 25 }
            : problem,
      ),
    );
    renderForm(<ProblemWork problem={problem} reload={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Add assignee" }));
    const sheet = await screen.findByRole("dialog", { name: "Add assignee" });
    expect(
      await within(sheet).findByRole("button", {
        name: "mechanic@example.com",
      }),
    ).toBeInTheDocument();
    expect(within(sheet).queryByText("internal-user-id")).toBeNull();
    expect(
      within(sheet).getByRole("button", { name: "Alex" }),
    ).toBeInTheDocument();
  });

  it("assigns an existing problem from the assignee bottom sheet", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    await user.click(screen.getByRole("button", { name: "Add assignee" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Add assignee",
    });
    await user.click(
      await within(sheet).findByRole("button", { name: "Taylor" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/report/assignee",
        v1.problems.problemSchema,
        { method: "PUT", json: { revision: 3, assigneeId: "other" } },
      ),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledWith(problem));
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet.querySelector(".bg-background")).toBeNull();
  });

  it("requires an explicit blocking decision and submits Usable as false", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    renderForm(<CreateProblem scooterId="scooter" onSaved={saved} />);
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Scratched panel",
    );
    await user.click(screen.getByRole("radio", { name: "Low" }));
    const submit = screen.getByRole("button", { name: "Report problem" });
    const group = screen.getByRole("radiogroup", {
      name: "Scooter condition",
    });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(
      group.closest('[data-slot="field"]')?.previousElementSibling,
    ).toContainElement(screen.getByRole("radiogroup", { name: "Severity" }));
    const functional = within(group).getByRole("radio", { name: "Usable" });
    const defective = within(group).getByRole("radio", { name: "Unusable" });
    expect(functional.nextElementSibling).toHaveClass("text-success");
    expect(defective.nextElementSibling).toHaveClass("text-destructive");
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
      expect(radio).toBeRequired();
    }
    expect(submit).toBeDisabled();
    await user.click(defective);
    expect(defective.nextElementSibling).toHaveClass(
      "bg-destructive",
      "text-destructive-foreground",
    );
    expect(functional.nextElementSibling).not.toHaveClass("bg-success");
    await user.click(functional);
    expect(functional.nextElementSibling).toHaveClass(
      "bg-success",
      "text-success-foreground",
    );
    expect(defective.nextElementSibling).toHaveClass("text-destructive");
    expect(defective.nextElementSibling).not.toHaveClass("bg-destructive");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        json: expect.objectContaining({ blocksUsage: false }),
      }),
    );
  });

  it("reuses the person row in a searchable popover sheet and allows removal", async () => {
    const user = userEvent.setup();
    renderForm(<CreateProblem scooterId="scooter" onSaved={vi.fn()} />);
    const add = screen.getByRole("button", { name: "Add assignee" });
    expect(add).toHaveClass("border-dashed");
    await user.click(add);
    const sheet = await screen.findByRole("dialog", { name: "Add assignee" });
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    for (const surface of sheet.querySelectorAll(
      '[data-slot^="bottom-sheet-"]',
    )) {
      expect(surface).not.toHaveClass("bg-background");
    }
    await user.type(
      within(sheet).getByRole("textbox", { name: "Search assignees" }),
      "missing",
    );
    expect(within(sheet).getByText("No assignees found")).toBeInTheDocument();
    await user.clear(
      within(sheet).getByRole("textbox", { name: "Search assignees" }),
    );
    const option = await within(sheet).findByRole("button", { name: "Taylor" });
    expect(
      option.querySelector('[data-slot="person-row"]'),
    ).toBeInTheDocument();
    await user.click(option);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Taylor").closest('[data-slot="person-row"]'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Taylor" }));
    expect(screen.queryByText("Taylor")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add assignee" }),
    ).toBeInTheDocument();
  });

  it("appends photo previews, removes photos, and releases preview URLs", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm(
      <CreateProblem scooterId="scooter" onSaved={vi.fn()} />,
    );
    const first = new File(["first"], "brake.png", { type: "image/png" });
    const second = new File(["second"], "belt.png", { type: "image/png" });
    const input = screen.getByLabelText("Choose photos", { selector: "input" });
    await user.upload(input, first);
    expect(
      await screen.findByRole("img", { name: "brake.png" }),
    ).toBeInTheDocument();
    await user.upload(input, second);
    expect(
      await screen.findByRole("img", { name: "belt.png" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "brake.png" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit photo: brake.png" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove photo: brake.png" }),
    );
    expect(
      screen.queryByRole("img", { name: "brake.png" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "belt.png" })).toBeInTheDocument();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:problem-photo");
  });

  it("rejects photo collections above the limit without losing the accepted photos", async () => {
    const user = userEvent.setup();
    renderForm(<CreateProblem scooterId="scooter" onSaved={vi.fn()} />);
    const input = screen.getByLabelText("Choose photos", { selector: "input" });
    const valid = new File(["photo"], "brake.png", { type: "image/png" });
    await user.upload(input, valid);
    await user.upload(
      input,
      Array.from(
        { length: 10 },
        (_, index) =>
          new File(["photo"], `${index}.png`, { type: "image/png" }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Up to 10 JPEG, PNG, or WebP photos",
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "brake.png" })).toBeInTheDocument();
  });

  it("reports from a preselected scooter with severity and an assignee, without requiring description or photos", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    renderForm(<CreateProblem scooterId="scooter" onSaved={saved} />);
    expect(
      screen.queryByRole("combobox", { name: "Scooter" }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Broken belt",
    );
    await user.click(screen.getByRole("radio", { name: "Critical" }));
    expect(screen.getByRole("radio", { name: "Critical" })).toBeChecked();
    for (const [label, color] of [
      ["Low", "low"],
      ["Medium", "medium"],
      ["High", "high"],
      ["Critical", "critical"],
    ]) {
      const segment = screen.getByRole("radio", {
        name: label,
      }).nextElementSibling;
      if (label === "Critical") {
        expect(segment).toHaveClass(`bg-severity-${color}`);
      } else {
        expect(segment).toHaveClass(`text-severity-${color}`);
        expect(segment).not.toHaveClass(`bg-severity-${color}`);
      }
    }
    await user.click(screen.getByRole("radio", { name: "Low" }));
    expect(
      screen.getByRole("radio", { name: "Low" }).nextElementSibling,
    ).toHaveClass("bg-severity-low");
    expect(
      screen.getByRole("radio", { name: "Critical" }).nextElementSibling,
    ).toHaveClass("text-severity-critical");
    expect(
      screen.getByRole("radio", { name: "Critical" }).nextElementSibling,
    ).not.toHaveClass("bg-severity-critical");
    await user.click(screen.getByRole("radio", { name: "Critical" }));
    await user.click(screen.getByRole("radio", { name: "Unusable" }));
    await user.click(screen.getByRole("button", { name: "Add assignee" }));
    await user.click(await screen.findByRole("button", { name: "Taylor" }));
    await user.click(screen.getByRole("button", { name: "Report problem" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems",
      expect.anything(),
      {
        method: "POST",
        json: {
          scooterId: "scooter",
          title: "Broken belt",
          severity: "critical",
          blocksUsage: true,
          description: "",
          photos: [],
          assigneeId: "other",
          sections: [],
          checklist: [],
          buyList: [],
          location: null,
        },
      },
    );
  });

  it("opens completion in a distinct bottom sheet on the compact detail screen", async () => {
    const user = userEvent.setup();
    renderForm(
      <ProblemWork
        compact
        problem={{ ...problem, blocksUsage: false }}
        reload={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("textbox", { name: "Resolution notes" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit report" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Complete task" }));
    const sheet = await screen.findByRole("dialog", { name: "Complete task" });
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    const submit = within(sheet).getByRole("button", {
      name: "Resolve problem",
    });
    expect(submit).toBeDisabled();
    await user.type(
      within(sheet).getByRole("textbox", { name: "Resolution notes" }),
      "Brake pads replaced",
    );
    await user.click(submit);
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/report/resolve",
        expect.anything(),
        {
          method: "POST",
          json: { revision: 3, resolutionNotes: "Brake pads replaced" },
        },
      ),
    );
  });

  it("adds checklist items in its editor and saves them", async () => {
    const user = userEvent.setup();
    renderForm(<ProblemWork compact problem={problem} reload={vi.fn()} />);
    const checklist = screen.getByRole("region", { name: "Checklist" });
    expect(within(checklist).queryByRole("textbox")).toBeNull();
    await user.click(
      within(checklist).getByRole("button", { name: "Add item" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit checklist" });
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    const input = within(sheet).getByRole("textbox", {
      name: "New checklist item",
    });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "Install pads{Enter}");
    expect(within(sheet).getByText("Install pads")).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole("button", { name: "Save checklist" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/report",
        expect.anything(),
        {
          method: "PATCH",
          json: {
            revision: 3,
            checklist: [
              {
                id: expect.any(String),
                text: "Install pads",
                completed: false,
              },
            ],
          },
        },
      ),
    );
  });

  it("lets update-only administrators cancel a held problem from More actions", async () => {
    const user = userEvent.setup();
    const previous = mocks.user.effectiveScopes["problems.resolve"];
    mocks.user.effectiveScopes["problems.resolve"] = [];
    try {
      renderForm(<ProblemWork compact problem={problem} reload={vi.fn()} />);
      expect(
        screen.queryByRole("button", { name: "Complete task" }),
      ).toBeNull();
      await user.click(
        screen.getByRole("button", { name: "More actions and activity" }),
      );
      const sheet = await screen.findByRole("dialog", {
        name: "More actions and activity",
      });
      expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
      // Controls inherit the temporary surface; no full-sheet page override.
      expect(
        sheet.querySelector('[data-slot="bottom-sheet-body"].bg-background'),
      ).toBeNull();
      await user.click(
        within(sheet).getByRole("combobox", {
          name: "When closing this report",
        }),
      );
      await user.click(
        await screen.findByRole("option", {
          name: "Keep the maintenance hold",
        }),
      );
      await user.click(
        within(sheet).getByRole("button", { name: "Dismiss report" }),
      );
      await user.click(
        within(sheet).getByRole("button", { name: "Confirm changes" }),
      );
      await waitFor(() =>
        expect(mocks.fetch).toHaveBeenCalledWith(
          "/v1/problems/report/cancel",
          expect.anything(),
          {
            method: "POST",
            json: { revision: 3, clearMaintenanceHold: false },
          },
        ),
      );
    } finally {
      mocks.user.effectiveScopes["problems.resolve"] = previous;
    }
  });

  it("requires a resolution note and an explicit hold decision, then retains the hold", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    const resolve = screen.getByRole("button", { name: "Resolve problem" });
    expect(resolve).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Resolution notes" }),
      "Belt replaced; safety inspection pending",
    );
    expect(resolve).toBeDisabled();
    await user.click(
      screen.getByRole("combobox", { name: "When closing this report" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Keep the maintenance hold" }),
    );
    await user.click(resolve);
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/report/resolve",
      expect.anything(),
      {
        method: "POST",
        json: {
          revision: 3,
          resolutionNotes: "Belt replaced; safety inspection pending",
          clearMaintenanceHold: false,
        },
      },
    );
  });

  it("adds an individual comment using the current revision", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Inspected drivetrain",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/report/comments",
      expect.anything(),
      { method: "POST", json: { revision: 3, body: "Inspected drivetrain" } },
    );
  });

  it("keeps an explicit clearance action and previous resolution visible on a closed blocker", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(
      <ProblemWork
        problem={{
          ...problem,
          status: "resolved",
          resolutionNotes: "Belt replaced",
        }}
        reload={reload}
      />,
    );
    expect(screen.getByText("Belt replaced")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resolve problem" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear this problem’s hold" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/report/hold",
      expect.anything(),
      { method: "PUT", json: { revision: 3, blocksUsage: false } },
    );
  });

  it("offers an explicit reload when a stale comment is rejected", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    mocks.fetch.mockImplementation((url: string) => {
      if (url.endsWith("/comments"))
        return Promise.reject(new ApiError(409, "Problem changed"));
      if (url.includes("eligible-assignees"))
        return Promise.resolve({ items: [] });
      return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 });
    });
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Stale update",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(
      await screen.findByText(messages.en.workspace.conflict),
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("problem creation screen picker", () => {
  it("selects a detailed scooter in a secondary sheet and preserves the report draft", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/v1/scooters"))
        return {
          items: [
            {
              id: "seven",
              fleetNumber: 7,
              brand: "KYMCO",
              brandCode: "KYM",
              model: "Agility 50",
              registrationNumber: "B 123 ABC",
              vin: "VIN7",
              coverUrl: "/cover.jpg",
              problemSeverityCounts: {
                low: 2,
                moderate: 0,
                high: 1,
                critical: 3,
                unknown: 0,
              },
            },
            {
              id: "eight",
              fleetNumber: 8,
              brandCode: "IVA",
              brand: "IVA",
              model: "JL50",
              registrationNumber: null,
              vin: "VIN8",
              coverUrl: null,
              problemSeverityCounts: {
                low: 0,
                moderate: 0,
                high: 0,
                critical: 0,
                unknown: 0,
              },
            },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
        };
      return { items: [] };
    });
    renderForm(<CreateProblem onSaved={vi.fn()} />);
    const parent = await screen.findByRole("form", { name: "Report problem" });
    await user.type(
      within(parent).getByRole("textbox", { name: "Title" }),
      "Rear brake slipping",
    );
    await user.click(within(parent).getByRole("button", { name: /^Scooter/ }));
    const picker = await screen.findByRole("dialog", { name: "Scooter" });
    for (const dialog of [picker]) {
      expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
      for (const surface of dialog.querySelectorAll(
        '[data-slot="bottom-sheet-content"], [data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-footer"]',
      )) {
        expect(surface).not.toHaveClass("bg-background");
      }
    }
    expect(
      within(picker).getByRole("img", { name: "Critical: 3 problems" }),
    ).toBeInTheDocument();
    expect(
      within(picker).getByRole("img", { name: "Low: 2 problems" }),
    ).toBeInTheDocument();
    expect(within(picker).getByText("—")).toBeInTheDocument();
    expect(within(picker).getByText("No active problems")).toBeInTheDocument();
    await user.type(
      within(picker).getByRole("textbox", {
        name: "Search fleet number, plate or model",
      }),
      "123 ABC",
    );
    expect(within(picker).queryByText("008")).not.toBeInTheDocument();
    await user.click(
      within(picker).getByRole("button", {
        name: "007 KYM · B 123 ABC · KYMCO Agility 50",
      }),
    );
    await waitFor(() =>
      expect(screen.queryAllByRole("dialog")).toHaveLength(0),
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Rear brake slipping",
    );
    expect(screen.getByRole("button", { name: /^Scooter/ })).toHaveTextContent(
      "007 KYM",
    );
  });
});

describe("dedicated creation screen", () => {
  it("saves a preselected scooter report and returns to its details", async () => {
    const user = userEvent.setup();
    renderForm(<ProblemCreateScreen scooterId="scooter" />);
    const submit = screen.getByRole("button", { name: "Report problem" });
    expect(submit).toHaveClass("w-full");
    expect(submit.closest('[data-slot="problem-create-actions"]')).toHaveClass(
      "static",
      "bottom-auto",
    );
    expect(
      screen.queryByRole("heading", { name: "Report problem" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Broken belt",
    );
    await user.click(screen.getByRole("radio", { name: "Critical" }));
    await user.click(screen.getByRole("radio", { name: "Usable" }));
    expect(submit.closest('[data-slot="problem-create-actions"]')).toHaveClass(
      "sticky",
      "animate-in",
      "motion-reduce:animate-none",
    );
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    expect(submit.closest('[data-slot="problem-create-actions"]')).toHaveClass(
      "static",
    );
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Broken belt",
    );
    await user.click(screen.getByRole("button", { name: "Report problem" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter"),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("cancels to the fleet list without creating a report", async () => {
    mocks.fetch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });
    const user = userEvent.setup();
    renderForm(<ProblemCreateScreen />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.push).toHaveBeenCalledWith("/en/problems");
    expect(
      mocks.fetch.mock.calls.some(
        ([, , options]) => options?.method === "POST",
      ),
    ).toBe(false);
  });
});
