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
    expect(viewport.className).toContain("var(--spacing-6)");
    expect(screen.getByRole("button", { name: "Draft one" })).toBeEnabled();
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
