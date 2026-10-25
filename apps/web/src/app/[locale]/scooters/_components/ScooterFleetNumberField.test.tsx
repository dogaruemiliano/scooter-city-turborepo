import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterFleetNumberField } from "./ScooterFleetNumberField";
import { ScooterFleetNumberRefreshContext } from "./ScooterFleetNumberRefreshContext";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ webApi: { fetch } }));
function DraftField({
  manual,
  editing = false,
}: {
  manual?: string;
  editing?: boolean;
}) {
  const form = useForm<ScooterEditorValues>({
    defaultValues: { ...scooterEditorDefaults(), fleetNumber: manual },
  });
  return (
    <FormProvider {...form}>
      <ScooterFleetNumberField brands={[]} disabled={false} editing={editing} />
    </FormProvider>
  );
}
function Fields({
  revision,
  editing = false,
}: {
  revision: number;
  editing?: boolean;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterFleetNumberRefreshContext value={revision}>
        <DraftField editing={editing} />
        <DraftField manual="42" editing={editing} />
      </ScooterFleetNumberRefreshContext>
    </NextIntlClientProvider>
  );
}
beforeEach(() => fetch.mockReset());
describe("remaining draft number suggestions", () => {
  it("refreshes from the API after creation while preserving a manual number", async () => {
    fetch.mockResolvedValue({ fleetNumber: 7 });
    const view = render(<Fields revision={0} />);
    const numbers = screen.getAllByRole("textbox", { name: "Internal number" });
    await waitFor(() => expect(numbers[0]).toHaveValue("7"));
    expect(numbers[1]).toHaveValue("42");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue({ fleetNumber: 12 });
    view.rerender(<Fields revision={1} />);
    await waitFor(() => expect(numbers[0]).toHaveValue("12"));
    expect(numbers[1]).toHaveValue("42");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("does not request automatic numbering for an existing scooter", async () => {
    const view = render(<Fields revision={0} editing />);
    view.rerender(<Fields revision={1} editing />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("textbox", { name: "Internal number" })[1],
      ).toHaveValue("42"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
