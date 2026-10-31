import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@repo/ui/components/toast";
function Actions({ onUndo = () => {} }: { onUndo?: () => void }) {
  const toast = useToast();
  return (
    <>
      <button
        onClick={() =>
          toast.add({
            id: "saved",
            title: "Work started",
            variant: "success",
            actionProps: { children: "Undo", onClick: onUndo },
          })
        }
      >
        Notify
      </button>
      <button
        onClick={() =>
          toast.add({ id: "saved", title: "Work paused", variant: "info" })
        }
      >
        Update
      </button>
      <button onClick={() => toast.update("saved", { title: "Updated title" })}>
        Edit title
      </button>
      <button onClick={() => toast.update("saved", { timeout: 8000 })}>
        Reset timer
      </button>
      <button
        onClick={() =>
          toast.add({ title: "Connection failed", variant: "error" })
        }
      >
        Fail
      </button>
      <button
        onClick={() =>
          void toast.promise(Promise.resolve("saved"), {
            loading: { title: "Saving" },
            success: { title: "Saved" },
            error: { title: "Failed" },
          })
        }
      >
        Promise
      </button>
    </>
  );
}
describe("shared toast", () => {
  const animations: {
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  beforeEach(() => {
    animations.length = 0;
    Element.prototype.animate = vi.fn(() => {
      const animation = { pause: vi.fn(), play: vi.fn(), cancel: vi.fn() };
      animations.push(animation);
      return animation as unknown as Animation;
    });
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    vi.restoreAllMocks();
  });
  it("pauses the countdown with hover, keyboard focus and window blur, then restarts on an upsert", async () => {
    render(
      <ToastProvider timeout={5000}>
        <Actions />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Notify"));
    const countdown = document.querySelector('[data-slot="toast-countdown"]');
    expect(countdown).toHaveAttribute("aria-hidden", "true");
    expect(Element.prototype.animate).toHaveBeenLastCalledWith(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration: 5000, easing: "linear", fill: "forwards" },
    );
    const animation = animations.at(-1)!;
    fireEvent.click(screen.getByText("Edit title"));
    expect(animations).toHaveLength(1);
    expect(animation.cancel).not.toHaveBeenCalled();
    const viewport = document.querySelector('[data-slot="toast-viewport"]')!;
    fireEvent.mouseEnter(viewport);
    await waitFor(() => expect(animation.pause).toHaveBeenCalled());
    fireEvent.mouseLeave(viewport);
    await waitFor(() => expect(animation.play).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(window, { key: "F6" });
    await waitFor(() => expect(animation.pause).toHaveBeenCalledTimes(2));
    act(() => (screen.getByText("Notify") as HTMLElement).focus());
    await waitFor(() => expect(animation.play).toHaveBeenCalledTimes(3));
    fireEvent(window, new Event("blur"));
    expect(animation.pause).toHaveBeenCalledTimes(3);
    fireEvent(
      window,
      new FocusEvent("focus", { relatedTarget: document.body }),
    );
    expect(animation.play).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByText("Update"));
    expect(animation.cancel).toHaveBeenCalled();
    expect(animations).toHaveLength(2);
    fireEvent.click(screen.getByText("Reset timer"));
    expect(animations).toHaveLength(3);
    expect(Element.prototype.animate).toHaveBeenLastCalledWith(
      expect.any(Array),
      { duration: 8000, easing: "linear", fill: "forwards" },
    );
  });
  it("portals notifications with a floating surface, supports actions, deduplicates IDs and dismisses", async () => {
    const undo = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider closeLabel="Close toast">
        <Actions onUndo={undo} />
      </ToastProvider>,
    );
    await user.click(screen.getByText("Notify"));
    const title = await screen.findByText("Work started");
    const toast = title.closest('[data-slot="toast"]');
    expect(toast).toHaveClass(
      "supports-[backdrop-filter:blur(0)]:bg-floating-action-surface",
      "supports-[backdrop-filter:blur(0)]:backdrop-blur-floating-surface",
    );
    expect(container.contains(toast)).toBe(false);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    await user.click(screen.getByText("Update"));
    await screen.findByText("Work paused");
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Close toast" }));
    await waitFor(() =>
      expect(screen.queryByText("Work paused")).not.toBeInTheDocument(),
    );
  });
  it("auto-dismisses normal feedback but retains errors", async () => {
    render(
      <ToastProvider timeout={50}>
        <Actions />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Notify"));
    await screen.findByText("Work started");
    await waitFor(() =>
      expect(screen.queryByText("Work started")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Fail"));
    await screen.findByText("Connection failed");
    expect(document.querySelector('[data-slot="toast-countdown"]')).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });
  it("updates promise feedback and supports solid surfaces and custom placement", async () => {
    render(
      <ToastProvider
        surface="solid"
        position="bottom-end"
        viewportLabel="Updates"
      >
        <Actions />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Promise"));
    const title = await screen.findByText("Saved");
    expect(title.closest('[data-slot="toast"]')).not.toHaveClass(
      "supports-[backdrop-filter:blur(0)]:bg-floating-action-surface",
    );
    expect(document.querySelector('[data-slot="toast-viewport"]')).toHaveClass(
      "end-4",
    );
  });
});
