import { SheetSelect } from "@repo/ui/components/sheet-select";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps snapPoint controlled across initial viewport detection, filtering, and resizing", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  let onResize = () => {};
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: (_: string, listener: () => void) => {
        onResize = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
  render(
    <SheetSelect
      label="Choose a brand"
      value=""
      options={[{ value: "honda", label: "Honda" }]}
      onValueChange={vi.fn()}
    />,
  );
  const browser = userEvent.setup();
  await browser.click(screen.getByRole("button", { name: "Choose a brand" }));
  const search = screen.getByRole("textbox", { name: "Search options" });
  await browser.type(search, "no results");
  expect(screen.getByText("No options found")).toBeInTheDocument();
  await browser.clear(search);
  expect(screen.getByRole("button", { name: "Honda" })).toBeInTheDocument();
  act(() => {
    vi.stubGlobal("innerWidth", 1280);
    onResize();
  });
  act(() => {
    vi.stubGlobal("innerWidth", 390);
    onResize();
  });
  const warnings = [...consoleError.mock.calls, ...consoleWarn.mock.calls]
    .flat()
    .join(" ");
  expect(warnings).not.toMatch(/snapPoint|uncontrolled|controlled/i);
});

it("uses dashed borders only for empty card triggers", () => {
  render(
    <>
      <SheetSelect
        label="Card picker"
        triggerVariant="card"
        value="honda"
        options={[{ value: "honda", label: "Honda" }]}
        onValueChange={vi.fn()}
        className="border border-border"
        triggerContent={<span>Honda card</span>}
      />
      <SheetSelect
        label="Empty card picker"
        triggerVariant="card"
        value=""
        options={[]}
        onValueChange={vi.fn()}
      />
      <SheetSelect
        label="Text picker"
        value="honda"
        options={[{ value: "honda", label: "Honda" }]}
        onValueChange={vi.fn()}
      />
    </>,
  );
  const card = screen.getByRole("button", { name: "Card picker" });
  expect(card).not.toHaveClass("border-dashed");
  expect(screen.getByRole("button", { name: "Empty card picker" })).toHaveClass(
    "border-dashed",
    "border-(length:--dashed-surface-border-width)",
    "border-input",
  );
  expect(card).toHaveTextContent("Honda card");
  expect(screen.getByRole("button", { name: "Text picker" })).not.toHaveClass(
    "border-dashed",
  );
});
