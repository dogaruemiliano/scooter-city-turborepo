import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import userEvent from "@testing-library/user-event";
import { v1 } from "@repo/api-shared";
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
  evidence: Pick<
    v1.scooters.ScooterDocument,
    "id" | "fileName" | "extractedData"
  >[];
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

function pairedEvidence(unreadable = false) {
  const certificate = document("2028-09-14");
  const first = certificate.extractedData.documents[0]!;
  const original = first.inspections[0]!;
  const yellow = document("2028-09-14", "yellow");
  const certificateData: v1.scooters.ScooterDocumentExtractedData = {
    ...certificate.extractedData,
    documents: [
      {
        ...first,
        inspections: [
          { ...original, validUntil: null, certificateNumber: "B0123ABC45" },
        ],
      },
    ],
  };
  const cardData: v1.scooters.ScooterDocumentExtractedData = {
    ...yellow.extractedData,
    documents: [
      {
        ...first,
        documentType: "itp_card",
        inspections: [
          {
            ...original,
            inspectionDate: null,
            validUntil: unreadable ? null : original.validUntil,
            result: null,
            certificateNumber: "B0123 ABC45",
          },
        ],
      },
    ],
  };
  return [
    { ...certificate, extractedData: certificateData },
    { ...yellow, extractedData: cardData },
  ];
}

it("fills the expiry from the yellow card when the A4 certificate refers to the annex", async () => {
  render(<Harness evidence={pairedEvidence()} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("2028-09-14"),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("explains manual recovery for unreadable handwriting and accepts a user-entered date", async () => {
  const user = userEvent.setup();
  render(<Harness evidence={pairedEvidence(true)} />);
  expect(
    screen.getByText(messages.en.scooters.itp.manualRecovery),
  ).toBeVisible();
  await user.type(screen.getByPlaceholderText("DD"), "14");
  await user.type(screen.getByPlaceholderText("MM"), "09");
  await user.type(screen.getByPlaceholderText("YYYY"), "2028");
  expect(screen.getByRole("status")).toHaveTextContent("2028-09-14");
  expect(screen.getByText(messages.en.scooters.itp.manualSource)).toBeVisible();
});

it("retracts an automatic date when later evidence conflicts while preserving manual values", async () => {
  const { rerender } = render(<Harness evidence={[document("2027-01-01")]} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("2027-01-01"),
  );
  rerender(
    <Harness
      evidence={[document("2027-01-01"), document("2027-02-01", "other")]}
    />,
  );
  await waitFor(() => expect(screen.getByRole("status")).toBeEmptyDOMElement());
  expect(screen.getByRole("alert")).toBeVisible();
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
