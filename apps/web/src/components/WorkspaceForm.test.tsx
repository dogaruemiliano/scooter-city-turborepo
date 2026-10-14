import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ApiError } from "@repo/api-shared";
import type { ReactNode } from "react";
import { useRemote, useTask } from "./WorkspaceForm";

describe("useRemote list request state", () => {
  it("retains existing data during refresh, exposes failures and retries", async () => {
    const load = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(["first"]);
    const { result } = renderHook(() => useRemote(load));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let fail!: (error: Error) => void;
    load.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    act(() => result.current.reload());
    expect(result.current.refreshing).toBe(true);
    expect(result.current.data).toEqual(["first"]);
    await act(async () => fail(new Error("Network failed")));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Network failed");
    load.mockResolvedValueOnce(["updated"]);
    act(() => result.current.reload());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual(["updated"]));
  });

  it("ignores results from a superseded query", async () => {
    let first!: (value: string[]) => void;
    const slow = () =>
      new Promise<string[]>((resolve) => {
        first = resolve;
      });
    const latest = async () => ["latest"];
    const { result, rerender } = renderHook(({ load }) => useRemote(load), {
      initialProps: { load: slow },
    });
    rerender({ load: latest });
    await waitFor(() => expect(result.current.data).toEqual(["latest"]));
    await act(async () => first(["stale"]));
    expect(result.current.data).toEqual(["latest"]);
    expect(result.current.loading).toBe(false);
  });
});

it("shows a specific maintenance-hold error instead of suggesting a stale-record retry", async () => {
  const { result } = renderHook(
    () =>
      useTask({
        SCOOTER_MAINTENANCE_HOLD:
          "Clear all blocking problems before rental creation.",
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NextIntlClientProvider locale="en" messages={messages.en}>
          {children}
        </NextIntlClientProvider>
      ),
    },
  );
  await act(async () =>
    result.current.run(() =>
      Promise.reject(
        new ApiError(
          409,
          "Scooter has a maintenance hold",
          "SCOOTER_MAINTENANCE_HOLD",
        ),
      ),
    ),
  );
  expect(result.current.error).toBe(
    "Clear all blocking problems before rental creation.",
  );
});
