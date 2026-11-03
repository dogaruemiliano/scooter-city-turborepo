import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

describe("scrollable tab fades", () => {
  it("keeps the shared fade fixed within the tab padding at every scroll position", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList aria-label="Categories">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole("tablist");
    const mask = list.style.getPropertyValue("--scroll-fade-mask");
    expect(mask).toContain("var(--scroll-fade-width)");
    expect(list.style.getPropertyValue("--scroll-fade-start")).toBe(
      "transparent",
    );
    expect(list.style.getPropertyValue("--scroll-fade-end")).toBe(
      "transparent",
    );
    expect(list).toHaveClass(
      "group-data-horizontal/tabs:px-(--scroll-fade-width)",
      "group-data-horizontal/tabs:mask-(--scroll-fade-mask)",
    );
    Object.defineProperties(list, {
      scrollWidth: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 300 },
    });
    for (const offset of [0, 1, 150, 299, 300]) {
      list.scrollLeft = offset;
      fireEvent.scroll(list);
      expect(list.style.getPropertyValue("--scroll-fade-mask")).toBe(mask);
    }
  });
});
