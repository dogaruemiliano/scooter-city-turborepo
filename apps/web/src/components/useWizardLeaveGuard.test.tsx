import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWizardLeaveGuard } from "./useWizardLeaveGuard";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
beforeEach(() => {
  window.history.replaceState({ __NA: true }, "", "/en/persons/new");
  router.replace.mockReset();
});
afterEach(() => vi.restoreAllMocks());
function leaveLink() {
  const link = document.createElement("a");
  link.href = "/en/persons";
  document.body.append(link);
  fireEvent.click(link);
  link.remove();
}

it("leaves immediately until the owner enables protection and warns on refresh only while enabled", () => {
  const { result, rerender, unmount } = renderHook(
    ({ enabled }) => useWizardLeaveGuard(enabled),
    { initialProps: { enabled: false } },
  );
  const leave = vi.fn();
  act(() => result.current.requestLeave(leave));
  expect(leave).toHaveBeenCalledOnce();
  expect(result.current.open).toBe(false);
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  rerender({ enabled: true });
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(false);
  unmount();
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});

it("cancels link navigation and leaves only when the shared modal is confirmed", () => {
  const { result } = renderHook(() => useWizardLeaveGuard(true));
  act(leaveLink);
  expect(result.current.open).toBe(true);
  expect(router.replace).not.toHaveBeenCalled();
  act(() => result.current.cancel());
  expect(result.current.open).toBe(false);
  act(leaveLink);
  act(() => result.current.leave());
  expect(router.replace).toHaveBeenCalledWith("/en/persons");
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});

it("stays open when saving fails and permits recovery before leaving", () => {
  const { result } = renderHook(() => useWizardLeaveGuard(true));
  const navigate = vi.fn();
  act(() => result.current.requestLeave(navigate));
  act(() => result.current.leave(() => false));
  expect(result.current.open).toBe(true);
  expect(navigate).not.toHaveBeenCalled();
  act(() => result.current.leave(() => true));
  expect(navigate).toHaveBeenCalledOnce();
});

it("restores and re-arms browser Back before showing a cancellable modal", () => {
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  const { result } = renderHook(() => useWizardLeaveGuard(true));
  fireEvent.popState(window, { state: { __NA: true } });
  expect(result.current.open).toBe(true);
  expect(window.history.state.wizardLeaveGuard).toBe(window.location.href);
  act(() => result.current.cancel());
  expect(go).not.toHaveBeenCalled();
  fireEvent.popState(window, { state: { __NA: true } });
  act(() => result.current.leave());
  expect(go).toHaveBeenCalledExactlyOnceWith(-2);
});

it("preserves Next history state without duplicating the guard on rerenders", () => {
  const push = vi.spyOn(window.history, "pushState");
  const { rerender } = renderHook(() => useWizardLeaveGuard(true));
  rerender();
  expect(push).toHaveBeenCalledOnce();
  expect(window.history.state.__NA).toBe(true);
});

it("bypasses confirmation after successful completion", () => {
  const { result } = renderHook(() => useWizardLeaveGuard(true));
  act(() => result.current.complete());
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  fireEvent.popState(window, { state: {} });
  expect(result.current.open).toBe(false);
});

it("ignores previews, downloads, modified clicks, and same-page anchors", () => {
  const { result } = renderHook(() => useWizardLeaveGuard(true));
  const link = document.createElement("a");
  document.body.append(link);
  link.href = "/document.pdf";
  link.target = "_blank";
  fireEvent.click(link);
  link.target = "";
  link.download = "document.pdf";
  fireEvent.click(link);
  link.removeAttribute("download");
  fireEvent.click(link, { ctrlKey: true });
  link.href = "#section";
  fireEvent.click(link);
  link.remove();
  expect(result.current.open).toBe(false);
});

it("blocks header, link and browser exits during a request, then permits confirmation", () => {
  const navigate = vi.fn();
  const { result, rerender } = renderHook(
    ({ blocked }) => useWizardLeaveGuard(true, { blocked }),
    { initialProps: { blocked: true } },
  );
  act(() => result.current.requestLeave(navigate));
  act(leaveLink);
  fireEvent.popState(window, { state: {} });
  expect(navigate).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  expect(result.current.open).toBe(false);
  rerender({ blocked: false });
  act(() => result.current.requestLeave(navigate));
  expect(result.current.open).toBe(true);
  act(() => result.current.leave());
  expect(navigate).toHaveBeenCalledOnce();
});

it("uses browser Back within a wizard before offering to leave the route", () => {
  const stepBack = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const { result } = renderHook(() =>
    useWizardLeaveGuard(true, {
      onBrowserBack: stepBack,
    }),
  );
  fireEvent.popState(window, { state: {} });
  expect(stepBack).toHaveBeenCalledOnce();
  expect(result.current.open).toBe(false);
  fireEvent.popState(window, { state: {} });
  expect(result.current.open).toBe(true);
});

it("skips its history sentinel without prompting after changes are undone", () => {
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  const { result, rerender } = renderHook(
    ({ enabled }) => useWizardLeaveGuard(enabled),
    { initialProps: { enabled: true } },
  );
  rerender({ enabled: false });
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  fireEvent.popState(window, { state: {} });
  expect(go).toHaveBeenCalledExactlyOnceWith(-2);
  expect(result.current.open).toBe(false);
});
