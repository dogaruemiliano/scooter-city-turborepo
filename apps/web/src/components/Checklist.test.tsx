import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ChecklistEditor,
  ChecklistList,
  type ChecklistItem,
  type ChecklistEditorLabels,
} from "@repo/ui/components";

const initial: ChecklistItem[] = [
  { id: "brakes", text: "Check brakes", completed: false },
  { id: "tires", text: "Inspect tires", completed: true },
];
const labels: ChecklistEditorLabels = {
  title: "Edit checklist",
  description: "Add, reorder, or remove items.",
  instructions:
    "Long press to move vertically. Space to pick up, Up or Down to move, Escape to cancel.",
  empty: "No items",
  add: "Add item",
  input: "New item",
  placeholder: "Type an item",
  save: "Save checklist",
  cancel: "Cancel",
  remove: (text) => `Remove ${text}`,
  reorder: (text) => `Move ${text}`,
};

function Harness({
  save = async () => true,
}: {
  save?: (items: ChecklistItem[]) => Promise<boolean>;
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ChecklistList
        items={items}
        emptyMessage="No items"
        onCheckedChange={(id, completed) =>
          setItems((current) =>
            current.map((item) =>
              item.id === id ? { ...item, completed } : item,
            ),
          )
        }
      />
      <button onClick={() => setOpen(true)}>Edit</button>
      {open ? (
        <ChecklistEditor
          items={items}
          labels={labels}
          onClose={() => setOpen(false)}
          onSave={async (next) => {
            if (!(await save(next))) return false;
            setItems(next);
            return true;
          }}
        />
      ) : null}
    </>
  );
}

describe("shared checklist", () => {
  it("checks and unchecks the circular control at the right of each row", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const control = screen.getByRole("checkbox", { name: "Check brakes" });
    expect(control).toHaveClass("rounded-full");
    expect(control.previousElementSibling?.tagName).toBe("LABEL");
    await user.click(control);
    expect(control).toBeChecked();
    await user.click(control);
    expect(control).not.toBeChecked();
  });

  it("always shows an input, stages Enter additions and removals, then saves", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit checklist" });
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    expect(within(sheet).queryByText(labels.description)).toBeNull();
    expect(within(sheet).getByText(labels.instructions)).toHaveClass("sr-only");
    expect(sheet.querySelector('[data-slot="add-action"]')).toBeNull();
    const input = within(sheet).getByRole("textbox", { name: "New item" });
    expect(input).toHaveAttribute("enterkeyhint", "next");
    expect(input).toHaveAttribute("placeholder", labels.placeholder);
    expect(within(sheet).getByText(labels.input)).toHaveClass("sr-only");
    expect(sheet).toHaveClass("lg:w-(--container-form-columns)");
    await user.type(input, "Replace pads{Enter}");
    expect(within(sheet).getByText("Replace pads")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
    await user.click(
      within(sheet).getByRole("button", { name: "Remove Check brakes" }),
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Save checklist" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(save).toHaveBeenCalledWith([
      initial[1],
      { id: expect.any(String), text: "Replace pads", completed: false },
    ]);
    expect(screen.queryByRole("checkbox", { name: "Check brakes" })).toBeNull();
  });

  it("adds from the desktop button and includes unfinished input on save", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog");
    const input = within(sheet).getByRole("textbox", { name: labels.input });
    const add = within(sheet).getByRole("button", { name: labels.add });
    expect(add).toHaveClass("hidden", "lg:inline-flex");
    expect(add).toBeDisabled();
    await user.type(input, "First item");
    await user.click(add);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.type(input, "Pending item");
    await user.click(within(sheet).getByRole("button", { name: labels.save }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith([
        ...initial,
        { id: expect.any(String), text: "First item", completed: false },
        { id: expect.any(String), text: "Pending item", completed: false },
      ]),
    );
  });

  it("discards edits on cancel and retains them when saving fails", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("button", { name: "Remove Check brakes" }),
    );
    await user.click(screen.getByRole("button", { name: "Save checklist" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("checkbox", { name: "Check brakes" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("button", { name: "Remove Check brakes" }),
    ).toBeInTheDocument();
  });
});
