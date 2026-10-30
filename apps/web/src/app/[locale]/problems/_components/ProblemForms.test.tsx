import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProblem, ProblemWork, memberName } from "./ProblemForms";
import { ProblemEditScreen } from "./ProblemEditScreen";
import { ProblemCreateScreen } from "./ProblemCreateScreen";
import { AssigneeSelect } from "./AssigneeSelect";
import { ProblemAssignment } from "./ProblemAssignment";

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
  difficulty: "hard",
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
        items: [
          {
            id: "other",
            firstName: "Taylor",
            lastName: null,
            roles: ["Mechanic"],
          },
          {
            id: "second",
            firstName: "Jordan",
            lastName: null,
            roles: ["Mechanic"],
          },
        ],
      });
    if (url === "/v1/problems/locations") return Promise.resolve({ items: [] });
    if (url.includes("/activity"))
      return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 });
    return Promise.resolve(problem);
  });
});

describe("problem release forms", () => {
  it("creates a todo using the issue form without scooter selection or condition", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    renderForm(<CreateProblem todo onSaved={saved} />);
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/eligible-assignees?kind=todo",
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(screen.queryByText("Select scooter")).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.workspace.problems.scooterCondition),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", {
        name: messages.en.workspace.problems.reportTitle,
      }),
      "Order supplies",
    );
    expect(
      screen.queryByRole("radiogroup", {
        name: messages.en.workspace.problems.difficulty,
      }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add todo" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const request = mocks.fetch.mock.calls.find(
      ([url]) => url === "/v1/problems",
    );
    expect(request?.[2].json).not.toHaveProperty("difficulty");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        json: expect.objectContaining({
          scooterId: null,
          title: "Order supplies",
          blocksUsage: false,
        }),
      }),
    );
  });

  it("edits todos without a difficulty control or difficulty in the request", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(
      <CreateProblem
        todo
        initialProblem={{ ...problem, scooterId: null, scooter: null }}
        onSaved={reload}
      />,
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/eligible-assignees?kind=todo",
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(
      screen.queryByRole("combobox", {
        name: messages.en.workspace.problems.difficulty,
      }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const request = mocks.fetch.mock.calls.find(
      ([url, , options]) =>
        url === "/v1/problems/report" && options?.method === "PATCH",
    );
    expect(request?.[2].json).not.toHaveProperty("difficulty");
  });

  it.each(["todo", "issue"])(
    "opens %s editing from the more actions popup",
    async (kind) => {
      const todo = kind === "todo";
      renderForm(
        <ProblemWork
          compact
          problem={{
            ...problem,
            ...(todo ? { scooterId: null, scooter: null } : {}),
          }}
          reload={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "More actions" }));
      const menu = await screen.findByRole("menu", { name: "More actions" });
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["Edit", "Pause work", "Dismiss"]);
      expect(within(menu).queryByRole("textbox")).toBeNull();
      await user.click(within(menu).getByRole("menuitem", { name: "Edit" }));
      expect(mocks.push).toHaveBeenCalledWith(
        `/en/${todo ? "todos" : "problems"}/report/edit`,
      );
    },
  );

  it.each(["todo", "issue"])(
    "prefills the shared form and saves %s edits in one request",
    async (kind) => {
      const todo = kind === "todo";
      const original = mocks.fetch.getMockImplementation()!;
      const existing = {
        ...problem,
        description: "Existing description",
        ...(todo ? { scooterId: null, scooter: null } : {}),
      };
      mocks.fetch.mockImplementation((url, schema, options) =>
        url === "/v1/problems/report"
          ? Promise.resolve({ ...existing, ...options?.json })
          : original(url, schema, options),
      );
      renderForm(<ProblemEditScreen id="report" />);
      const title = await screen.findByRole("textbox", { name: "Title" });
      expect(title).toHaveValue("Broken belt");
      expect(
        screen.getByRole("textbox", { name: "Description (optional)" }),
      ).toHaveValue("Existing description");
      expect(screen.getByText("Alex")).toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Report problem" })).toBeNull();
      if (!todo) {
        expect(screen.getByRole("radio", { name: "Hard" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Unusable" })).toBeChecked();
        expect(screen.getByText(/007 HON/)).toBeInTheDocument();
      } else expect(screen.queryByRole("radiogroup")).toBeNull();
      const user = userEvent.setup();
      await user.clear(title);
      await user.type(title, "Updated title");
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(
          `/en/${todo ? "todos" : "problems"}/report`,
        ),
      );
      const writes = mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "PATCH",
      );
      expect(writes).toHaveLength(1);
      expect(writes[0]?.[2].json).toMatchObject({
        title: "Updated title",
        description: "Existing description",
        revision: 3,
      });
      expect(writes[0]?.[2].json).not.toHaveProperty("scooterId");
      expect(writes[0]?.[2].json).not.toHaveProperty("assigneeIds");
      if (todo) expect(writes[0]?.[2].json).not.toHaveProperty("difficulty");
    },
  );

  it("preserves entered todo edits after a failed save", async () => {
    const saved = vi.fn();
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url, schema, options) =>
      options?.method === "PATCH"
        ? Promise.reject(new Error("Save failed"))
        : original(url, schema, options),
    );
    renderForm(
      <CreateProblem
        todo
        initialProblem={{ ...problem, scooterId: null, scooter: null }}
        onSaved={saved}
      />,
    );
    const user = userEvent.setup();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Keep these edits");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(title).toHaveValue("Keep these edits");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(saved).not.toHaveBeenCalled();
  });

  it("requires reloading a stale todo before saving again", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    let revision = 3;
    mocks.fetch.mockImplementation((url, schema, options) => {
      if (url === "/v1/problems/report") {
        if (options?.method === "PATCH") {
          revision = 4;
          return Promise.reject(new ApiError(409, "Changed elsewhere"));
        }
        return Promise.resolve({
          ...problem,
          scooterId: null,
          scooter: null,
          revision,
        });
      }
      return original(url, schema, options);
    });
    renderForm(<ProblemEditScreen id="report" />);
    const title = await screen.findByRole("textbox", { name: "Title" });
    const user = userEvent.setup();
    await user.clear(title);
    await user.type(title, "Unsaved change");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This record changed while you were editing",
    );
    expect(title).toHaveValue("Unsaved change");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Reload latest version" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Broken belt",
    );
  });

  it("cancels todo editing without writing and returns to its details", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url, schema, options) =>
      url === "/v1/problems/report"
        ? Promise.resolve({ ...problem, scooterId: null, scooter: null })
        : original(url, schema, options),
    );
    renderForm(<ProblemEditScreen id="report" />);
    const user = userEvent.setup();
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, " edited");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.push).toHaveBeenCalledWith("/en/todos/report");
    expect(
      mocks.fetch.mock.calls.some(
        ([, , options]) => options?.method === "PATCH",
      ),
    ).toBe(false);
  });

  it("uses todo copy in dismissal confirmation without duplicate creator attribution", async () => {
    renderForm(
      <ProblemWork
        compact
        problem={{
          ...problem,
          scooterId: null,
          scooter: null,
          reporter: { id: "creator", firstName: "Chris", lastName: null },
        }}
        reload={vi.fn()}
      />,
    );
    expect(screen.queryByText("Created by Chris")).not.toBeInTheDocument();
    expect(screen.queryByText(/Reported by/)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dismiss" }));
    const sheet = await screen.findByRole("dialog", { name: "Dismiss todo" });
    expect(sheet).toHaveTextContent(
      "Dismiss this todo? Its history will be kept.",
    );
    expect(sheet).not.toHaveTextContent(/report/i);
  });

  it("returns to the todo list after cancelling todo creation", async () => {
    const user = userEvent.setup();
    renderForm(<ProblemCreateScreen todo />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.push).toHaveBeenCalledWith("/en/todos");
  });

  it.each(["dismiss", "resolve", "reopen", "clear hold"] as const)(
    "invalidates cached scooter status after %s succeeds",
    async (action) => {
      const user = userEvent.setup();
      const reload = vi.fn();
      let finish!: (value: v1.problems.Problem) => void;
      const response = new Promise<v1.problems.Problem>((resolve) => {
        finish = resolve;
      });
      const original = mocks.fetch.getMockImplementation()!;
      mocks.fetch.mockImplementation((url, ...args) =>
        ["/cancel", "/resolve", "/reopen", "/hold"].some((path) =>
          url.endsWith(path),
        )
          ? response
          : original(url, ...args),
      );
      renderForm(
        <ProblemWork
          problem={
            action === "reopen" ? { ...problem, status: "cancelled" } : problem
          }
          reload={reload}
        />,
      );
      if (action === "dismiss") {
        await user.click(screen.getByRole("button", { name: "More actions" }));
        await user.click(
          await screen.findByRole("menuitem", { name: "Dismiss" }),
        );
        await user.click(
          screen.getByRole("button", { name: "Confirm changes" }),
        );
      } else if (action === "resolve") {
        await user.type(
          screen.getByRole("textbox", { name: "Resolution notes" }),
          "Fixed belt",
        );
        await user.click(screen.getByRole("button", { name: "Complete task" }));
      } else if (action === "reopen") {
        await user.click(
          screen.getByRole("button", {
            name: messages.en.workspace.problems.reopen,
          }),
        );
        await user.type(
          screen.getByRole("textbox", { name: "Reason for reopening" }),
          "Noise returned",
        );
        await user.click(
          screen
            .getAllByRole("button", {
              name: messages.en.workspace.problems.reopen,
            })
            .at(-1)!,
        );
      } else {
        await user.click(
          screen.getByRole("button", { name: "Clear this problem’s hold" }),
        );
      }
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      const updated: v1.problems.Problem = {
        ...problem,
        revision: 4,
        status:
          action === "dismiss"
            ? "cancelled"
            : action === "resolve"
              ? "resolved"
              : "open",
        ...(action === "clear hold"
          ? {
              status: problem.status,
              blocksUsage: false,
              holdClearedAt: "2026-10-30T08:00:00Z",
            }
          : {}),
      };
      await act(async () => finish(updated));
      await waitFor(() => expect(reload).toHaveBeenCalledWith(updated));
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );

  it("preserves the cached scooter state when dismissal fails", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url, ...args) =>
      url.endsWith("/cancel")
        ? Promise.reject(new ApiError(409, "Problem changed"))
        : original(url, ...args),
    );
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dismiss" }));
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This record changed while you were editing",
    );
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("collapses a removed assignee and keeps keyboard focus in the list", async () => {
    function Picker() {
      const [value, setValue] = useState(["a", "b"]);
      return (
        <AssigneeSelect
          multiple
          value={value}
          onValueChange={setValue}
          members={[
            { id: "a", firstName: "Alex", lastName: null },
            { id: "b", firstName: "Sam", lastName: null },
          ]}
        />
      );
    }
    renderForm(<Picker />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Remove Alex" }));
    const exiting = screen
      .getByText("Alex")
      .closest('[data-slot="assignee-presence"]');
    expect(exiting).toHaveAttribute("aria-hidden", "true");
    expect(exiting).toHaveClass(
      "grid-rows-[1fr]",
      "motion-reduce:transition-none",
    );
    expect(exiting).toHaveAttribute("data-removal-phase", "windup");
    expect(exiting?.querySelector(".translate-x-1\\.5")).toHaveClass(
      "opacity-100",
    );
    expect(exiting?.firstElementChild).toHaveClass("overflow-visible");
    expect(screen.getByRole("button", { name: "Remove Sam" })).toHaveFocus();
    await waitFor(() =>
      expect(exiting).toHaveAttribute("data-removal-phase", "leaving"),
    );
    expect(exiting).toHaveClass("grid-rows-[0fr]");
    expect(exiting?.querySelector(".opacity-0")).toHaveClass("-translate-x-12");
    await waitFor(() =>
      expect(screen.queryByText("Alex")).not.toBeInTheDocument(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Remove Sam" }));
    expect(screen.getByRole("button", { name: "Add assignee" })).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryByText("Sam")).not.toBeInTheDocument(),
    );
  });

  it("shows name and role without email in the assignee selection sheet", async () => {
    renderForm(
      <AssigneeSelect
        value=""
        onValueChange={vi.fn()}
        members={[
          {
            id: "mechanic",
            email: "alex@example.com",
            firstName: "Alex",
            lastName: "Smith",
            roles: ["Mechanic"],
          },
        ]}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Add assignee" }));
    const sheet = await screen.findByRole("dialog", { name: "Add assignee" });
    const option = within(sheet).getByRole("button", { name: "Alex Smith" });
    expect(
      within(option).queryByText("alex@example.com"),
    ).not.toBeInTheDocument();
    const name = within(option).getByText("Alex Smith");
    const role = within(option).getByText("Mechanic");
    expect(name.parentElement).toHaveClass("items-start", "text-left");
    expect(
      name.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(role).toHaveClass("text-warning-text");
  });

  it.each([
    ["member", "Super Admin", "text-personal"],
    ["another-admin", "Admin", "text-info"],
  ])(
    "shows the viewer-appropriate designation for %s",
    async (id, label, color) => {
      renderForm(
        <AssigneeSelect
          multiple
          value={[]}
          onValueChange={vi.fn()}
          members={[
            {
              id,
              firstName: "Alex",
              lastName: null,
              isSuperAdmin: true,
              roles: ["Admin"],
            },
          ]}
        />,
      );
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Add assignee" }));
      const sheet = await screen.findByRole("dialog", { name: "Add assignee" });
      expect(within(sheet).getByText(label)).toHaveClass(color);
      expect(
        within(sheet).queryByText(label === "Admin" ? "Super Admin" : "Admin"),
      ).toBeNull();
    },
  );

  it("creates optional sections in one request without submitting while editing them", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    renderForm(<CreateProblem scooterId="scooter" onSaved={saved} />);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Service");
    await user.click(screen.getByRole("radio", { name: "Easy" }));
    await user.click(screen.getByRole("radio", { name: "Usable" }));
    for (const [section, label, text] of [
      ["Checklist", "New checklist item", "Check brakes"],
      ["Buy list", "Item to buy", "Brake pads"],
    ]) {
      await user.click(screen.getByRole("button", { name: "Add" }));
      await user.click(screen.getByRole("button", { name: section }));
      await screen.findByRole("dialog", {
        name: section === "Checklist" ? "Create checklist" : "Create buy list",
      });
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
      .click(screen.getByRole("button", { name: "Manage assignment" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Manage assignment",
    });
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

  it("keeps a single assignment edit action beside the section title, outside the user rows", async () => {
    renderForm(
      <ProblemWork
        problem={{
          ...problem,
          assignees: [
            problem.assignee!,
            { id: "other", firstName: "Taylor", lastName: null },
          ],
        }}
        reload={vi.fn()}
      />,
    );
    const assignment = screen.getByRole("region", { name: "Assignment" });
    const rows = assignment.querySelectorAll('[data-slot="assignee-user-row"]');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveClass("rounded-2xl", "border", "bg-card", "p-4");
      expect(within(row as HTMLElement).queryByRole("button")).toBeNull();
    }
    const edit = within(assignment).getByRole("button", {
      name: "Manage assignment",
    });
    expect(edit.parentElement).toHaveClass(
      "flex",
      "items-center",
      "justify-between",
    );
    expect(edit.parentElement).toContainElement(
      within(assignment).getByRole("heading", { name: "Assignment" }),
    );
    expect(edit.querySelector("svg")).toHaveClass("lucide-pencil");
    await userEvent.setup().click(edit);
    const sheet = await screen.findByRole("dialog", {
      name: "Manage assignment",
    });
    for (const name of ["Alex", "Taylor"])
      expect(within(sheet).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
  });

  it.each([
    {
      label: "read-only",
      mayAssign: false,
      busy: false,
      status: "in_progress" as const,
    },
    {
      label: "closed",
      mayAssign: true,
      busy: false,
      status: "resolved" as const,
    },
    {
      label: "busy",
      mayAssign: true,
      busy: true,
      status: "in_progress" as const,
    },
  ])("protects assignment edits when $label", ({ mayAssign, busy, status }) => {
    renderForm(
      <ProblemAssignment
        problem={{ ...problem, status }}
        userId="member"
        mayAssign={mayAssign}
        mayClaim={false}
        busy={busy}
        members={[]}
        loading={false}
        error={null}
        saveError={null}
        onRetry={vi.fn()}
        onAssign={vi.fn()}
        onClaim={vi.fn()}
      />,
    );
    const edit = screen.queryByRole("button", {
      name: "Manage assignment",
    });
    if (busy) expect(edit).toBeDisabled();
    else expect(edit).not.toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it.each(["todo", "issue"])(
    "keeps %s assignee order stable until the sheet is reopened",
    async (kind) => {
      const user = userEvent.setup();
      const members = [
        { id: "a", firstName: "Alex", lastName: null },
        { id: "b", firstName: "Blake", lastName: null },
        { id: "c", firstName: "Casey", lastName: null },
      ];
      function Assignment() {
        const [ids, setIds] = useState(["b"]);
        return (
          <ProblemAssignment
            problem={{
              ...problem,
              scooterId: kind === "todo" ? null : problem.scooterId,
              scooter: kind === "todo" ? null : problem.scooter,
              assigneeId: ids[0] ?? null,
              assignee: members.find(({ id }) => id === ids[0]) ?? null,
              assignees: members.filter(({ id }) => ids.includes(id)),
            }}
            mayAssign
            mayClaim={false}
            busy={false}
            members={members}
            loading={false}
            error={null}
            saveError={null}
            onRetry={vi.fn()}
            onClaim={vi.fn()}
            onAssign={(nextIds) => {
              setIds(nextIds);
              return Promise.resolve(true);
            }}
          />
        );
      }
      renderForm(<Assignment />);
      await user.click(
        screen.getByRole("button", { name: "Manage assignment" }),
      );
      const sheet = await screen.findByRole("dialog", {
        name: "Manage assignment",
      });
      const order = () =>
        Array.from(sheet.querySelectorAll("button[aria-pressed]")).map(
          (button) => button.getAttribute("aria-label"),
        );
      expect(order()).toEqual(["Blake", "Alex", "Casey"]);
      await user.click(within(sheet).getByRole("button", { name: "Blake" }));
      expect(
        within(sheet).getByRole("button", { name: "Blake" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(order()).toEqual(["Blake", "Alex", "Casey"]);
      await user.click(within(sheet).getByRole("button", { name: "Casey" }));
      expect(order()).toEqual(["Blake", "Alex", "Casey"]);
      expect(
        within(sheet).queryByRole("textbox", { name: "Search assignees" }),
      ).not.toBeInTheDocument();
      await user.click(
        within(sheet).getByRole("button", { name: "Save assignees" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await user.click(
        screen.getByRole("button", { name: "Manage assignment" }),
      );
      const reopened = await screen.findByRole("dialog", {
        name: "Manage assignment",
      });
      expect(
        Array.from(reopened.querySelectorAll("button[aria-pressed]")).map(
          (button) => button.getAttribute("aria-label"),
        ),
      ).toEqual(["Casey", "Alex", "Blake"]);
    },
  );

  it.each([
    ["picker", 2],
    ["picker", 5],
    ["picker", 6],
    ["manage", 2],
    ["manage", 5],
    ["manage", 6],
  ] as const)(
    "shows assignee search in %s only above five choices (%i)",
    async (surface, count) => {
      const members = Array.from({ length: count }, (_, i) => ({
        id: `person-${i}`,
        firstName: ["Alex", "Blake", "Casey", "Drew", "Evan", "Zoe"][i]!,
        lastName: null,
      }));
      renderForm(
        surface === "picker" ? (
          <AssigneeSelect
            multiple
            value={[]}
            onValueChange={vi.fn()}
            members={members}
          />
        ) : (
          <ProblemAssignment
            problem={{
              ...problem,
              assigneeId: members[0]!.id,
              assignee: members[0]!,
              assignees: [members[0]!],
            }}
            mayAssign
            mayClaim={false}
            busy={false}
            members={members}
            loading={false}
            error={null}
            saveError={null}
            onRetry={vi.fn()}
            onClaim={vi.fn()}
            onAssign={vi.fn()}
          />
        ),
      );
      const user = userEvent.setup();
      const label = surface === "picker" ? "Add assignee" : "Manage assignment";
      await user.click(screen.getByRole("button", { name: label }));
      const sheet = await screen.findByRole("dialog", { name: label });
      const search = within(sheet).queryByRole("textbox", {
        name: "Search assignees",
      });
      if (count <= 5) {
        expect(search).not.toBeInTheDocument();
        expect(
          within(sheet).getByRole("button", { name: "Alex" }),
        ).toBeInTheDocument();
      } else {
        expect(search).toBeInTheDocument();
        await user.type(search!, "Zoe");
        expect(search).toBeInTheDocument();
        expect(
          within(sheet).getByRole("button", { name: "Zoe" }),
        ).toBeInTheDocument();
        expect(
          within(sheet).queryByRole("button", { name: "Alex" }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it("assigns an existing problem from the assignee bottom sheet", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    await user.click(screen.getByRole("button", { name: "Manage assignment" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Manage assignment",
    });
    await user.click(
      await within(sheet).findByRole("button", { name: "Taylor" }),
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Save assignees" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/problems/report/assignee",
        v1.problems.problemSchema,
        {
          method: "PUT",
          json: { revision: 3, assigneeIds: ["member", "other"] },
        },
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
    await user.click(screen.getByRole("radio", { name: "Easy" }));
    const submit = screen.getByRole("button", { name: "Report problem" });
    const group = screen.getByRole("radiogroup", {
      name: "Scooter condition",
    });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(
      group.closest('[data-slot="field"]')?.previousElementSibling,
    ).toContainElement(screen.getByRole("radiogroup", { name: "Difficulty" }));
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
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url, ...args) =>
      url.includes("eligible-assignees")
        ? Promise.resolve({
            items: [
              {
                id: "other",
                firstName: "Taylor",
                lastName: null,
                roles: ["Mechanic"],
              },
              {
                id: "second",
                firstName: "Jordan",
                lastName: null,
                roles: ["Mechanic"],
              },
              ...Array.from({ length: 4 }, (_, i) => ({
                id: `extra-${i}`,
                firstName: `Person ${i}`,
                lastName: null,
                roles: ["Mechanic"],
              })),
            ],
          })
        : original(url, ...args),
    );

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
    expect(within(option).getByText("Mechanic")).toBeInTheDocument();
    expect(option.querySelector(".lucide-user-plus")).toBeNull();
    expect(
      option.querySelector('[data-slot="person-row"]'),
    ).toBeInTheDocument();
    await user.click(option);
    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(option.querySelectorAll("svg.lucide-check")).toHaveLength(1);
    expect(option.querySelector(".lucide-user-plus")).toBeNull();
    const reopened = sheet;
    const secondOption = within(sheet).getByRole("button", { name: "Jordan" });
    await user.click(secondOption);
    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(secondOption).toHaveAttribute("aria-pressed", "true");
    await user.click(within(reopened).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Remove Taylor" }));
    await waitFor(() =>
      expect(screen.queryByText("Taylor")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add assignee" }),
    ).toBeInTheDocument();
  });

  it.each([false, true])(
    "opens the native picker directly in the creation form (todo=%s)",
    async (todo) => {
      const saved = vi.fn();
      renderForm(
        <CreateProblem
          todo={todo}
          scooterId={todo ? undefined : "scooter"}
          onSaved={saved}
        />,
      );
      const user = userEvent.setup();
      const input = screen.getByLabelText("Choose photos", {
        selector: "input",
      });
      const click = vi.spyOn(input, "click");
      await user.click(screen.getByRole("button", { name: "Choose photos" }));
      expect(click).toHaveBeenCalledOnce();
      expect(input).toHaveAttribute("accept", "image/*");
      expect(input).toHaveAttribute("multiple");
      expect(input).not.toHaveAttribute("capture");
      expect(screen.queryByRole("dialog")).toBeNull();
      const file = new File(["photo"], "task.jpg", { type: "image/jpeg" });
      await user.upload(input, file);
      expect(
        await screen.findByRole("img", { name: "task.jpg" }),
      ).toBeInTheDocument();
      expect(saved).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.change(input, { target: { files: [] } });
      expect(screen.getByRole("img", { name: "task.jpg" })).toBeInTheDocument();
    },
  );

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

  it("reports from a preselected scooter with difficulty and an assignee, without requiring description or photos", async () => {
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
    await user.click(screen.getByRole("radio", { name: "Hard" }));
    expect(screen.getByRole("radio", { name: "Hard" })).toBeChecked();
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Difficulty" }),
      ).getAllByRole("radio"),
    ).toHaveLength(3);
    for (const [label, color] of [
      ["Easy", "easy"],
      ["Medium", "medium"],
      ["Hard", "hard"],
    ]) {
      const segment = screen.getByRole("radio", {
        name: label,
      }).nextElementSibling;
      if (label === "Hard") {
        expect(segment).toHaveClass(`bg-difficulty-${color}`);
      } else {
        expect(segment).toHaveClass(`text-difficulty-${color}`);
        expect(segment).not.toHaveClass(`bg-difficulty-${color}`);
      }
    }
    await user.click(screen.getByRole("radio", { name: "Easy" }));
    expect(
      screen.getByRole("radio", { name: "Easy" }).nextElementSibling,
    ).toHaveClass("bg-difficulty-easy");
    expect(
      screen.getByRole("radio", { name: "Hard" }).nextElementSibling,
    ).toHaveClass("text-difficulty-hard");
    expect(
      screen.getByRole("radio", { name: "Hard" }).nextElementSibling,
    ).not.toHaveClass("bg-difficulty-hard");
    await user.click(screen.getByRole("radio", { name: "Hard" }));
    await user.click(screen.getByRole("radio", { name: "Unusable" }));
    await user.click(screen.getByRole("button", { name: "Add assignee" }));
    await user.click(await screen.findByRole("button", { name: "Taylor" }));
    await user.click(screen.getByRole("button", { name: "Jordan" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Done",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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
          difficulty: "hard",
          blocksUsage: true,
          description: "",
          photos: [],
          assigneeIds: ["other", "second"],
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
    renderForm(<ProblemWork compact problem={problem} reload={vi.fn()} />);
    expect(
      screen.queryByRole("textbox", { name: "Resolution notes" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit report" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Complete task" }));
    const sheet = await screen.findByRole("dialog", { name: "Complete task" });
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    expect(
      within(sheet).queryByRole("combobox", {
        name: "When closing this report",
      }),
    ).toBeNull();
    const submit = within(sheet).getByRole("button", {
      name: "Complete task",
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
    expect(screen.queryByRole("region", { name: "Checklist" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Checklist" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Create checklist",
    });
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
      await user.click(screen.getByRole("button", { name: "More actions" }));
      const menu = await screen.findByRole("menu", { name: "More actions" });
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
      expect(within(menu).queryByRole("textbox")).toBeNull();
      await user.click(within(menu).getByRole("menuitem", { name: "Dismiss" }));
      const sheet = await screen.findByRole("dialog", {
        name: "Dismiss problem",
      });
      expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
      expect(
        sheet.querySelector('[data-slot="bottom-sheet-body"].bg-background'),
      ).toBeNull();
      await user.click(
        within(sheet).getByRole("button", { name: "Confirm changes" }),
      );
      await waitFor(() =>
        expect(mocks.fetch).toHaveBeenCalledWith(
          "/v1/problems/report/cancel",
          expect.anything(),
          {
            method: "POST",
            json: { revision: 3 },
          },
        ),
      );
    } finally {
      mocks.user.effectiveScopes["problems.resolve"] = previous;
    }
  });

  it("requires a reopening reason and includes it in the request", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(
      <ProblemWork
        problem={{ ...problem, status: "resolved" }}
        reload={reload}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: messages.en.workspace.problems.reopen,
      }),
    );
    const confirm = screen
      .getAllByRole("button", { name: messages.en.workspace.problems.reopen })
      .at(-1)!;
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Reason for reopening" }),
      "Noise returned after road test",
    );
    await user.click(confirm);
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/report/reopen",
      expect.anything(),
      {
        method: "POST",
        json: { revision: 3, message: "Noise returned after road test" },
      },
    );
  });
  it("requires resolution notes and completes without a maintenance hold decision", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    renderForm(<ProblemWork problem={problem} reload={reload} />);
    const resolve = screen.getByRole("button", { name: "Complete task" });
    expect(resolve).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Resolution notes" }),
      "Belt replaced; safety inspection pending",
    );
    expect(resolve).toBeEnabled();
    expect(
      screen.queryByRole("combobox", { name: "When closing this report" }),
    ).toBeNull();
    expect(screen.queryByText("Keep the maintenance hold")).toBeNull();
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
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps the previous resolution without hold controls on closed work", () => {
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
      screen.queryByRole("button", { name: "Complete task" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear this problem’s hold" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Block scooter use" }),
    ).toBeNull();
    expect(reload).not.toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Stale update",
    );
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
              problemDifficultyCounts: {
                easy: 2,
                medium: 0,
                hard: 4,
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
              problemDifficultyCounts: {
                easy: 0,
                medium: 0,
                hard: 0,
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
      within(picker).getByRole("img", { name: "Hard: 4 problems" }),
    ).toBeInTheDocument();
    expect(
      within(picker).getByRole("img", { name: "Easy: 2 problems" }),
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
    expect(submit.parentElement?.firstElementChild).toBe(submit);
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
    await user.click(screen.getByRole("radio", { name: "Hard" }));
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
