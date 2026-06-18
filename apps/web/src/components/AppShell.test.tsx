import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { SessionProvider } from "./auth/SessionProvider";

class TestPointerEvent extends MouseEvent {
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  pathname: "/",
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.pathname = "/";
  mocks.push.mockReset();
  mocks.refresh.mockReset();

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

describe("AppShell", () => {
  it("renders the application navigation and current user menu", async () => {
    renderAppShell();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "UI showcase" })).toHaveAttribute(
      "href",
      "/shadcn",
    );
    expect(screen.getByText("emilia.stone@example.com")).toBeInTheDocument();

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Open account menu" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" }),
    ).toHaveAttribute("href", "/account/settings");
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("does not render the application shell on the sign-in route", () => {
    mocks.pathname = "/sign-in";

    renderAppShell();

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open account menu" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the application shell on the English sign-in route", () => {
    mocks.pathname = "/en/sign-in";

    renderAppShell();

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open account menu" }),
    ).not.toBeInTheDocument();
  });

  it("keeps navigation links on the English locale prefix", async () => {
    mocks.pathname = "/en/shadcn";

    renderAppShell();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/en",
    );
    expect(screen.getByRole("link", { name: "UI showcase" })).toHaveAttribute(
      "href",
      "/en/shadcn",
    );

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Open account menu" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" }),
    ).toHaveAttribute("href", "/en/account/settings");
  });
});

function renderAppShell() {
  return render(
    <TooltipProvider>
      <SessionProvider
        initialUser={{
          id: "user-1",
          email: "emilia.stone@example.com",
          roles: ["USER"],
        }}
      >
        <AppShell initialThemePreference="system">
          <div>Page content</div>
        </AppShell>
      </SessionProvider>
    </TooltipProvider>,
  );
}
