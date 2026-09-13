import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePersonLeaveGuard } from "./usePersonLeaveGuard";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  window.history.replaceState({ __NA: true }, "", "/en/persons/new");
  router.replace.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

function leaveLink() {
  const link = document.createElement("a");
  link.href = "/en/persons";
  document.body.append(link);
  fireEvent.click(link);
  link.remove();
}

it("does not block an untouched form and protects refresh once work starts", () => {
  const { rerender, unmount } = renderHook(
    ({ dirty }) => usePersonLeaveGuard(dirty, "Lose progress?"),
    { initialProps: { dirty: false } },
  );
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  rerender({ dirty: true });
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(false);
  unmount();
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});

it("retains progress when a link is cancelled and leaves only after confirmation", () => {
  renderHook(() => usePersonLeaveGuard(true, "Lose progress?"));
  leaveLink();
  expect(window.confirm).toHaveBeenCalledWith("Lose progress?");
  expect(router.replace).not.toHaveBeenCalled();
  vi.mocked(window.confirm).mockReturnValue(true);
  leaveLink();
  expect(router.replace).toHaveBeenCalledWith("/en/persons");
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});

it("restores the current history entry when browser Back is cancelled", () => {
  const forward = vi
    .spyOn(window.history, "forward")
    .mockImplementation(() => {});
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  renderHook(() => usePersonLeaveGuard(true, "Lose progress?"));
  fireEvent.popState(window, { state: { __NA: true } });
  expect(forward).toHaveBeenCalledOnce();
  expect(back).not.toHaveBeenCalled();
  fireEvent.popState(window, { state: window.history.state });
  expect(window.confirm).toHaveBeenCalledOnce();
  vi.mocked(window.confirm).mockReturnValue(true);
  fireEvent.popState(window, { state: { __NA: true } });
  expect(back).toHaveBeenCalledOnce();
});

it("preserves Next history state and does not add a guard for each render", () => {
  const push = vi.spyOn(window.history, "pushState");
  const { rerender } = renderHook(() =>
    usePersonLeaveGuard(true, "Lose progress?"),
  );
  rerender();
  expect(push).toHaveBeenCalledOnce();
  expect(window.history.state.__NA).toBe(true);
});

it("bypasses confirmation after successful creation", () => {
  const { result } = renderHook(() =>
    usePersonLeaveGuard(true, "Lose progress?"),
  );
  act(() => result.current.complete());
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  fireEvent.popState(window, { state: {} });
  expect(window.confirm).not.toHaveBeenCalled();
});

it("does not warn for document previews opened in a new tab or downloads", () => {
  renderHook(() => usePersonLeaveGuard(true, "Lose progress?"));
  const link = document.createElement("a");
  link.href = "/document.pdf";
  link.target = "_blank";
  document.body.append(link);
  fireEvent.click(link);
  link.target = "";
  link.download = "document.pdf";
  fireEvent.click(link);
  link.remove();
  expect(window.confirm).not.toHaveBeenCalled();
});
