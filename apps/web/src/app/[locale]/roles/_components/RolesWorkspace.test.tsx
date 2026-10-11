import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { ComponentProps } from "react";
import type { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesWorkspace } from "./RolesWorkspace";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
// PermissionEditor has its own interaction suite. These tests exercise the role
// lifecycle around it: persisted grants, preview freshness, and safe updates.
vi.mock("./permission-editor", () => ({
  PermissionDiff: () => <p>Permission changes</p>,
  PermissionEditor: ({
    value,
    onChange,
    disabled,
  }: {
    value: v1.access.Role["permissions"];
    onChange: (value: v1.access.Role["permissions"]) => void;
    disabled?: boolean;
  }) => (
    <div>
      <output aria-label="Current grants">{JSON.stringify(value)}</output>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange([{ permissionKey: "problems.read", scopes: ["ALL"] }])
        }
      >
        Read every problem
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange([
            {
              permissionKey: "problems.read",
              scopes: ["ASSIGNED", "AVAILABLE"],
            },
          ])
        }
      >
        Read assigned and available problems
      </button>
    </div>
  ),
}));

const role = {
  id: "role",
  slug: "mechanic",
  name: "Mechanic",
  description: "Shared mechanic access",
  revision: 7,
  memberCount: 1,
  archivedAt: null,
  permissions: [{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }],
};
const preview = {
  memberCount: 1,
  affectedMembers: [
    {
      id: "user",
      email: "mechanic@example.com",
      before: { "problems.read": ["ASSIGNED"] },
      after: { "problems.read": ["ALL"] },
      missingPrerequisites: [] as string[],
    },
  ],
};
const roleList = {
  items: [
    role,
    { ...role, id: "admin", slug: "admin", name: "Admin" },
    { ...role, id: "client", slug: "customer", name: "Client" },
    { ...role, id: "old", slug: "dispatcher", name: "Old dispatcher" },
  ],
};
function renderRoles(id?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RolesWorkspace id={id} />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockImplementation(
    async (path: string, _schema: unknown, options?: { method?: string }) => {
      if (path.endsWith("audit-events")) return { items: [] };
      if (path.endsWith("preview")) return preview;
      if (options?.method === "PUT") return { ...role, revision: 8 };
      return roleList;
    },
  );
});

describe("fixed role library", () => {
  it("shows the four profiles without create, rename or archive controls", async () => {
    renderRoles();
    expect(
      await screen.findByRole("heading", { name: "Mechanic" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Client" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Super Admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Edit permissions/ }),
    ).toHaveLength(3);
    expect(screen.queryByText("Old dispatcher")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add role" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
  });

  it("renders the fixed library for the old create route", async () => {
    renderRoles("new");
    expect(
      await screen.findByRole("heading", { name: "Mechanic" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some((call) => call[2]?.method === "POST"),
    ).toBe(false);
  });

  it("does not expose a legacy custom role editor through a direct URL", async () => {
    renderRoles("old");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review changes" }),
    ).not.toBeInTheDocument();
  });
});

describe("live role permissions", () => {
  it("requires a preview before updating and preserves role metadata and revision", async () => {
    const user = userEvent.setup();
    renderRoles("role");
    expect(await screen.findByLabelText("Current grants")).toHaveTextContent(
      JSON.stringify(role.permissions),
    );
    expect(
      screen.getByRole("button", { name: "Review changes" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Read every problem" }),
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByText("mechanic@example.com");
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/access/roles/role",
        expect.anything(),
        {
          method: "PUT",
          json: {
            name: role.name,
            description: role.description,
            permissions: [{ permissionKey: "problems.read", scopes: ["ALL"] }],
            expectedRevision: 7,
          },
        },
      ),
    );
  });

  it("invalidates review when permissions change and restores grants on cancel", async () => {
    const user = userEvent.setup();
    renderRoles("role");
    await user.click(
      await screen.findByRole("button", { name: "Read every problem" }),
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByRole("button", { name: "Confirm changes" });
    await user.click(
      screen.getByRole("button", {
        name: "Read assigned and available problems",
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Confirm changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review changes" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Current grants")).toHaveTextContent(
      JSON.stringify(role.permissions),
    );
    expect(
      screen.getByRole("button", { name: "Review changes" }),
    ).toBeDisabled();
  });

  it("blocks confirmation when the preview reports a missing prerequisite", async () => {
    const defaultFetch = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((path: string, ...args: unknown[]) =>
      path.endsWith("preview")
        ? {
            ...preview,
            affectedMembers: [
              {
                ...preview.affectedMembers[0],
                missingPrerequisites: ["problems.read"],
              },
            ],
          }
        : defaultFetch(path, ...args),
    );
    const user = userEvent.setup();
    renderRoles("role");
    await user.click(
      await screen.findByRole("button", { name: "Read every problem" }),
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(
      await screen.findByRole("button", { name: "Confirm changes" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("problems.read");
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
  });
});
