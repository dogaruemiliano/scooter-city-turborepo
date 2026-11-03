import * as React from "react";
import { act, fireEvent, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { SidebarProvider, SidebarTrigger } from "@repo/ui/components/sidebar";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("Sidebar trigger first render", () => {
  it.each([true, false])(
    "includes CSS-responsive icons in server HTML when defaultOpen is %s",
    async (defaultOpen) => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) =>
          ({
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
      const fixture = (
        <SidebarProvider defaultOpen={defaultOpen}>
          <SidebarTrigger />
        </SidebarProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(fixture);
      document.body.appendChild(container);

      // The server cannot detect the phone's viewport. Both icons must already
      // be present so CSS shows the burger before any JavaScript runs.
      const menu = container.querySelector(".lucide-menu");
      const panel = container.querySelector(".lucide-panel-left");
      expect(menu).toHaveClass("md:hidden");
      expect(menu).not.toHaveClass("hidden");
      expect(panel).toHaveClass("hidden", "md:block");
      expect(menu).toHaveAttribute("aria-hidden", "true");
      expect(panel).toHaveAttribute("aria-hidden", "true");

      let root: ReturnType<typeof hydrateRoot>;
      const onRecoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container, fixture, { onRecoverableError });
      });
      try {
        expect(onRecoverableError).not.toHaveBeenCalled();
        expect(container.querySelector(".lucide-menu")).toBe(menu);
        expect(container.querySelector(".lucide-panel-left")).toBe(panel);
        const trigger = within(container).getByRole("button", {
          name: "Open navigation",
        });
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(trigger);
        expect(trigger).toHaveTextContent("Close navigation");
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(trigger);
        expect(trigger).toHaveTextContent("Open navigation");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    },
  );
});
