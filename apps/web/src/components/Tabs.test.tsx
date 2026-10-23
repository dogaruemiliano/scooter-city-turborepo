import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

describe("scrollable tab fades", () => {
  it("fades only edges that have hidden tabs", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList aria-label="Categories">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole("tablist");
    expect(list.style.maskImage).toBe("");
    Object.defineProperties(list, {
      scrollWidth: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 300 },
    });
    fireEvent.scroll(list);
    expect(list.style.maskImage).toContain(
      "100% - var(--spacing-6)), transparent",
    );
    expect(list.style.maskImage).toContain("to right, currentColor");
    list.scrollLeft = 150;
    fireEvent.scroll(list);
    expect(list.style.maskImage).toContain("to right, transparent");
    expect(list.style.maskImage).toContain(
      "100% - var(--spacing-6)), transparent",
    );
    list.scrollLeft = 300;
    fireEvent.scroll(list);
    expect(list.style.maskImage).toContain("to right, transparent");
    expect(list.style.maskImage).toContain(
      "100% - var(--spacing-6)), currentColor",
    );
  });
});
