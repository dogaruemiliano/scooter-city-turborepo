import { messages, type SupportedLocale } from "@repo/i18n";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScooterDocumentImport } from "./ScooterDocumentImport";
import { ScooterImportReviewProvider } from "./ScooterImportReview";
import { MAX_IMPORT_CHARACTERS } from "./scooter-document-import";
import type { DocumentSource } from "./scooter-document-sources";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

const brands = [
  {
    id: "brand-kymco",
    name: "KYMCO",
    code: "KYM",
    scooterCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function setup(
  locale: SupportedLocale = "en",
  sources: DocumentSource[] = [],
  initialValues: Partial<ScooterEditorValues> = {},
) {
  const browser = userEvent.setup({ applyAccept: false });
  const onImport = vi.fn();
  const onRawFields = vi.fn();
  function Harness() {
    const form = useForm<ScooterEditorValues>({
      defaultValues: {
        ...scooterEditorDefaults(),
        vin: "RFBV70010A1100233",
        brandId: brands[0]!.id,
        powertrainType: "combustion",
        color: "Blue",
        notes: "Manually reviewed condition",
        ...initialValues,
      },
    });
    const values = useWatch({ control: form.control });
    return (
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        <FormProvider {...form}>
          <ScooterImportReviewProvider editing={false} sources={sources}>
            <ScooterDocumentImport
              brands={brands}
              editing={false}
              disabled={false}
              rawFields={{}}
              sources={sources}
              onRawFields={onRawFields}
              onImport={onImport}
            />
          </ScooterImportReviewProvider>
          <output data-testid="form-values">{JSON.stringify(values)}</output>
        </FormProvider>
      </NextIntlClientProvider>
    );
  }
  const view = render(<Harness />);
  const copy = messages[locale].scooters.documentImport;
  const formValues = () =>
    JSON.parse(
      screen.getByTestId("form-values").textContent!,
    ) as ScooterEditorValues;
  async function openEditor(text: string) {
    await browser.click(screen.getByRole("button", { name: copy.open }));
    await browser.click(screen.getByRole("button", { name: copy.editJson }));
    const textarea = screen.getByLabelText(
      copy.jsonLabel,
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: text } });
    return textarea;
  }
  async function uploadFile(file: File) {
    if (!screen.queryByLabelText(copy.upload))
      await browser.click(screen.getByRole("button", { name: copy.open }));
    await browser.upload(screen.getByLabelText(copy.upload), file);
  }
  async function uploadText(
    text: string,
    name = "scooter.json",
    type = "application/json",
  ) {
    const file = jsonFile(text, name, type);
    await uploadFile(file);
    return file;
  }
  return {
    browser,
    copy,
    formValues,
    onImport,
    onRawFields,
    openEditor,
    uploadFile,
    uploadText,
    unmount: view.unmount,
  };
}

function jsonFile(
  text: string,
  name = "scooter.json",
  type = "application/json",
) {
  const file = new File([text], name, { type });
  Object.defineProperty(file, "text", {
    value: vi.fn().mockResolvedValue(text),
    configurable: true,
  });
  return file;
}

afterEach(() => vi.restoreAllMocks());

describe("scooter JSON import feedback", () => {
  it("uploads the source-aware JSON file and preserves source data until confirmation", async () => {
    const vin = "RFBV70010A1100233";
    const sources: DocumentSource[] = [
      { sourceId: "civ-upload", type: "civ", fileName: "civ.pdf" },
    ];
    const { browser, copy, formValues, onImport, onRawFields, uploadText } =
      setup("ro", sources);
    const before = formValues();
    await uploadText(
      JSON.stringify({
        schemaVersion: 2,
        documents: [
          {
            sourceId: "civ-upload",
            documentType: "civ",
            vin,
            fields: { color: "Roșu", powerKw: 1.8 },
            rawFields: { E: vin, R: "Roșu", "P.2": "1,8" },
          },
        ],
      }),
    );
    expect(
      await screen.findByText(
        copy.fileReady.replace("{fileName}", "scooter.json"),
      ),
    ).toBeInTheDocument();
    expect(formValues()).toEqual(before);
    expect(onImport).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: copy.apply }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(formValues()).toMatchObject({ color: "Roșu", powerKw: "1.8" });
    expect(onRawFields).toHaveBeenCalledWith({
      E: vin,
      R: "Roșu",
      "P.2": "1,8",
    });
  });

  it.each(["", "text/plain", "application/json"])(
    "reads a UTF-8 .JSON file with MIME %s and applies only after confirmation",
    async (type) => {
      const { browser, copy, formValues, onImport, uploadText } = setup();
      const before = formValues();
      await uploadText('{"color":"Roșu"}', "scuter.JSON", type);
      expect(
        await screen.findByText(
          copy.fileReady.replace("{fileName}", "scuter.JSON"),
        ),
      ).toHaveTextContent("scuter.JSON");
      expect(screen.queryByLabelText(copy.jsonLabel)).not.toBeInTheDocument();
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
      await browser.click(screen.getByRole("button", { name: copy.apply }));
      await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
      expect(formValues().color).toBe("Roșu");
    },
  );

  it.each(["malformed", "wrong type", "read failure", "byte ceiling"] as const)(
    "clears a ready file on %s and cannot import stale data",
    async (failure) => {
      const { copy, formValues, onImport, uploadText, uploadFile } = setup();
      const before = formValues();
      await uploadText('{"color":"Red"}');
      expect(
        await screen.findByText(
          copy.fileReady.replace("{fileName}", "scooter.json"),
        ),
      ).toHaveTextContent("scooter.json");
      const file = jsonFile(
        failure === "malformed"
          ? String.raw`{"bodyType":"two\_wheel\_moped"}`
          : '{"color":"Green"}',
        failure === "wrong type" ? "document.pdf" : "replacement.json",
      );
      if (failure === "read failure")
        vi.mocked(file.text).mockRejectedValue(new Error("Cannot read"));
      if (failure === "byte ceiling")
        Object.defineProperty(file, "size", {
          value: MAX_IMPORT_CHARACTERS * 4 + 1,
        });
      await uploadFile(file);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        failure === "malformed"
          ? copy.invalidJson
          : failure === "wrong type"
            ? copy.invalidFileType
            : failure === "read failure"
              ? copy.fileReadError
              : "1,000,000",
      );
      if (failure === "wrong type" || failure === "byte ceiling")
        expect(file.text).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: copy.apply }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          copy.fileReady.replace("{fileName}", "scooter.json"),
        ),
      ).not.toBeInTheDocument();
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
    },
  );

  it("can select the same file again after a read failure", async () => {
    const { copy, uploadFile } = setup();
    const file = jsonFile('{"color":"Red"}');
    vi.mocked(file.text).mockRejectedValueOnce(new Error("Read failed"));
    await uploadFile(file);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.fileReadError,
    );
    await uploadFile(file);
    expect(
      await screen.findByText(
        copy.fileReady.replace("{fileName}", "scooter.json"),
      ),
    ).toHaveTextContent("scooter.json");
    expect(file.text).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a replaced file that finishes reading later", async () => {
    const { browser, copy, formValues, uploadFile, uploadText } = setup();
    const slow = jsonFile('{"color":"Red"}', "slow.json");
    let finish!: (text: string) => void;
    vi.mocked(slow.text).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await uploadFile(slow);
    expect(
      screen.getByRole("button", { name: copy.readingFile }),
    ).toBeEnabled();
    await uploadText('{"color":"Green"}', "latest.json");
    finish('{"color":"Red"}');
    expect(
      await screen.findByText(
        copy.fileReady.replace("{fileName}", "latest.json"),
      ),
    ).toHaveTextContent("latest.json");
    await browser.click(screen.getByRole("button", { name: copy.apply }));
    await waitFor(() => expect(formValues().color).toBe("Green"));
  });

  it("ignores a read completing after the dialog closes and reopens", async () => {
    const { browser, copy, formValues, onImport, uploadFile } = setup();
    const before = formValues();
    const file = jsonFile('{"color":"Red"}');
    let finish!: (text: string) => void;
    vi.mocked(file.text).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await uploadFile(file);
    await browser.keyboard("{Escape}");
    await browser.click(screen.getByRole("button", { name: copy.open }));
    finish('{"color":"Red"}');
    await waitFor(() =>
      expect(screen.getByRole("button", { name: copy.upload })).toBeEnabled(),
    );
    expect(
      screen.queryByText(copy.fileReady.replace("{fileName}", "scooter.json")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: copy.apply }),
    ).not.toBeInTheDocument();
    expect(formValues()).toEqual(before);
    expect(onImport).not.toHaveBeenCalled();
  });

  it.each(["en", "ro"] as const)(
    "reports short Markdown-escaped JSON as syntax failure in %s, without a size warning",
    async (locale) => {
      const { browser, copy, formValues, onImport, onRawFields, openEditor } =
        setup(locale);
      const before = formValues();
      const text = String.raw`{"bodyType":"two\_wheel\_moped","typeApprovalNumber":"e4\*2002/24\*2438\*00"}`;
      expect(text.length).toBeLessThan(100);
      await openEditor(text);
      await browser.click(screen.getByRole("button", { name: copy.apply }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy.invalidJson);
      expect(alert.textContent).not.toMatch(/250\D?000/);
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
      expect(onRawFields).not.toHaveBeenCalled();
    },
  );

  it("imports ordinary underscores and asterisks without changing printed CIV values", async () => {
    const { browser, copy, formValues, onImport, onRawFields, openEditor } =
      setup();
    const rawFields = {
      K: "e4*2002/24*2438*00",
      "P.2": "2,68",
      "4": "L1e moped",
      "6": "-",
    };
    await openEditor(
      JSON.stringify({
        bodyType: "two_wheel_moped",
        typeApprovalNumber: "e4*2002/24*2438*00",
        civRawFields: rawFields,
      }),
    );
    await browser.click(screen.getByRole("button", { name: copy.apply }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(formValues()).toMatchObject({
      bodyType: "two_wheel_moped",
      typeApprovalNumber: "e4*2002/24*2438*00",
      notes: "Manually reviewed condition",
    });
    expect(onRawFields).toHaveBeenCalledExactlyOnceWith(rawFields);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["en", "ro"] as const)(
    "shows actual oversized file counts in %s and cannot apply the previous draft",
    async (locale) => {
      const {
        copy,
        formValues,
        onImport,
        onRawFields,
        openEditor,
        uploadText,
      } = setup(locale);
      const before = formValues();
      const textarea = await openEditor('{"color":"Red"}');
      const text = " ".repeat(MAX_IMPORT_CHARACTERS + 1);
      await uploadText(text);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        new Intl.NumberFormat(locale).format(text.length),
      );
      expect(alert).toHaveTextContent(
        new Intl.NumberFormat(locale).format(MAX_IMPORT_CHARACTERS),
      );
      expect(alert.textContent).not.toBe(copy.invalidJson);
      expect(textarea).toHaveValue("");
      expect(
        screen.queryByRole("button", { name: copy.apply }),
      ).not.toBeInTheDocument();
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
      expect(onRawFields).not.toHaveBeenCalled();
    },
  );

  it.each(["append", "replace selection"] as const)(
    "rejects an oversized native %s before truncation and keeps the previous draft",
    async (mode) => {
      const { copy, formValues, onImport, openEditor } = setup();
      const before = formValues();
      const previous = '{"color":"Blue"}';
      const textarea = await openEditor(previous);
      const start =
        mode === "append" ? previous.length : previous.indexOf("Blue");
      const end = mode === "append" ? start : start + "Blue".length;
      textarea.focus();
      textarea.setSelectionRange(start, end);
      const pasted = "x".repeat(MAX_IMPORT_CHARACTERS + 1);
      const event = createEvent.paste(textarea, {
        clipboardData: { getData: () => pasted },
      });
      fireEvent(textarea, event);
      expect(event.defaultPrevented).toBe(true);
      expect(textarea).toHaveValue(previous);
      expect(screen.getByRole("alert")).toHaveTextContent(
        new Intl.NumberFormat("en").format(
          previous.length - (end - start) + pasted.length,
        ),
      );
      expect(screen.getByRole("button", { name: copy.apply })).toBeDisabled();
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
    },
  );

  it("allows a native replacement exactly at the limit using the resulting value, not the old plus new length", async () => {
    const { browser, copy, formValues, onImport, openEditor } = setup();
    const previous = '{"color":"Blue"}';
    const textarea = await openEditor(previous);
    const replacement = '{"color":"Red"}'.padEnd(MAX_IMPORT_CHARACTERS, " ");
    textarea.focus();
    textarea.setSelectionRange(0, previous.length);
    const event = createEvent.paste(textarea, {
      clipboardData: { getData: () => replacement },
    });
    fireEvent(textarea, event);
    expect(event.defaultPrevented).toBe(false);
    // user-event's maxLength simulation ignores the selected text being replaced.
    // Emulate the allowed native edit after exercising the actual paste handler.
    fireEvent.change(textarea, { target: { value: replacement } });
    expect(textarea.value.length).toBe(replacement.length);
    expect(textarea.value === replacement).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: copy.apply }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(formValues().color).toBe("Red");
  });

  it.each(["en", "ro"] as const)(
    "identifies missing source evidence in %s without blaming the JSON format",
    async (locale) => {
      const sources: DocumentSource[] = [
        { sourceId: "civ-1", type: "civ", fileName: "civ.pdf" },
        {
          sourceId: "registration-1",
          type: "registration_certificate",
          fileName: "registration.pdf",
        },
      ];
      const { browser, copy, formValues, onImport, onRawFields, openEditor } =
        setup(locale, sources);
      const before = formValues();
      await openEditor(
        JSON.stringify({
          vin: "RFBV70010A1100233",
          bodyType: "two_wheel_moped",
          typeApprovalNumber: "e4*2002/24*2438*00",
        }),
      );
      await browser.click(screen.getByRole("button", { name: copy.apply }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        copy.sourceIssues.coverage
          .replace("{provided}", copy.sourceIssues.none)
          .replace("{uploaded}", "civ.pdf, registration.pdf"),
      );
      expect(alert.textContent).not.toBe(copy.invalidJson);
      expect(alert.textContent).not.toMatch(/old format|format vechi/);
      expect(alert.textContent).not.toMatch(/250\D?000/);
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
      expect(onRawFields).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "ro"] as const)(
    "shows the mismatched JSON and uploaded filenames in %s",
    async (locale) => {
      const sources: DocumentSource[] = [
        { sourceId: "civ-1", type: "civ", fileName: "CIV-004-AGM.pdf" },
        {
          sourceId: "registration-1",
          type: "registration_certificate",
          fileName: "cert-inreg-004-AGM.pdf",
        },
      ];
      const { browser, copy, formValues, onImport, onRawFields, openEditor } =
        setup(locale, sources);
      const before = formValues();
      await openEditor(
        JSON.stringify({
          vin: "RFBV70010A1100233",
          documentVins: sources.map((source) => ({
            fileName:
              source.type === "civ" ? "CIV-002-KYM.pdf" : source.fileName,
            documentType: source.type,
            vin: "RFBV70010A1100233",
          })),
        }),
      );
      await browser.click(screen.getByRole("button", { name: copy.apply }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        copy.sourceIssues.fileNames
          .replace("{provided}", "CIV-002-KYM.pdf, cert-inreg-004-AGM.pdf")
          .replace("{uploaded}", "CIV-004-AGM.pdf, cert-inreg-004-AGM.pdf"),
      );
      expect(formValues()).toEqual(before);
      expect(onImport).not.toHaveBeenCalled();
      expect(onRawFields).not.toHaveBeenCalled();
    },
  );

  it("fills CIV, registration and insurance data when the AI names downloaded copies with (1)", async () => {
    const sources: DocumentSource[] = [
      { sourceId: "civ-1", type: "civ", fileName: "CIV-004-AGM.pdf" },
      {
        sourceId: "registration-1",
        type: "registration_certificate",
        fileName: "cert-inreg-004-AGM.pdf",
      },
      {
        sourceId: "insurance-1",
        type: "insurance",
        fileName: "asigurare-004-AGM.pdf",
      },
    ];
    const vin = "L5YAUCZB9H1148984";
    const { browser, copy, formValues, onImport, onRawFields, uploadText } =
      setup("ro", sources, { vin: "" });
    const rawFields = { E: vin, K: "e4*2002/24*2691*06", "P.2": "1.8" };
    await uploadText(
      JSON.stringify({
        vin,
        civNumber: "T943622",
        bodyType: "two_wheel_moped",
        typeApprovalNumber: "e4*2002/24*2691*06",
        powerKw: 1.8,
        maxSpeedKmh: 25,
        registrationType: "local",
        registrationNumber: "14949",
        registrationCertificateNumber: "BUJORENI-VL-176/18",
        registrationDate: "2026-09-01",
        civRawFields: rawFields,
        documentVins: sources.map((source) => ({
          fileName: source.fileName.replace(".pdf", "(1).pdf"),
          documentType: source.type,
          vin,
        })),
        insurancePolicies: [
          {
            insuredName: "DOGARU EMILIANO CONSTANTIN",
            validFrom: "2026-09-13",
            validUntil: "2027-09-12",
            premiumAmount: 278.88,
            currency: "RON",
            documentVin: vin,
            sourceFileNames: ["asigurare-004-AGM(1).pdf"],
            rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
          },
        ],
      }),
    );
    await browser.click(screen.getByRole("button", { name: copy.apply }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(formValues()).toMatchObject({
      vin,
      civNumber: "T943622",
      bodyType: "two_wheel_moped",
      typeApprovalNumber: "e4*2002/24*2691*06",
      powerKw: "1.8",
      registrationType: "local",
      registrationNumber: "14949",
      registrationCertificateNumber: "BUJORENI-VL-176/18",
      registrationDate: "2026-09-01",
      requiredLicenseCategory: "none",
      insurancePolicies: [
        {
          insuredName: "DOGARU EMILIANO CONSTANTIN",
          validFrom: "2026-09-13",
          validUntil: "2027-09-12",
          premiumAmount: "278.88",
          currency: "RON",
          documentVin: vin,
          sourceFileNames: ["asigurare-004-AGM.pdf"],
          rawFields: { premiumAmount: "278,88 Lei", currency: "Lei" },
        },
      ],
      notes: "Manually reviewed condition",
    });
    expect(onRawFields).toHaveBeenCalledExactlyOnceWith(rawFields);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
