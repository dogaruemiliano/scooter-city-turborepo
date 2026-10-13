import { render, screen, cleanup } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScooterSectionComplete } from "./ScooterSectionComplete";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);

function Harness({
  values,
  fields,
}: {
  values: Partial<ScooterEditorValues>;
  fields: string[];
}) {
  const form = useForm<ScooterEditorValues>({
    defaultValues: { ...scooterEditorDefaults(), ...values },
  });
  return (
    <FormProvider {...form}>
      <ScooterSectionComplete fields={fields} />
    </FormProvider>
  );
}

describe("section completion", () => {
  it("requires optional fields too and rejects invalid populated values", () => {
    for (const values of [{ model: "" }, { manufactureYear: "invalid" }]) {
      const view = render(
        <Harness
          fields={["model", "manufactureYear"]}
          values={{ model: "Scooter", manufactureYear: "2024", ...values }}
        />,
      );
      expect(screen.queryByText("creation.complete")).toBeNull();
      view.unmount();
    }
  });

  it("allows a complete section while other sections are empty", () => {
    render(
      <Harness
        fields={["model", "manufactureYear"]}
        values={{ model: "Scooter", manufactureYear: "2024" }}
      />,
    );
    expect(screen.getByText("creation.complete")).toBeInTheDocument();
  });

  it("counts an explicit negative equipment choice as filled", () => {
    render(<Harness fields={["hasGps"]} values={{ hasGps: "false" }} />);
    expect(screen.getByText("creation.complete")).toBeInTheDocument();
  });
});
