import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, expect, it, vi } from "vitest";
import { ScooterSelect } from "./ScooterSelect";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  webApi: { fetch, url: (path: string) => path },
}));
const scooters = [
  {
    id: "honda",
    fleetNumber: 7,
    brandCode: "HON",
    brand: "Honda",
    model: "Vision",
    registrationNumber: "B123",
    vin: "VINHON",
  },
  {
    id: "yamaha",
    fleetNumber: 8,
    brandCode: "YAM",
    brand: "Yamaha",
    model: "NMAX",
    registrationNumber: "B456",
    vin: "VINYAM",
  },
];
beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({ items: scooters, total: 2, pageSize: 100 });
});
function Harness({ multiple = false }: { multiple?: boolean }) {
  const [single, setSingle] = useState("honda");
  const [many, setMany] = useState<string[]>(["honda"]);
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {multiple ? (
        <ScooterSelect
          label="Scooter"
          multiple
          value={many}
          onValueChange={setMany}
        />
      ) : (
        <ScooterSelect
          label="Scooter"
          value={single}
          onValueChange={setSingle}
        />
      )}
    </NextIntlClientProvider>
  );
}
it("shows the display code, searches by VIN, selects one scooter and closes", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Scooter" })).toHaveTextContent(
      "007 HON",
    ),
  );
  const trigger = screen.getByRole("button", { name: "Scooter" });
  expect(trigger).toHaveTextContent("Honda Vision");
  expect(trigger).toHaveTextContent("B123");
  expect(trigger).toHaveTextContent("Edit");
  expect(trigger).toHaveClass("min-h-24");
  expect(trigger).not.toHaveClass("border-dashed");
  await user.click(trigger);
  const search = screen.getByRole("textbox");
  await user.type(search, "VINYAM");
  expect(
    screen.queryByRole("button", { name: /007 HON/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /008 YAM/ }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveTextContent("008 YAM");
});
it("toggles multiple scooters, preserves the open sheet, and uses the popover surface", async () => {
  const user = userEvent.setup();
  render(<Harness multiple />);
  const trigger = screen.getByRole("button", { name: "Scooter" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Remove 007 HON" }),
    ).toBeInTheDocument(),
  );
  for (const card of document.querySelectorAll(
    '[data-slot="selected-scooter"]',
  )) {
    expect(card).toHaveClass("border", "border-border");
    expect(card).not.toHaveClass("border-dashed");
  }
  expect(trigger).toHaveTextContent("Add more scooters");
  expect(trigger).toHaveClass("border-dashed");
  await user.click(trigger);
  const yamaha = screen.getByRole("button", { name: /008 YAM/ });
  expect(yamaha).toHaveAttribute("aria-pressed", "false");
  await user.click(yamaha);
  expect(yamaha).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(
    document.querySelectorAll('[data-slot="selected-scooter"]'),
  ).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: /007 HON/ }));
  expect(
    document.querySelectorAll('[data-slot="selected-scooter"]'),
  ).toHaveLength(1);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveClass("bg-popover");
  const body = dialog.querySelector('[data-slot="bottom-sheet-body"]');
  expect(body).toHaveClass("pb-0", "overflow-hidden");
  expect(body).not.toHaveClass("pb-4");
  expect(body?.querySelector("ul")).toHaveClass("flex-1", "overflow-y-auto");
  expect(dialog.querySelector(".bg-background")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Remove 008 YAM" }));
  expect(
    document.querySelectorAll('[data-slot="selected-scooter"]'),
  ).toHaveLength(0);
  expect(trigger).toHaveTextContent("Add more scooters");
});
it("loads all pages so later scooters can be selected", async () => {
  fetch
    .mockResolvedValueOnce({ items: [scooters[0]], total: 2, pageSize: 1 })
    .mockResolvedValueOnce({ items: [scooters[1]], total: 2, pageSize: 1 });
  render(<Harness />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][0]).toContain("page=2");
});
