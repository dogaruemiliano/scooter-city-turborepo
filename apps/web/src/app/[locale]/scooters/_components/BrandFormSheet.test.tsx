import { messages } from "@repo/i18n";
import { Button } from "@repo/ui/components/button";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { BrandFormSheet } from "./BrandFormSheet";

vi.mock("@/lib/api", () => ({ webApi: { fetch: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Flight can wrap a server-provided element in a lazy node without .props.
// This resolved wrapper exercises that shape without depending on a server.
function serverTrigger(
  element: ReactElement,
): ComponentProps<typeof BrandFormSheet>["trigger"] {
  return {
    $$typeof: Symbol.for("react.lazy"),
    _payload: element,
    _init: (payload: ReactElement) => payload,
  } as unknown as ComponentProps<typeof BrandFormSheet>["trigger"];
}

it("server-renders a lazy trigger and preserves its label and sheet interaction", async () => {
  const content = (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <BrandFormSheet
        trigger={serverTrigger(<Button type="button">Add brand</Button>)}
      />
    </NextIntlClientProvider>
  );
  expect(renderToString(content)).toContain("Add brand");
  render(content);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Add brand" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("Name")).toBeVisible();
  const surface = screen.getByRole("dialog");
  expect(surface).toHaveClass("bg-popover");
  expect(surface).not.toHaveClass("bg-background");
});
