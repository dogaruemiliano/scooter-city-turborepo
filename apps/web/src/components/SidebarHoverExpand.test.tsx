import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { tokens } from "@repo/theme";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/components/sidebar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DESKTOP_WIDTH = tokens.breakpoints.md + 1;
const MOBILE_WIDTH = tokens.breakpoints.md - 1;

class TestPointerEvent extends MouseEvent {
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: width < tokens.breakpoints.md,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function SidebarState() {
  const { hoverOpen, open, state } = useSidebar();

  return (
    <output
      data-testid="sidebar-state"
      data-hover-open={hoverOpen}
      data-open={open}
    >
      {state}
    </output>
  );
}

type FixtureProps = {
  collapsible?: React.ComponentProps<typeof Sidebar>["collapsible"];
  hoverExpand?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sidebarClassName?: string;
  variant?: React.ComponentProps<typeof Sidebar>["variant"];
};

function SidebarFixture({
  collapsible = "icon",
  hoverExpand,
  open,
  onOpenChange,
  sidebarClassName,
  variant,
}: FixtureProps) {
  return (
    <SidebarProvider
      defaultOpen={false}
      hoverExpand={hoverExpand}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Sidebar
        className={sidebarClassName}
        collapsible={collapsible}
        variant={variant}
      >
        <div>Navigation</div>
        {collapsible !== "none" && <SidebarRail />}
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        <SidebarState />
      </SidebarInset>
    </SidebarProvider>
  );
}

function getDesktopSidebar(container: HTMLElement) {
  const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');

  if (!sidebar) {
    throw new Error("Desktop sidebar was not rendered.");
  }

  return sidebar;
}

function advanceTime(duration: number) {
  act(() => {
    vi.advanceTimersByTime(duration);
  });
}

describe("Sidebar hover expansion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewport(DESKTOP_WIDTH);
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: TestPointerEvent,
    });
    document.cookie = "sidebar_state=; path=/; max-age=0";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens and closes after token delays while keeping the layout collapsed", () => {
    const { container } = render(<SidebarFixture />);
    const sidebar = getDesktopSidebar(container);
    const gap = container.querySelector<HTMLElement>(
      '[data-slot="sidebar-gap"]',
    );
    const sidebarContainer = container.querySelector<HTMLElement>(
      '[data-slot="sidebar-container"]',
    );

    expect(sidebarContainer).toHaveClass("z-navigation");

    fireEvent.pointerEnter(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.fast - 1);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(sidebarContainer).toHaveClass("w-(--sidebar-width-icon)");
    expect(sidebarContainer).not.toHaveClass("w-(--sidebar-width)");

    advanceTime(1);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsible", "");
    expect(sidebar).toHaveAttribute("data-hover-open");
    expect(gap).toHaveAttribute("data-collapsible", "icon");
    expect(sidebarContainer).toHaveClass("w-(--sidebar-width)");
    expect(sidebarContainer).not.toHaveClass("w-(--sidebar-width-icon)");

    fireEvent.pointerLeave(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.normal - 1);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    fireEvent.pointerEnter(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.normal);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    fireEvent.pointerLeave(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.normal);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(sidebar).not.toHaveAttribute("data-hover-open");
  });

  it.each(["floating", "inset"] as const)(
    "expands the %s panel while its layout gap remains collapsed",
    (variant) => {
      const { container } = render(<SidebarFixture variant={variant} />);
      const sidebar = getDesktopSidebar(container);
      const gap = container.querySelector<HTMLElement>(
        '[data-slot="sidebar-gap"]',
      );
      const sidebarContainer = container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(sidebarContainer).toHaveClass(
        "w-[calc(var(--sidebar-width-icon)+var(--spacing-4)+var(--spacing-0-5))]",
      );
      expect(gap).toHaveClass(
        "data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+var(--spacing-4))]",
      );

      fireEvent.pointerEnter(sidebar, { pointerType: "mouse" });
      advanceTime(tokens.motion.duration.fast);

      expect(sidebarContainer).toHaveClass("w-(--sidebar-width)");
      expect(sidebarContainer).not.toHaveClass(
        "w-[calc(var(--sidebar-width-icon)+var(--spacing-4)+var(--spacing-0-5))]",
      );
      expect(gap).toHaveAttribute("data-collapsible", "icon");
    },
  );

  it("preserves a consumer width override", () => {
    const { container } = render(<SidebarFixture sidebarClassName="w-96" />);
    const sidebarContainer = container.querySelector<HTMLElement>(
      '[data-slot="sidebar-container"]',
    );

    expect(sidebarContainer).toHaveClass("w-96");
    expect(sidebarContainer).not.toHaveClass("w-(--sidebar-width-icon)");
  });

  it("pins a preview open and only then updates controlled state and cookies", () => {
    const onOpenChange = vi.fn();

    function ControlledSidebar() {
      const [open, setOpen] = React.useState(false);

      return (
        <SidebarFixture
          open={open}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
        />
      );
    }

    const { container } = render(<ControlledSidebar />);
    const sidebar = getDesktopSidebar(container);

    fireEvent.pointerEnter(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.fast);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("sidebar_state=");
    expect(
      screen.getByRole("button", { name: "Pin sidebar open" }),
    ).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Pin sidebar open" }));

    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(document.cookie).toContain("sidebar_state=true");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(sidebar).not.toHaveAttribute("data-hover-open");

    fireEvent.pointerLeave(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.normal);
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.cookie).toContain("sidebar_state=false");
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
  });

  it("pins an active preview with the keyboard shortcut", () => {
    const { container } = render(<SidebarFixture />);
    const sidebar = getDesktopSidebar(container);

    fireEvent.pointerEnter(sidebar, { pointerType: "mouse" });
    advanceTime(tokens.motion.duration.fast);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    expect(screen.getByTestId("sidebar-state")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(sidebar).not.toHaveAttribute("data-hover-open");
  });

  it.each([
    {
      name: "hover expansion is disabled",
      collapsible: "icon" as const,
      hoverExpand: false,
      pointerType: "mouse",
    },
    {
      name: "the pointer is not a mouse",
      collapsible: "icon" as const,
      hoverExpand: true,
      pointerType: "touch",
    },
    {
      name: "the sidebar uses offcanvas collapse",
      collapsible: "offcanvas" as const,
      hoverExpand: true,
      pointerType: "mouse",
    },
    {
      name: "the sidebar is fixed",
      collapsible: "none" as const,
      hoverExpand: true,
      pointerType: "mouse",
    },
  ])("does not preview when $name", (fixture) => {
    const { container } = render(
      <SidebarFixture
        collapsible={fixture.collapsible}
        hoverExpand={fixture.hoverExpand}
      />,
    );
    const sidebar = getDesktopSidebar(container);

    fireEvent.pointerEnter(sidebar, { pointerType: fixture.pointerType });
    advanceTime(tokens.motion.duration.normal);

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(sidebar).not.toHaveAttribute("data-hover-open");
  });

  it("keeps mobile behavior click-only", () => {
    setViewport(MOBILE_WIDTH);
    render(<SidebarFixture />);

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("Close navigation");
    expect(screen.getByRole("dialog", { name: "Sidebar" })).toHaveAttribute(
      "data-mobile",
      "true",
    );
  });
});
