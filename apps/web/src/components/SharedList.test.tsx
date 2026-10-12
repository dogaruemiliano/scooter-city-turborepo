import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ListFilterSheet,
  ListItems,
  ListLayout,
  ListPagination,
  SheetSelect,
} from "@repo/ui/components";

function Filters({
  apply = () => {},
}: {
  apply?: (value: {
    status: string;
  }) => void | boolean | Promise<void | boolean>;
}) {
  const [value, setValue] = useState({ status: "active" });
  return (
    <ListFilterSheet
      value={value}
      defaultValue={{ status: "all" }}
      appliedCount={value.status === "all" ? 0 : 1}
      title="Filters"
      applyLabel="Apply filters"
      resetLabel="Reset filters"
      cancelLabel="Cancel"
      applyErrorLabel="Could not apply"
      onApply={async (next) => {
        const result = await apply(next);
        if (result !== false) setValue(next);
        return result;
      }}
    >
      {({ value: draft, setValue: setDraft }) => (
        <SheetSelect
          label="Status"
          value={draft.status}
          onValueChange={(status) => setDraft({ status })}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
      )}
    </ListFilterSheet>
  );
}

describe("shared list filters", () => {
  it("selects in a secondary sheet, discards on Cancel, and commits only on Apply", async () => {
    const user = userEvent.setup();
    const apply = vi.fn();
    render(<Filters apply={apply} />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const parent = screen.getByRole("dialog");
    expect(parent).toHaveClass("bg-popover", "text-popover-foreground");
    for (const slot of [
      "bottom-sheet-popup",
      "bottom-sheet-content",
      "bottom-sheet-header",
      "bottom-sheet-body",
      "bottom-sheet-footer",
    ]) {
      document
        .querySelectorAll(`[data-slot="${slot}"]`)
        .forEach((element) => expect(element).not.toHaveClass("bg-background"));
    }
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(parent).toHaveAttribute("data-nested-drawer-open");
    await user.click(screen.getByRole("button", { name: "Archived" }));
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Archived",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Active",
    );
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "All",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({ status: "all" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Filters" }),
    ).not.toHaveTextContent("1");
  });

  it("keeps the draft and error visible after a failed Apply, and prevents duplicate submissions", async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    const apply = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    render(<Filters apply={apply} />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const form = screen
      .getByRole("button", { name: "Apply filters" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeDisabled();
    reject(new Error("failure"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not apply",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Active",
    );
  });

  it("Escape dismisses just the top sheet and keeps the parent draft", async () => {
    const user = userEvent.setup();
    render(<Filters />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "All",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent(
      "Active",
    );
  });
});

describe("shared list composition", () => {
  it("renders custom items as a semantic list without inventing absent controls", () => {
    const { container } = render(
      <ListLayout search={<input aria-label="Search" />}>
        <ListItems
          items={[{ id: "one", name: "Custom item" }]}
          getItemKey={(item) => item.id}
          renderItem={(item) => <article>{item.name}</article>}
        />
      </ListLayout>,
    );
    expect(container.querySelector('[data-slot="list-header"]')).toBeNull();
    expect(
      within(screen.getByRole("list")).getByRole("listitem"),
    ).toHaveTextContent("Custom item");
    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });

  it("supports URL pagination and disables unavailable navigation", () => {
    render(
      <ListPagination
        canPrevious={false}
        canNext
        previousHref="?page=0"
        nextHref="?page=2&kind=EXPENSE"
        previousLabel="Previous"
        nextLabel="Next"
        label="List pages"
      />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "?page=2&kind=EXPENSE",
    );
  });
});
