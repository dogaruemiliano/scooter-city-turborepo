import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { expect, it, vi } from "vitest";
import {
  ScooterItpValidityFields,
  itpValidityReadings,
} from "./ScooterItpValidityFields";
import { scooterEditorDefaults } from "./scooter-editor-schema";
vi.mock("@/lib/api", () => ({ webApi: { fetch: vi.fn() } }));
function document(date: string, id = "certificate") {
  return {
    id,
    fileName: `${id}.pdf`,
    extractedData: {
      vin: null,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "row",
          documentType: "itp_certificate" as const,
          pages: [1],
          vin: null,
          fields: {},
          rawFields: {},
          inspections: [
            {
              inspectionDate: "2026-01-01",
              validUntil: date,
              result: "passed" as const,
              certificateNumber: null,
              odometerKm: null,
              rawFields: {},
            },
          ],
        },
      ],
    },
  };
}
function Harness({
  evidence,
  initial = "",
}: {
  evidence: ReturnType<typeof document>[];
  initial?: string;
}) {
  const form = useForm({
    defaultValues: { ...scooterEditorDefaults(), itpValidUntil: initial },
  });
  const value = useWatch({ control: form.control, name: "itpValidUntil" });
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <FormProvider {...form}>
        <ScooterItpValidityFields evidence={evidence} />
        <output>{value}</output>
      </FormProvider>
    </NextIntlClientProvider>
  );
}
it("extracts just the next ITP validity date into a single date field", async () => {
  render(<Harness evidence={[document("2027-01-01")]} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("2027-01-01"),
  );
  expect(screen.getAllByLabelText("Valid until")).toHaveLength(1);
  expect(screen.queryByLabelText("Inspection result")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Certificate number")).not.toBeInTheDocument();
});
it("keeps an existing date and presents conflicting extracted dates for review", () => {
  render(
    <Harness
      initial="2028-01-01"
      evidence={[document("2027-01-01"), document("2027-02-01", "card")]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("2028-01-01");
  expect(screen.getByRole("alert")).toHaveTextContent(
    messages.en.scooters.compliance.itpConflict,
  );
  expect(
    screen.getAllByRole("button", { name: /Use extracted date/ }),
  ).toHaveLength(2);
});
it("ignores a future appointment instead of using it as a validity date", () => {
  const evidence = document("2099-12-31");
  evidence.extractedData.documents[0]!.inspections[0]!.inspectionDate =
    "2099-01-01";
  expect(itpValidityReadings([evidence])).toEqual([]);
});
