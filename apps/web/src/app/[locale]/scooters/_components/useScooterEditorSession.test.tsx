import { ApiError, v1 } from "@repo/api-shared";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useScooterEditorSession } from "./useScooterEditorSession";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ webApi: { fetch } }));
const session = {
  id: "session",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};
beforeEach(() => {
  fetch.mockReset();
  fetch.mockImplementation((route: string) =>
    Promise.resolve(
      route === v1.scooters.ROUTES.documents.createEditorSession
        ? session
        : { ok: true },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

it("detects local expiry and blocks repeat submissions without replacing draft ownership", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  await hook.result.current.ensureSession();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(session.expiresAt) + 1);
  await act(async () => {
    for (let retry = 0; retry < 2; retry++)
      await expect(hook.result.current.ensureSession()).rejects.toMatchObject({
        code: "DOCUMENT_EDITOR_SESSION_UNAVAILABLE",
      });
  });
  expect(hook.result.current.sessionUnavailable).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("remembers a server-closed session and prevents retrying its ID", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  await hook.result.current.ensureSession();
  act(() => {
    expect(
      hook.result.current.handleSessionError(
        new ApiError(400, "closed", "DOCUMENT_EDITOR_SESSION_UNAVAILABLE"),
      ),
    ).toBe(true);
  });
  await expect(hook.result.current.ensureSession()).rejects.toMatchObject({
    code: "DOCUMENT_EDITOR_SESSION_UNAVAILABLE",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(hook.result.current.sessionUnavailable).toBe(true);
});

it("creates one session lazily for concurrent uploads and discards it on navigation", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    expect(
      await Promise.all([
        hook.result.current.ensureSession(),
        hook.result.current.ensureSession(),
      ]),
    ).toEqual(["session", "session"]);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  hook.unmount();
  await act(async () => {});
  expect(fetch.mock.calls[1]?.[0]).toBe(
    v1.scooters.ROUTES.documents.discardEditorSession("session"),
  );
  expect(fetch.mock.calls[1]?.[2]).toMatchObject({
    method: "POST",
    keepalive: true,
  });
});

it("does not discard a session during the StrictMode mount probe", async () => {
  const hook = renderHook(() => useScooterEditorSession(), {
    wrapper: StrictMode,
  });
  await act(async () => {
    await hook.result.current.ensureSession();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await hook.result.current.ensureSession()).toBe("session");
});

it("discards a late session response after the editor is abandoned", async () => {
  let resolve!: (value: typeof session) => void;
  fetch.mockReturnValueOnce(
    new Promise<typeof session>((yes) => {
      resolve = yes;
    }),
  );
  const hook = renderHook(() => useScooterEditorSession());
  const created = hook.result.current.ensureSession();
  const rejected = expect(created).rejects.toThrow("discarded");
  hook.unmount();
  await act(async () => {});
  resolve(session);
  await rejected;
  expect(fetch.mock.calls[1]?.[0]).toBe(
    v1.scooters.ROUTES.documents.discardEditorSession("session"),
  );
});

it("never discards a successful save, including unmount during its request", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  await hook.result.current.ensureSession();
  const lifecycle = hook.result.current;
  lifecycle.beginSave();
  hook.unmount();
  await act(async () => {});
  lifecycle.saved();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("discards after an in-flight save fails following navigation", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  await hook.result.current.ensureSession();
  const lifecycle = hook.result.current;
  lifecycle.beginSave();
  hook.unmount();
  await act(async () => {});
  lifecycle.saveFailed();
  expect(fetch.mock.calls[1]?.[0]).toBe(
    v1.scooters.ROUTES.documents.discardEditorSession("session"),
  );
});

it("keeps a suspended back-forward page open and discards a real page close", async () => {
  const hook = renderHook(() => useScooterEditorSession());
  await hook.result.current.ensureSession();
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: true }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(fetch.mock.calls[1]?.[0]).toBe(
    v1.scooters.ROUTES.documents.discardEditorSession("session"),
  );
});

it("resumes a workspace-owned session without creating or discarding it on navigation", async () => {
  const hook = renderHook(() => useScooterEditorSession(session));
  expect(await hook.result.current.ensureSession()).toBe(session.id);
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  hook.unmount();
  await act(async () => {});
  expect(fetch).not.toHaveBeenCalled();
});
