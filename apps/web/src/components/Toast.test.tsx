import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
