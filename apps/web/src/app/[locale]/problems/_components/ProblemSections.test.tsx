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
  severity: "high",
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
    await screen.findByRole("heading", { name: "Buy list" });
    expect(save).toHaveBeenCalledWith({ sections: ["buyList"] });
    await user.click(screen.getByRole("button", { name: "Add item" }));
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
    expect(
      await screen.findByRole("dialog", { name: "Add to task" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("alert")).some(
        (alert) => alert.textContent === "Task changed; reload",
      ),
    ).toBe(true);
    expect(screen.queryByRole("heading", { name: "Checklist" })).toBeNull();
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
