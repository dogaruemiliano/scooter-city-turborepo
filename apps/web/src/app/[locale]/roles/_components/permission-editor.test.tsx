import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  effectiveScopes,
  inheritedScopes,
  normalizeScopes,
  PermissionEditor,
  type Grant,
} from "./permission-editor";

const role: v1.access.Role = {
  id: "mechanic",
  slug: "mechanic",
  name: "Mechanic",
  description: "",
  revision: 2,
  memberCount: 1,
  archivedAt: null,
  permissions: [
    { permissionKey: "problems.read", scopes: ["ASSIGNED", "AVAILABLE"] },
    { permissionKey: "problems.resolve", scopes: ["ALL"] },
  ],
};
function Harness({
  initial = [],
  roles = [role],
  locale = "en",
  disabled = false,
  canEditPermission,
  canGrantPermission,
}: {
  initial?: Grant[];
  roles?: v1.access.Role[] | null;
  locale?: "en" | "ro";
  disabled?: boolean;
  canEditPermission?: (key: string) => boolean;
  canGrantPermission?: (
    key: string,
    scopes: v1.access.PermissionScope[],
  ) => boolean;
}) {
  const [value, setValue] = useState<Grant[]>(initial);
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PermissionEditor
        value={value}
        onChange={setValue}
        roles={roles ?? undefined}
        disabled={disabled}
        canEditPermission={canEditPermission}
        canGrantPermission={canGrantPermission}
      />
      <output aria-label="stored overrides">{JSON.stringify(value)}</output>
    </NextIntlClientProvider>
  );
}
const stored = (): Grant[] =>
  JSON.parse(screen.getByLabelText("stored overrides").textContent!);
const permissionRow = (name: string) => screen.getByRole("group", { name });
const resolveRow = () => permissionRow("Service work · Resolve");
const mode = (row: HTMLElement, name: "Allow" | "Default" | "Deny") =>
  within(row).getByRole("radio", { name });

const scopeTrigger = (row: HTMLElement) =>
  within(row).getByRole("button", { name: /^Scope for/ });
async function selectScope(
  user: ReturnType<typeof userEvent.setup>,
  row: HTMLElement,
  name: string,
) {
  await user.click(scopeTrigger(row));
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

async function serviceTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Service" }));
}

describe("permission replacement editor", () => {
  it.each(["en", "ro"] as const)(
    "shows an informational label instead of a custom filter when empty in %s",
    (locale) => {
      render(<Harness locale={locale} />);
      expect(
        screen.getByText(messages[locale].access.editor.noCustom),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: messages[locale].access.editor.onlyCustom,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps the base role explanation under the radios and only offers useful expansion", async () => {
    const user = userEvent.setup();
    render(<Harness roles={[]} />);
    await serviceTab(user);
    const row = permissionRow("Service work · View");
    const radios = within(row).getByRole("radiogroup");
    const explanation = within(row).getByText(
      "The base role does not allow this permission.",
    );
    expect(explanation).toBeVisible();
    expect(radios.parentElement?.parentElement).toContainElement(explanation);
    expect(within(row).queryByRole("button", { name: "Details" })).toBeNull();
    await user.click(mode(row, "Allow"));
    const toggle = within(row).getByRole("button", { name: "Details" });
    await user.click(toggle);
    expect(within(row).getByRole("textbox")).toBeVisible();
    await user.click(mode(row, "Default"));
    expect(within(row).queryByRole("button", { name: "Details" })).toBeNull();
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(explanation).toBeVisible();
  });

  it("animates expansion and a half-turn arrow while keeping collapsed details inert", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = within(resolveRow()).getByRole("button", {
      name: "Details",
    });
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    const arrow = toggle.querySelector("svg")!;
    expect(toggle).toHaveClass("h-10", "min-h-10");
    expect(panel.querySelector(".pb-4")).not.toBeNull();
    expect(panel).toHaveAttribute("inert");
    expect(panel).toHaveClass(
      "grid-rows-[0fr]",
      "duration-normal",
      "motion-reduce:transition-none",
    );
    expect(arrow).toHaveClass("rotate-0");
    await user.click(toggle);
    expect(panel).not.toHaveAttribute("inert");
    expect(panel).toHaveClass("grid-rows-[1fr]");
    expect(arrow).toHaveClass("rotate-180");
    await user.click(toggle);
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveClass("grid-rows-[0fr]");
    expect(arrow).toHaveClass("rotate-0");
  });

  it("shows inherited scope without badges and explains editable scopes in a sheet", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(within(resolveRow()).getByText("All records")).toBeVisible();
    expect(resolveRow().querySelector('[data-slot="badge"]')).toBeNull();
    await user.click(mode(resolveRow(), "Allow"));
    await user.click(scopeTrigger(resolveRow()));
    const sheet = await screen.findByRole("dialog", {
      name: "Scope for Service work · Resolve",
    });
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet).not.toHaveClass("bg-background");
    expect(
      within(sheet).getByText(
        "Only records linked to work assigned to this user.",
      ),
    ).toBeVisible();
    expect(
      within(sheet).getByText(
        "All records this action permits, subject to management restrictions.",
      ),
    ).toBeVisible();
    await user.click(within(sheet).getByRole("button", { name: "Assigned" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(scopeTrigger(resolveRow())).toHaveTextContent("Assigned");
    expect(scopeTrigger(resolveRow()).querySelector("svg")).not.toBeNull();
    expect(stored()[0]?.scopes).toEqual(["ASSIGNED"]);
  });

  it("shows a visible hierarchy and marks custom overrides beside inherited access", () => {
    render(
      <Harness initial={[{ permissionKey: "problems.resolve", scopes: [] }]} />,
    );
    expect(screen.getByRole("heading", { name: "Permissions" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Service" })).toBeNull();
    expect(screen.queryByText("1 custom override")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Only custom/ }),
    ).toHaveTextContent("1");
    const custom = within(resolveRow()).getByText("Custom");
    expect(custom).toBeVisible();
    expect(custom).toHaveAttribute("data-slot", "badge");
    expect(custom).toHaveClass("bg-personal-subtle", "text-personal");
    expect(custom.parentElement).toContainElement(
      within(resolveRow()).getByRole("heading", {
        name: "Service work · Resolve",
      }),
    );
    expect(
      within(permissionRow("Service work · View"))
        .getAllByText("From Mechanic")
        .some((element) => !element.closest("[hidden]")),
    ).toBe(true);
  });

  it("places the mode control in the row grid and keeps Romanian choices together", () => {
    render(
      <Harness
        locale="ro"
        initial={[{ permissionKey: "scooters.read", scopes: [] }]}
        roles={[]}
      />,
    );
    const row = permissionRow("Scutere · Vizualizare");
    const modes = within(row).getByRole("radiogroup");
    expect(modes.parentElement?.parentElement).toHaveClass(
      "col-span-12",
      "lg:col-span-4",
    );
    expect(modes).toHaveStyle({ "--segmented-columns": "3" });
    expect(modes).toHaveClass(
      "grid-cols-[repeat(var(--segmented-columns),minmax(0,1fr))]",
    );
    for (const radio of within(modes).getAllByRole("radio")) {
      expect(radio.parentElement).toHaveClass("after:hidden");
    }
    expect(modes).not.toHaveClass("col-span-12", "lg:col-span-4");
    expect(within(modes).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(row).getByRole("button", { name: /Domeniu/ }).parentElement,
    ).toHaveClass("col-span-12");
  });

  it("opens Service for a mechanic and shows inherited scopes as readouts", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Administration",
      "Fleet",
      "Service",
      "Rentals",
      "People",
      "Finance",
      "Client",
    ]);
    expect(screen.getByRole("tab", { name: "Service" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mode(resolveRow(), "Default")).toBeChecked();
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
    expect(
      within(resolveRow()).queryByRole("button", { name: /^Scope for/ }),
    ).not.toBeInTheDocument();
    expect(
      within(permissionRow("Service work · View")).getByText(
        "Assigned + available",
      ),
    ).toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it("opens Fleet for other base roles", () => {
    render(
      <Harness roles={[{ ...role, slug: "admin", name: "Administrator" }]} />,
    );
    expect(screen.getByRole("tab", { name: "Fleet" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("distinguishes replacement Allow, explicit Deny, and removing an override with Default", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await serviceTab(user);
    await user.click(mode(resolveRow(), "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: ["ALL"] },
    ]);
    await selectScope(user, resolveRow(), "Assigned");
    expect(stored()[0]?.scopes).toEqual(["ASSIGNED"]);
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: [] },
    ]);
    expect(scopeTrigger(resolveRow())).toBeDisabled();
    expect(within(resolveRow()).getByText("No access")).toBeInTheDocument();
    await user.click(mode(resolveRow(), "Default"));
    expect(stored()).toEqual([]);
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
  });

  it("starts Allow at the least permissive valid scope when there is no inherited grant", async () => {
    const user = userEvent.setup();
    render(<Harness roles={[]} />);
    await serviceTab(user);
    await user.click(mode(permissionRow("Service work · View"), "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
    ]);
    await user.click(
      mode(permissionRow("Service work · Claim available work"), "Allow"),
    );
    expect(stored()).toContainEqual({
      permissionKey: "problems.claim",
      scopes: ["AVAILABLE"],
    });
    await user.click(screen.getByRole("tab", { name: "Client" }));
    await user.click(mode(permissionRow("Customer profile · View"), "Allow"));
    expect(stored()).toContainEqual({
      permissionKey: "portal.profile.read",
      scopes: ["OWN"],
    });
  });

  it("supports assigned plus available while making ALL exclusive", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[]}
        initial={[{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }]}
      />,
    );
    await serviceTab(user);
    const row = permissionRow("Service work · View");
    await selectScope(user, row, "Assigned + available");
    expect(stored()[0]?.scopes).toEqual(["ASSIGNED", "AVAILABLE"]);
    await selectScope(user, row, "All records");
    expect(stored()[0]?.scopes).toEqual(["ALL"]);
    await selectScope(user, row, "Available");
    expect(stored()[0]?.scopes).toEqual(["AVAILABLE"]);
    await user.click(scopeTrigger(row));
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("button", { name: "Assigned" }),
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "Available" }),
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", {
        name: "Assigned + available",
      }),
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "All records" }),
    ).toBeVisible();
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
  });

  it("updates Default from live role props while keeping explicit replacement access", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await serviceTab(user);
    const narrowed = {
      ...role,
      permissions: [
        {
          permissionKey: "problems.resolve" as const,
          scopes: ["ASSIGNED" as const],
        },
      ],
    };
    view.rerender(<Harness roles={[narrowed]} />);
    expect(within(resolveRow()).getByText("Assigned")).toBeInTheDocument();
    await user.click(mode(resolveRow(), "Allow"));
    view.rerender(<Harness roles={[role]} />);
    expect(mode(resolveRow(), "Allow")).toBeChecked();
    expect(scopeTrigger(resolveRow())).toHaveTextContent("Assigned");
    await user.click(mode(resolveRow(), "Default"));
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
  });

  it("keeps reasons and dependencies in Details and preserves a reason across scope and mode edits", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ permissionKey: "problems.resolve", scopes: ["ALL"] }]}
      />,
    );
    await serviceTab(user);
    expect(within(resolveRow()).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(
      within(resolveRow()).getByRole("button", { name: "Details" }),
    );
    expect(
      within(resolveRow()).getByText("Required permissions"),
    ).toBeInTheDocument();
    expect(
      within(resolveRow()).getByText("Service work · View", { selector: "li" }),
    ).toBeInTheDocument();
    await user.type(
      within(resolveRow()).getByRole("textbox"),
      "Temporary cover",
    );
    await selectScope(user, resolveRow(), "Assigned");
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ASSIGNED"],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: [],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Allow"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ALL"],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Default"));
    expect(stored()).toEqual([]);
    expect(within(resolveRow()).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("filters across tabs without losing edits and includes explicit denials in Only custom", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ permissionKey: "problems.resolve", scopes: [] }]} />,
    );
    const filter = screen.getByRole("button", { name: /Only custom/ });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(filter).toHaveClass("bg-muted");
    expect(filter.querySelector("svg")).not.toBeNull();
    expect(filter.parentElement).toContainElement(
      screen.getByRole("heading", { name: "Permissions" }),
    );
    await user.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(filter).toHaveClass("bg-personal-subtle", "text-personal");
    expect(screen.getByRole("tab", { name: /^Service/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mode(resolveRow(), "Deny")).toBeChecked();
    expect(
      screen.queryByRole("group", { name: "Service work · View" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "no matching permission");
    expect(
      screen.getByText("No permissions match these filters"),
    ).toBeInTheDocument();
    expect(stored()[0]?.scopes).toEqual([]);
    await user.clear(screen.getByRole("searchbox"));
    await user.click(mode(resolveRow(), "Default"));
    expect(screen.getByText("No custom permissions")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Only custom/ }),
    ).not.toBeInTheDocument();
    expect(mode(resolveRow(), "Default")).toBeChecked();
    expect(screen.getByRole("tab", { name: "Service" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it.each([
    {
      locale: "en" as const,
      query: "settlements",
      name: "Settlements · Preview",
      category: "Finance",
    },
    {
      locale: "ro" as const,
      query: "inchirieri",
      name: "Închirieri · Predare",
      category: "Închirieri",
    },
  ])(
    "searches translated labels across categories in $locale",
    async ({ locale, query, name, category }) => {
      const user = userEvent.setup();
      render(<Harness locale={locale} />);
      await user.type(screen.getByRole("searchbox"), query);
      expect(permissionRow(name)).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: new RegExp(`^${category}`) }),
      ).toHaveAttribute("aria-selected", "true");
    },
  );

  it("uses Allow and Deny for role editing and omits empty role grants", async () => {
    const user = userEvent.setup();
    render(<Harness roles={null} />);
    await serviceTab(user);
    const row = permissionRow("Service work · Claim available work");
    expect(
      within(row).queryByRole("radio", { name: "Default" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Only custom/ }),
    ).not.toBeInTheDocument();
    await user.click(mode(row, "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
    ]);
    await user.click(mode(row, "Deny"));
    expect(stored()).toEqual([]);
  });

  it("disables mutations while leaving search, category navigation, and details available", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        disabled
        initial={[
          {
            permissionKey: "problems.resolve",
            scopes: ["ASSIGNED"],
            reason: "Assigned work only",
          },
        ]}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "Resolve");
    for (const radio of within(resolveRow()).getAllByRole("radio"))
      expect(radio).toBeDisabled();
    expect(scopeTrigger(resolveRow())).toBeDisabled();
    await user.click(
      within(resolveRow()).getByRole("button", { name: "Details" }),
    );
    expect(within(resolveRow()).getByRole("textbox")).toBeDisabled();
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ASSIGNED"],
      reason: "Assigned work only",
    });
  });

  it("supports keyboard category navigation and native radio arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Fleet" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Service" })).toHaveFocus();
    await user.keyboard(" ");
    mode(resolveRow(), "Default").focus();
    await user.keyboard("{ArrowLeft}");
    expect(mode(resolveRow(), "Allow")).toBeChecked();
    expect(stored()[0]?.scopes).toEqual(["ALL"]);
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(mode(resolveRow(), "Deny")).toBeChecked();
    expect(stored()[0]?.scopes).toEqual([]);
  });

  it("preserves normalization, inheritance unions and per-user replacement semantics", () => {
    expect(normalizeScopes(["ASSIGNED", "ALL", "AVAILABLE"])).toEqual(["ALL"]);
    expect(inheritedScopes([role], "problems.read")).toEqual([
      "ASSIGNED",
      "AVAILABLE",
    ]);
    expect(
      effectiveScopes(
        [role],
        [{ permissionKey: "problems.resolve", scopes: ["ASSIGNED"] }],
      )["problems.resolve"],
    ).toEqual(["ASSIGNED"]);
    expect(
      effectiveScopes(
        [role],
        [{ permissionKey: "problems.resolve", scopes: [] }],
      )["problems.resolve"],
    ).toEqual([]);
  });

  it("covers every permission and its translated description in both languages", async () => {
    const user = userEvent.setup();
    const view = render(<Harness roles={null} />);
    for (const locale of ["en", "ro"] as const) {
      view.rerender(<Harness roles={null} locale={locale} key={locale} />);
      let count = 0;
      for (const tab of screen.getAllByRole("tab")) {
        await user.click(tab);
        count += within(
          screen.getByRole("tabpanel", { name: tab.textContent! }),
        )
          .getAllByRole("group")
          .filter((element) => element.hasAttribute("aria-labelledby")).length;
      }
      expect(count).toBe(v1.access.permissionCatalog.length);
      expect(view.container.textContent).not.toContain("access.descriptions.");
      expect(view.container.textContent).not.toContain("access.editor.");
    }
  });
});

describe("dependency assistance", () => {
  it("enables scoped requirements in one update and preserves an overridden reason", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[]}
        initial={[
          { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
          {
            permissionKey: "problems.read",
            scopes: [],
            reason: "Review access",
          },
        ]}
      />,
    );
    await serviceTab(user);
    const row = resolveRow();
    expect(within(row).getByText(/Replaces an explicit denial/)).toBeVisible();
    await user.click(
      within(row).getByRole("button", { name: "Enable required permissions" }),
    );
    expect(stored()).toContainEqual({
      permissionKey: "problems.read",
      scopes: ["ASSIGNED"],
      reason: "Review access",
    });
    expect(
      within(row).queryByRole("button", {
        name: "Enable required permissions",
      }),
    ).toBeNull();
    expect(screen.getByText(/Updated required permissions/)).toBeVisible();
  });

  it("does not create unnecessary overrides for sufficient inherited access", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[
          {
            ...role,
            permissions: [{ permissionKey: "problems.read", scopes: ["ALL"] }],
          },
        ]}
      />,
    );
    await user.click(mode(resolveRow(), "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
    ]);
    expect(
      within(resolveRow()).queryByRole("button", {
        name: "Enable required permissions",
      }),
    ).toBeNull();
  });

  it("cancels dependent changes without applying anything, then applies inherited denials together", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[
          {
            ...role,
            permissions: [
              { permissionKey: "problems.read", scopes: ["ALL"] },
              { permissionKey: "problems.update", scopes: ["ALL"] },
              { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
            ],
          },
        ]}
      />,
    );
    const row = permissionRow("Service work · View");
    await user.click(mode(row, "Deny"));
    const dialog = await screen.findByRole("dialog", {
      name: "Update dependent permissions?",
    });
    expect(within(dialog).getByText("Service work · Edit")).toBeVisible();
    expect(within(dialog).getByText("Service work · Resolve")).toBeVisible();
    expect(stored()).toEqual([]);
    await user.click(
      within(dialog).getByRole("button", { name: "Keep unchanged" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mode(row, "Default")).toBeChecked();
    await user.click(mode(row, "Deny"));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Disable all 3 permissions",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored()).toEqual(
      expect.arrayContaining([
        { permissionKey: "problems.read", scopes: [] },
        { permissionKey: "problems.update", scopes: [] },
        { permissionKey: "problems.resolve", scopes: [] },
      ]),
    );
    expect(stored()).toHaveLength(3);
  });

  it("confirms scope narrowing and keeps dependents covered by assigned access", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[
          {
            ...role,
            permissions: [
              { permissionKey: "problems.read", scopes: ["ALL"] },
              { permissionKey: "problems.update", scopes: ["ALL"] },
              { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
            ],
          },
        ]}
        initial={[{ permissionKey: "problems.read", scopes: ["ALL"] }]}
      />,
    );
    const row = permissionRow("Service work · View");
    await user.click(scopeTrigger(row));
    const picker = await screen.findByRole("dialog");
    await user.click(within(picker).getByRole("button", { name: "Assigned" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Update dependent permissions?",
    });
    expect(within(dialog).getByText("Service work · Edit")).toBeVisible();
    expect(within(dialog).queryByText("Service work · Resolve")).toBeNull();
    expect(stored()).toEqual([
      { permissionKey: "problems.read", scopes: ["ALL"] },
    ]);
    await user.click(
      within(dialog).getByRole("button", { name: "Apply changes" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored()).toContainEqual({
      permissionKey: "problems.read",
      scopes: ["ASSIGNED"],
    });
    expect(stored()).toContainEqual({
      permissionKey: "problems.update",
      scopes: [],
    });
    expect(mode(resolveRow(), "Default")).toBeChecked();
  });

  it("confirms returning to Default when it would remove access needed by a dependent", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[]}
        initial={[
          { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
          { permissionKey: "problems.resolve", scopes: ["ASSIGNED"] },
        ]}
      />,
    );
    await serviceTab(user);
    const row = permissionRow("Service work · View");
    await user.click(mode(row, "Default"));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Disable all 2 permissions" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: [] },
    ]);
  });

  it("blocks enabling requirements outside the operator's scopes without partial changes", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={[]}
        initial={[{ permissionKey: "problems.resolve", scopes: ["ALL"] }]}
        canGrantPermission={(key, scopes) =>
          key !== "problems.read" || !scopes.includes("ALL")
        }
      />,
    );
    await serviceTab(user);
    const button = within(resolveRow()).getByRole("button", {
      name: "Enable required permissions",
    });
    expect(button).toBeDisabled();
    expect(
      within(resolveRow()).getByText(/You cannot change these permissions/),
    ).toBeVisible();
    await user.click(button);
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: ["ALL"] },
    ]);
  });

  it("blocks cascading changes when one dependent is protected", async () => {
    const user = userEvent.setup();
    render(<Harness canEditPermission={(key) => key !== "problems.resolve"} />);
    await user.click(mode(permissionRow("Service work · View"), "Deny"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Disable all 2 permissions" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(/You cannot change these permissions/),
    ).toBeVisible();
    expect(stored()).toEqual([]);
  });

  it("removes dependent grants when editing a role instead of creating user overrides", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={null}
        initial={[
          { permissionKey: "problems.read", scopes: ["ALL"] },
          { permissionKey: "problems.update", scopes: ["ALL"] },
        ]}
      />,
    );
    await serviceTab(user);
    await user.click(mode(permissionRow("Service work · View"), "Deny"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/Deny override/)).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Disable all 2 permissions" }),
    );
    expect(stored()).toEqual([]);
  });
});
