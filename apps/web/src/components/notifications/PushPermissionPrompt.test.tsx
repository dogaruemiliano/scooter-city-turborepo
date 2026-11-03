import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushPermissionPrompt } from "./PushPermissionPrompt";
import { pushPromptStorageKey } from "./push-prompt-storage";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  register: vi.fn(),
  supported: true,
  needsInstall: false,
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("./push-client", () => ({
  supportsPush: () => mocks.supported,
  isIosWithoutInstallation: () => mocks.needsInstall,
  registerPush: mocks.register,
}));

function show(userId = "mechanic", locale: "en" | "ro" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PushPermissionPrompt key={userId} userId={userId} />
    </NextIntlClientProvider>,
  );
}
function permission(value: NotificationPermission) {
  vi.stubGlobal("Notification", { permission: value });
}

beforeEach(() => {
  localStorage.clear();
  permission("default");
  mocks.supported = true;
  mocks.needsInstall = false;
  mocks.register
    .mockReset()
    .mockImplementation(async () => permission("granted"));
  mocks.fetch
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === v1.notifications.ROUTES.pushConfig
        ? { configured: true, publicKey: "test-public-key" }
        : { pushEnabled: true, mutedCategories: [] },
    );
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("push permission introduction", () => {
  it("explains push before requesting permission and remembers Not now across remounts", async () => {
    const view = show();
    expect(
      await screen.findByRole("dialog", { name: "Enable push notifications?" }),
    ).toBeVisible();
    expect(screen.getByText(/even when ScooterCity is closed/)).toBeVisible();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "shown",
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "dismissed",
    );
    view.unmount();
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("enables only on a click, guards duplicate clicks, and records success after registration", async () => {
    let finish!: () => void;
    mocks.register.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    show();
    const button = await screen.findByRole("button", {
      name: "Enable push notifications",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledWith(
      "test-public-key",
      "en",
      "mechanic",
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("button", { name: "Enabling push…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "shown",
    );
    await act(async () => {
      permission("granted");
      finish();
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "enabled",
    );
  });

  it.each(["granted", "denied"] as const)(
    "does not offer when browser permission is %s",
    async (value) => {
      permission(value);
      await act(async () => {
        show();
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it.each(["unsupported", "ios-needs-install"])(
    "does not offer on %s browsers",
    async (state) => {
      mocks.supported = state !== "unsupported";
      mocks.needsInstall = state === "ios-needs-install";
      await act(async () => {
        show();
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBeNull();
    },
  );

  it.each(["unconfigured", "disabled", "load-error"])(
    "does not count an offer when push is %s",
    async (state) => {
      mocks.fetch.mockImplementation(async (path: string) => {
        if (state === "load-error") throw new Error("offline");
        return path === v1.notifications.ROUTES.pushConfig
          ? {
              configured: state !== "unconfigured",
              publicKey: state === "unconfigured" ? null : "key",
            }
          : { pushEnabled: state !== "disabled", mutedCategories: [] };
      });
      await act(async () => {
        show();
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBeNull();
    },
  );

  it("waits for the app to be foreground before showing and storing the offer", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      show();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBeNull();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });

  it("keeps the choice per account and renders Romanian copy", async () => {
    localStorage.setItem(pushPromptStorageKey("another-user"), "dismissed");
    show("mechanic", "ro");
    expect(
      await screen.findByRole("dialog", {
        name: "Activezi notificările push?",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Nu acum" }));
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "dismissed",
    );
  });

  it("remembers dismissal of the native dialog without asking again", async () => {
    mocks.register.mockRejectedValue(new Error("permission not granted"));
    const view = show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable push notifications" }),
    );
    await waitFor(() =>
      expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
        "permission-dismissed",
      ),
    );
    view.unmount();
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains native blocking and disables another permission request", async () => {
    mocks.register.mockImplementation(async () => {
      permission("denied");
      throw new Error("blocked");
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable push notifications" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notifications are blocked.",
    );
    expect(
      screen.getByRole("button", { name: "Enable push notifications" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "denied",
    );
  });

  it("keeps the action available after a registration failure without claiming success", async () => {
    mocks.register.mockImplementationOnce(async () => {
      permission("granted");
      throw new Error("offline");
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable push notifications" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be updated",
    );
    const button = screen.getByRole("button", {
      name: "Enable push notifications",
    });
    expect(button).toBeEnabled();
    expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
      "failed",
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
        "enabled",
      ),
    );
  });

  it("dismisses with Escape and remembers the choice", async () => {
    show();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(localStorage.getItem(pushPromptStorageKey("mechanic"))).toBe(
        "dismissed",
      ),
    );
  });

  it("closes if another tab already offered push to this user", async () => {
    show();
    await screen.findByRole("dialog");
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: pushPromptStorageKey("mechanic"),
        newValue: "dismissed",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("aborts an in-progress setup when the account leaves", async () => {
    mocks.register.mockImplementation(() => new Promise<void>(() => {}));
    const view = show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable push notifications" }),
    );
    const signal = mocks.register.mock.calls[0]![3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("remembers the choice for the page session even when local storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const view = show("storage-blocked-user");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    view.unmount();
    show("storage-blocked-user");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("remembers the offer when storage is readable but writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const view = show("storage-quota-user");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    view.unmount();
    show("storage-quota-user");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
