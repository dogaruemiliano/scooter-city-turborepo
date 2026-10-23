import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemSections } from "./ProblemSections";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
const problem = v1.problems.problemSchema.parse({
  id: "task",
  scooterId: "scooter",
  title: "Service",
  description: "",
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
    registrationNumber: null,
  },
  difficulty: "hard",
  priority: "normal",
  status: "open",
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  assigneeId: "mechanic",
  assignee: null,
  revision: 1,
  createdAt: "2026-10-15T08:00:00Z",
  updatedAt: "2026-10-15T08:00:00Z",
  resolvedAt: null,
});
const saved = { id: "workshop", name: "Workshop", address: "10 Main Street" };

function renderSections(
  initial = problem,
  editable = true,
  maySaveLocation = true,
) {
  const save = vi.fn().mockResolvedValue(undefined);
  function Harness() {
    const [current, setCurrent] = useState(initial);
    const [busy, setBusy] = useState(false);
    return (
      <ProblemSections
        problem={current}
        editable={editable}
        maySaveLocation={maySaveLocation}
        busy={busy}
        onBusyChange={setBusy}
        onSave={async (input) => {
          await save(input);
          setCurrent((value) =>
            v1.problems.problemSchema.parse({ ...value, ...input }),
          );
        }}
      />
    );
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <Harness />
    </NextIntlClientProvider>,
  );
  return save;
}

beforeEach(() => mocks.fetch.mockReset().mockResolvedValue({ items: [saved] }));

describe("optional task sections", () => {
  it.each(["checklist", "buyList", "location"] as const)(
    "confirms deletion of %s above its editor",
    async (kind) => {
      const user = userEvent.setup();
      const save = renderSections({
        ...problem,
        sections: [kind],
        ...(kind === "location"
          ? {
              location: {
                name: "Workshop",
                address: "Main Street",
                savedLocationId: null,
              },
            }
          : {
              [kind]: [
                { id: "brakes", text: "Check brakes", completed: false },
              ],
            }),
      });
      const edit =
        kind === "checklist"
          ? "Edit checklist"
          : kind === "buyList"
            ? "Edit buy list"
            : "Edit location";
      const remove =
        kind === "checklist"
          ? "Delete checklist"
          : kind === "buyList"
            ? "Delete buy list"
            : "Delete location";
      await user.click(screen.getByRole("button", { name: edit }));
      const editor = await screen.findByRole("dialog", { name: edit });
      await user.click(within(editor).getByRole("button", { name: remove }));
      const confirmation = await screen.findByRole("dialog", { name: remove });
      expect(confirmation).toHaveClass("bg-popover");
      expect(confirmation.querySelector(".bg-background")).toBeNull();
      expect(editor).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
      await user.click(
        within(confirmation).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: remove })).toBeNull(),
      );
      expect(editor).toBeInTheDocument();
      await user.click(within(editor).getByRole("button", { name: remove }));
      const retry = await screen.findByRole("dialog", { name: remove });
      await user.click(within(retry).getByRole("button", { name: remove }));
      await waitFor(() =>
        expect(save).toHaveBeenCalledWith({
          sections: [],
          [kind]: kind === "location" ? null : [],
        }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: edit })).toBeNull(),
      );
    },
  );

  it("retains an inline item when saving fails and allows retry", async () => {
    const user = userEvent.setup();
    const save = renderSections({
      ...problem,
      sections: ["checklist"],
      checklist: [{ id: "brakes", text: "Check brakes", completed: false }],
    });
    save.mockRejectedValueOnce(new Error("Please retry"));
    const input = screen.getByRole("textbox", { name: "Add item" });
    await user.type(input, "Inspect tires{Enter}");
    await screen.findByText("Please retry");
    expect(input).toHaveValue("Inspect tires");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each(["checklist", "buyList"] as const)(
    "adds items inline in the last row of %s",
    async (kind) => {
      const user = userEvent.setup();
      const save = renderSections({
        ...problem,
        sections: [kind],
        [kind]: [{ id: "brakes", text: "Check brakes", completed: false }],
      });
      const title = kind === "checklist" ? "Checklist" : "Buy list";
      const section = screen.getByRole("region", { name: title });
      const list = within(section).getByRole("list");
      const add = within(list).getByRole("textbox", { name: "Add item" });
      expect(add.closest("li")).toBe(list.lastElementChild);
      expect(list.children).toHaveLength(2);
      expect(section.querySelector('[data-slot="add-action"]')).toBeNull();
      await user.type(add, "Inspect tires{Enter}");
      await waitFor(() =>
        expect(save).toHaveBeenCalledWith({
          [kind]: [
            { id: "brakes", text: "Check brakes", completed: false },
            { id: expect.any(String), text: "Inspect tires", completed: false },
          ],
        }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(add).toHaveValue("");
      expect(add).toHaveFocus();
      expect(
        within(list).getByRole("checkbox", { name: "Inspect tires" }),
      ).toBeInTheDocument();
      await user.type(add, "Check lights{Enter}");
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    },
  );

  it.each(["checklist", "buyList"] as const)(
    "hides saved empty %s and keeps Add available",
    async (kind) => {
      const title = kind === "checklist" ? "Checklist" : "Buy list";
      const user = userEvent.setup();
      renderSections({ ...problem, sections: [kind], [kind]: [] });
      expect(screen.queryByRole("heading", { name: title })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Add" }));
      expect(screen.getByRole("button", { name: title })).toBeEnabled();
    },
  );

  it.each(["checklist", "buyList"] as const)(
    "hides new empty %s after saving",
    async (kind) => {
      const title = kind === "checklist" ? "Checklist" : "Buy list";
      const editorTitle =
        kind === "checklist" ? "Create checklist" : "Create buy list";
      const saveTitle =
        kind === "checklist" ? "Save checklist" : "Save buy list";
      const user = userEvent.setup();
      const save = renderSections();
      await user.click(screen.getByRole("button", { name: "Add" }));
      await user.click(screen.getByRole("button", { name: title }));
      const editor = await screen.findByRole("dialog", { name: editorTitle });
      await user.click(within(editor).getByRole("button", { name: saveTitle }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: editorTitle })).toBeNull(),
      );
      expect(screen.queryByRole("heading", { name: title })).toBeNull();
      expect(save).toHaveBeenCalledWith({ sections: [], [kind]: [] });
    },
  );

  it.each(["checklist", "buyList"] as const)(
    "removes %s when its last item is removed and saved",
    async (kind) => {
      const title = kind === "checklist" ? "Checklist" : "Buy list";
      const editorTitle =
        kind === "checklist" ? "Edit checklist" : "Edit buy list";
      const saveTitle =
        kind === "checklist" ? "Save checklist" : "Save buy list";
      const user = userEvent.setup();
      const save = renderSections({
        ...problem,
        sections: [kind, "location"],
        [kind]: [{ id: "brakes", text: "Check brakes", completed: false }],
      });
      await user.click(screen.getByRole("button", { name: editorTitle }));
      const editor = await screen.findByRole("dialog", { name: editorTitle });
      await user.click(
        within(editor).getByRole("button", {
          name: "Remove item: Check brakes",
        }),
      );
      await user.click(within(editor).getByRole("button", { name: saveTitle }));
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: title })).toBeNull(),
      );
      expect(save).toHaveBeenCalledWith({ sections: ["location"], [kind]: [] });
    },
  );

  it("opens the checklist editor directly and discards a cancelled new section", async () => {
    const user = userEvent.setup();
    const save = renderSections();
    await user.click(screen.getByRole("button", { name: "Add" }));
    const picker = await screen.findByRole("dialog", { name: "Add to task" });
    await user.click(within(picker).getByRole("button", { name: "Checklist" }));
    const editor = await screen.findByRole("dialog", {
      name: "Create checklist",
    });
    expect(
      within(editor).getByRole("textbox", { name: "New checklist item" }),
    ).toBeInTheDocument();
    expect(within(editor).queryByText("No checklist items yet.")).toBeNull();
    expect(save).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create checklist" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("heading", { name: "Checklist" })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("adds a buy list from a distinct sheet and saves purchases independently", async () => {
    const user = userEvent.setup();
    const save = renderSections();
    expect(screen.queryByRole("heading", { name: "Checklist" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add" }),
    ).toHaveAccessibleDescription("Checklist · Buy list · Location");
    await user.click(screen.getByRole("button", { name: "Add" }));
    const sheet = await screen.findByRole("dialog", { name: "Add to task" });
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    for (const slot of ["bottom-sheet-header", "bottom-sheet-body"]) {
      expect(sheet.querySelector(`[data-slot="${slot}"]`)).not.toHaveClass(
        "bg-background",
      );
    }
    expect(
      within(sheet).getByRole("button", { name: "Checklist" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Location" }),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Buy list" }));
    expect(save).not.toHaveBeenCalled();
    const editor = await screen.findByRole("dialog", {
      name: "Create buy list",
    });
    expect(within(editor).queryByText("No items to buy yet.")).toBeNull();
    await user.type(
      screen.getByRole("textbox", { name: "Item to buy" }),
      "2 rear tires{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Save buy list" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "2 rear tires" }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        buyList: [
          { id: expect.any(String), text: "2 rear tires", completed: true },
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      within(
        await screen.findByRole("dialog", { name: "Add to task" }),
      ).getByRole("button", { name: "Buy list" }),
    ).toBeDisabled();
  });

  it("attaches a saved business location", async () => {
    const user = userEvent.setup();
    const save = renderSections();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    const editor = await screen.findByRole("dialog", { name: "Add location" });
    expect(editor).toHaveClass("bg-popover");
    for (const slot of ["bottom-sheet-header", "bottom-sheet-body"]) {
      expect(editor.querySelector(`[data-slot="${slot}"]`)).not.toHaveClass(
        "bg-background",
      );
    }
    await user.click(
      await within(editor).findByRole("button", {
        name: "Saved business location",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Workshop · 10 Main Street" }),
    );
    expect(screen.getByRole("textbox", { name: "Place name" })).toHaveValue(
      "Workshop",
    );
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        sections: ["location"],
        location: {
          name: saved.name,
          address: saved.address,
          savedLocationId: saved.id,
        },
      }),
    );
  });

  it("saves a one-off location without creating a business location", async () => {
    const user = userEvent.setup();
    const save = renderSections(problem, true, false);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "Customer pickup",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Address" }),
      "25 Park Road",
    );
    expect(
      screen.queryByRole("checkbox", {
        name: "Save as a business location for reuse",
      }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        sections: ["location"],
        location: {
          name: "Customer pickup",
          address: "25 Park Road",
          savedLocationId: null,
        },
      }),
    );
    expect(mocks.fetch).not.toHaveBeenCalledWith(
      "/v1/problems/locations",
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("allows admins to save a new business location for reuse", async () => {
    const user = userEvent.setup();
    const save = renderSections();
    mocks.fetch.mockImplementation(async (_url, _schema, options) =>
      options?.method === "POST" ? saved : { items: [] },
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      saved.name,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Address" }),
      saved.address,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Save as a business location for reuse",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          location: {
            name: saved.name,
            address: saved.address,
            savedLocationId: saved.id,
          },
        }),
      ),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/locations",
      expect.anything(),
      { method: "POST", json: { name: saved.name, address: saved.address } },
    );
  });

  it("keeps failed additions open for retry", async () => {
    const user = userEvent.setup();
    const save = renderSections();
    save.mockRejectedValueOnce(new Error("Task changed; reload"));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Checklist" }));
    const editor = await screen.findByRole("dialog", {
      name: "Create checklist",
    });
    await user.type(
      within(editor).getByRole("textbox", { name: "New checklist item" }),
      "Check brakes{Enter}",
    );
    await user.click(
      within(editor).getByRole("button", { name: "Save checklist" }),
    );
    expect(
      (await screen.findAllByRole("alert")).some(
        (alert) => alert.textContent === "Task changed; reload",
      ),
    ).toBe(true);
    expect(within(editor).getByText("Check brakes")).toBeInTheDocument();
    await user.click(
      within(editor).getByRole("button", { name: "Save checklist" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create checklist" }),
      ).toBeNull(),
    );
    expect(save).toHaveBeenLastCalledWith({
      sections: ["checklist"],
      checklist: [
        { id: expect.any(String), text: "Check brakes", completed: false },
      ],
    });
  });

  it("shows existing sections without add controls for read-only viewers", () => {
    renderSections(
      {
        ...problem,
        buyList: [{ id: "tire", text: "Rear tire", completed: false }],
        location: {
          name: saved.name,
          address: saved.address,
          savedLocationId: saved.id,
        },
      },
      false,
    );
    expect(screen.getByRole("checkbox", { name: "Rear tire" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(saved.address)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit location" })).toBeNull();
  });
});
