import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HorizontalScrollArea } from "@repo/ui/components/horizontal-scroll-area";

describe("horizontal overflow fades", () => {
  it("enables independent edge fades using the same spacing token as tabs", () => {
    render(
      <HorizontalScrollArea label="Drafts" fadeEdges>
        <button>Draft one</button>
      </HorizontalScrollArea>,
    );
    const viewport = screen.getByRole("region", { name: "Drafts" });
    expect(viewport.className).toContain(
      "data-[overflow-x-start]:[--scroll-fade-start:transparent]",
    );
    expect(viewport.className).toContain(
      "data-[overflow-x-end]:[--scroll-fade-end:transparent]",
    );
    expect(viewport.style.getPropertyValue("--scroll-fade-width")).toBe(
      "var(--spacing-6)",
    );
    expect(viewport.style.maskImage).toContain("var(--scroll-fade-width)");
    expect(screen.getByRole("button", { name: "Draft one" })).toBeEnabled();
  });
  it("reserves scrollbar spacing only on desktop without disabling the viewport", () => {
    render(
      <HorizontalScrollArea label="Drafts" scrollbarVisibility="desktop">
        <button>Draft one</button>
      </HorizontalScrollArea>,
    );
    const viewport = screen.getByRole("region", { name: "Drafts" });
    const root = viewport.closest('[data-slot="horizontal-scroll-area"]')!;
    expect(root).toHaveClass("lg:data-[has-overflow-x]:pb-5");
    expect(root).not.toHaveClass("data-[has-overflow-x]:pb-5");
    expect(viewport).toHaveAttribute("tabindex", "0");
  });
  it("preserves the unfaded default for existing callers", () => {
    render(
      <HorizontalScrollArea label="Repairs">
        <span>Open</span>
      </HorizontalScrollArea>,
    );
    expect(
      screen.getByRole("region", { name: "Repairs" }).className,
    ).not.toContain("mask-image");
  });
});
