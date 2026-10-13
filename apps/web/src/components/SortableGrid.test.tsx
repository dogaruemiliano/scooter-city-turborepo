import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SortableGrid } from "@repo/ui/components/sortable-grid";
import { insertSortableItem } from "@repo/ui/lib/sortable-order";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: (x: number, y: number) =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-sortable-id]"),
      ).find((card) => {
        const rect = card.getBoundingClientRect();
        return (
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
      }) ?? document.body,
  });

  class TestPointerEvent extends MouseEvent {
    readonly pointerId = 1;
    readonly isPrimary = true;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => {},
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );

  Object.defineProperty(document, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: () => ({
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  });

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.slot === "sortable-delete-reveal")
        return DOMRect.fromRect({ x: 0, y: 284, width: 240, height: 96 });
      if (this.dataset.slot === "sortable-delete-area")
        return DOMRect.fromRect({ x: 0, y: 300, width: 240, height: 80 });
      const cards = Array.from(document.querySelectorAll("[data-sortable-id]"));
      const index = cards.indexOf(this);
      if (index >= 0)
        return DOMRect.fromRect({
          x: (index % 2) * 120,
          y: Math.floor(index / 2) * 120,
          width: 100,
          height: 100,
        });
      return DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 240 });
    },
  );
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});

function ids() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-sortable-id]"),
  ).map((card) => card.dataset.sortableId);
}

function setup(onOrderChange = vi.fn().mockResolvedValue(false)) {
  render(
    <SortableGrid
      items={items}
      renderItem={(item) => <span>{item.id}</span>}
      getItemLabel={(item) => `Move ${item.id}`}
      instructions="Space to pick up, arrows to move, Escape to cancel."
      onOrderChange={onOrderChange}
    >
      <button>Add photos</button>
    </SortableGrid>,
  );
  return onOrderChange;
}

describe("sortable insertion", () => {
  function removable(remove = vi.fn().mockResolvedValue(true)) {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <SortableGrid
        items={items}
        renderItem={(item) => <span>{item.id}</span>}
        getItemLabel={(item) => `Move ${item.id}`}
        instructions="Move down to delete"
        onOrderChange={save}
        removal={{
          label: "Drag here to delete",
          activeLabel: "Release to delete",
          onRemove: remove,
        }}
      />,
    );
    return { remove, save };
  }
  async function startDeleteDrag() {
    const card = screen.getByRole("button", { name: "Move d" });
    fireEvent.pointerDown(card, { clientX: 160, clientY: 160, buttons: 1 });
    fireEvent.pointerMove(document, { clientX: 170, clientY: 160, buttons: 1 });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    return card;
  }
  it("expands below the grid in normal flow and preserves the area while collapsing", async () => {
    removable();
    const area = document.querySelector<HTMLElement>(
      '[data-slot="sortable-delete-area"]',
    )!;
    const collapse = area.closest<HTMLElement>(
      '[data-slot="sortable-delete-collapse"]',
    )!;
    expect(area).not.toHaveClass("fixed", "z-overlay");
    expect(collapse).toHaveClass(
      "grid-rows-[0fr]",
      "opacity-0",
      "duration-normal",
    );
    expect(collapse).toHaveAttribute("inert");
    const card = await startDeleteDrag();
    expect(collapse.previousElementSibling).toContainElement(card);
    expect(collapse).toHaveClass("grid-rows-[1fr]", "opacity-100");
    expect(collapse).not.toHaveAttribute("inert");
    fireEvent.keyDown(card, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(collapse).toHaveClass("grid-rows-[0fr]"));
    expect(area).toBeInTheDocument();
    expect(collapse).toHaveAttribute("aria-hidden", "true");
  });
  it("deletes a dropped item without saving its temporary reorder", async () => {
    const { remove, save } = removable();
    expect(
      screen
        .getByText("Drag here to delete")
        .closest('[data-slot="sortable-delete-collapse"]'),
    ).toHaveAttribute("aria-hidden", "true");
    await startDeleteDrag();
    fireEvent.pointerMove(document, { clientX: 20, clientY: 50, buttons: 1 });
    await waitFor(() => expect(ids()).toEqual(["d", "a", "b", "c"]));
    fireEvent.pointerMove(document, { clientX: 120, clientY: 330, buttons: 1 });
    await screen.findByText("Release to delete");
    fireEvent.pointerUp(document, { clientX: 120, clientY: 330 });
    await waitFor(() =>
      expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "d" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="sortable-delete-collapse"]'),
    ).toHaveAttribute("aria-hidden", "true");
  });
  it("does not delete into the unrevealed portion of an expanding area", async () => {
    const { remove, save } = removable();
    await startDeleteDrag();
    const reveal = document.querySelector<HTMLElement>(
      '[data-slot="sortable-delete-reveal"]',
    )!;
    vi.spyOn(reveal, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 284, width: 240, height: 20 }),
    );
    fireEvent.pointerMove(document, { clientX: 120, clientY: 330, buttons: 1 });
    fireEvent.pointerUp(document, { clientX: 120, clientY: 330 });
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="sortable-delete-collapse"]'),
      ).toHaveAttribute("aria-hidden", "true"),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("uses the final release position even if a move was missed", async () => {
    const { remove } = removable();
    await startDeleteDrag();
    fireEvent.pointerUp(document, { clientX: 120, clientY: 330 });
    await waitFor(() =>
      expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "d" }),
    );
  });
  it.each(["escape", "outside"])("does not delete after %s", async (exit) => {
    const { remove, save } = removable();
    const card = await startDeleteDrag();
    fireEvent.pointerMove(document, { clientX: 120, clientY: 330, buttons: 1 });
    await screen.findByText("Release to delete");
    if (exit === "escape")
      fireEvent.keyDown(card, { key: "Escape", code: "Escape" });
    else fireEvent.pointerUp(document, { clientX: 600, clientY: 600 });
    await waitFor(() =>
      expect(screen.queryByText("Release to delete")).toBeNull(),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps items and their original order when deletion fails", async () => {
    const { remove, save } = removable(vi.fn().mockResolvedValue(false));
    await startDeleteDrag();
    fireEvent.pointerUp(document, { clientX: 120, clientY: 330 });
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    expect(save).not.toHaveBeenCalled();
  });
  it("supports keyboard deletion and moving back out of the delete area", async () => {
    const { remove, save } = removable();
    const card = screen.getByRole("button", { name: "Move d" });
    card.focus();
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(card, { code: "ArrowDown", key: "ArrowDown" });
    await screen.findByText("Release to delete");
    fireEvent.keyDown(card, { code: "ArrowUp", key: "ArrowUp" });
    await screen.findByText("Drag here to delete");
    fireEvent.keyDown(card, { code: "ArrowDown", key: "ArrowDown" });
    await screen.findByText("Release to delete");
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() =>
      expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "d" }),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("opens by click or Enter, suppresses drag clicks, and recovers after keyboard cancellation", async () => {
    const press = vi.fn();
    render(
      <SortableGrid
        items={items}
        renderItem={(item) => <span>{item.id}</span>}
        getItemLabel={(item) => `Open ${item.id}`}
        instructions="Sort with Space"
        onOrderChange={vi.fn().mockResolvedValue(true)}
        onItemPress={press}
      />,
    );
    const card = screen.getByRole("button", { name: "Open a" });
    fireEvent.click(card);
    expect(press).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
    expect(press).toHaveBeenCalledTimes(2);
    card.focus();
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(card, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(card);
    expect(press).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
    expect(press).toHaveBeenCalledTimes(3);
  });

  it("keeps the idle overlay empty and without visible chrome", () => {
    setup();
    const overlay = document.querySelector("[data-dnd-overlay]");
    expect(overlay).toBeEmptyDOMElement();
    expect(overlay).not.toHaveClass(
      "border-2",
      "border-primary",
      "bg-control",
      "shadow-lg",
    );
  });

  it("inserts before or after a hovered item without swapping", () => {
    expect(
      insertSortableItem(["a", "b", "c", "d"], "d", "a", "before"),
    ).toEqual(["d", "a", "b", "c"]);
    expect(insertSortableItem(["a", "b", "c", "d"], "a", "c", "after")).toEqual(
      ["b", "c", "a", "d"],
    );
    expect(insertSortableItem(["a", "b", "c", "d"], "d", "a", "after")).toEqual(
      ["a", "d", "b", "c"],
    );
    expect(insertSortableItem(["a", "b"], "a", "a", "before")).toEqual([
      "a",
      "b",
    ]);
  });

  it("supports real keyboard pickup and cancellation without saving", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move a" });
    card.focus();
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    expect(card).toHaveClass("border-dashed", "border-primary");
    fireEvent.keyDown(card, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "false"));
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Add photos" }),
    ).not.toHaveAttribute("data-sortable-id");
  });

  it("previews keyboard movement and saves only on drop, rolling back failure", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move a" });
    card.focus();
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(card, { code: "ArrowRight", key: "ArrowRight" });
    await waitFor(() => expect(ids()).toEqual(["b", "a", "c", "d"]));
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(card, { code: "Space", key: " " });
    });
    await waitFor(() =>
      expect(save).toHaveBeenCalledExactlyOnceWith(["b", "a", "c", "d"]),
    );
    await waitFor(() => expect(ids()).toEqual(["a", "b", "c", "d"]));
  });
  it.each([20, 69])(
    "inserts before when hovering outside the rightmost 30% (%s)",
    async (hoverX) => {
      const save = setup();
      const card = screen.getByRole("button", { name: "Move d" });
      fireEvent.pointerDown(card, { clientX: 160, clientY: 160, buttons: 1 });
      fireEvent.pointerMove(document, {
        clientX: 170,
        clientY: 160,
        buttons: 1,
      });
      await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
      fireEvent.pointerMove(document, {
        clientX: hoverX,
        clientY: 50,
        buttons: 1,
      });
      await waitFor(() => expect(ids()).toEqual(["d", "a", "b", "c"]));
      expect(card).toHaveClass("border-dashed", "border-primary");
      expect(card.firstElementChild).toHaveStyle({ opacity: "0.3" });
      expect(save).not.toHaveBeenCalled();
      fireEvent.pointerUp(document, { clientX: hoverX, clientY: 50 });
      await waitFor(() =>
        expect(save).toHaveBeenCalledExactlyOnceWith(["d", "a", "b", "c"]),
      );
    },
  );

  it.each([70, 80, 99])(
    "inserts after in the rightmost 30%, including its boundary (%s)",
    async (hoverX) => {
      const save = setup();
      const card = screen.getByRole("button", { name: "Move d" });
      fireEvent.pointerDown(card, { clientX: 160, clientY: 160, buttons: 1 });
      fireEvent.pointerMove(document, {
        clientX: 170,
        clientY: 160,
        buttons: 1,
      });
      await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
      fireEvent.pointerMove(document, {
        clientX: hoverX,
        clientY: 50,
        buttons: 1,
      });
      await waitFor(() => expect(ids()).toEqual(["a", "d", "b", "c"]));
      fireEvent.pointerUp(document, { clientX: hoverX, clientY: 50 });
      await waitFor(() =>
        expect(save).toHaveBeenCalledExactlyOnceWith(["a", "d", "b", "c"]),
      );
    },
  );
  it("moves the hovered card back left when dragging over its right edge", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move d" });
    fireEvent.pointerDown(card, { clientX: 160, clientY: 160, buttons: 1 });
    fireEvent.pointerMove(document, { clientX: 170, clientY: 160, buttons: 1 });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.pointerMove(document, { clientX: 20, clientY: 50, buttons: 1 });
    await waitFor(() => expect(ids()).toEqual(["d", "a", "b", "c"]));
    fireEvent.pointerMove(document, { clientX: 200, clientY: 50, buttons: 1 });
    await waitFor(() => expect(ids()).toEqual(["a", "d", "b", "c"]));
    fireEvent.pointerUp(document, { clientX: 200, clientY: 50 });
    await waitFor(() =>
      expect(save).toHaveBeenCalledExactlyOnceWith(["a", "d", "b", "c"]),
    );
  });
  it("inserts after when hovering the rightmost 30% and cancels an outside drop", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move a" });
    fireEvent.pointerDown(card, { clientX: 40, clientY: 40, buttons: 1 });
    fireEvent.pointerMove(document, { clientX: 50, clientY: 40, buttons: 1 });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.pointerMove(document, { clientX: 200, clientY: 160, buttons: 1 });
    await waitFor(() => expect(ids()).toEqual(["b", "c", "d", "a"]));
    fireEvent.pointerMove(document, { clientX: 500, clientY: 500, buttons: 1 });
    fireEvent.pointerUp(document, { clientX: 500, clientY: 500 });
    await waitFor(() => expect(ids()).toEqual(["a", "b", "c", "d"]));
    expect(save).not.toHaveBeenCalled();
  });
  it("requires a hold on touch and allows movement to cancel before activation", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move a" });
    fireEvent.pointerDown(card, {
      clientX: 40,
      clientY: 40,
      pointerType: "touch",
      buttons: 1,
    });
    fireEvent.pointerMove(document, {
      clientX: 40,
      clientY: 80,
      pointerType: "touch",
      buttons: 1,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(card).toHaveAttribute("aria-pressed", "false");
    fireEvent.pointerUp(document, {
      clientX: 40,
      clientY: 80,
      pointerType: "touch",
    });
    fireEvent.pointerDown(card, {
      clientX: 40,
      clientY: 40,
      pointerType: "touch",
      buttons: 1,
    });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(card, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "false"));
    expect(save).not.toHaveBeenCalled();
  });

  it("moves across grid rows with keyboard and cancels the preview", async () => {
    const save = setup();
    const card = screen.getByRole("button", { name: "Move a" });
    card.focus();
    fireEvent.keyDown(card, { code: "Space", key: " " });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(card, { code: "ArrowDown", key: "ArrowDown" });
    await waitFor(() => expect(ids()).toEqual(["b", "c", "a", "d"]));
    fireEvent.keyDown(card, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(ids()).toEqual(["a", "b", "c", "d"]));
    expect(save).not.toHaveBeenCalled();
  });
});
