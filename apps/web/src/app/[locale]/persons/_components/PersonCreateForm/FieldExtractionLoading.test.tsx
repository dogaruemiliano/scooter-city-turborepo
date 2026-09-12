import { messages } from "@repo/i18n";
import { Input } from "@repo/ui/components";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ExtractionReviewContext } from "./ExtractionReviewContext";
import { FormField } from "./FormField";
import { createEmptyCreateForm, createInitialDocuments } from "./form-state";
import {
  createExtractionState,
  markExtractionFieldEdited,
  type ExtractionState,
} from "./extraction-state";

function Fields({
  state,
  pending = [],
}: {
  state: ExtractionState;
  pending?: string[];
}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExtractionReviewContext.Provider
        value={{
          state,
          pendingDocumentKeys: new Set(pending),
          onApplySuggestion: vi.fn(),
        }}
      >
        <FormField
          id="firstName"
          label="First name"
          extractionKey="person.firstName"
        >
          <Input id="firstName" />
        </FormField>
        <FormField id="city" label="Locality" extractionKey="person.city">
          <Input id="city" />
        </FormField>
        <FormField id="email" label="Email" extractionKey="person.email">
          <Input id="email" />
        </FormField>
        {state.form.documents.map((document) => (
          <FormField
            key={document.key}
            id={document.key}
            label={`${document.type} number`}
            extractionKey={`document.${document.key}.number`}
          >
            <Input id={document.key} />
          </FormField>
        ))}
      </ExtractionReviewContext.Provider>
    </NextIntlClientProvider>
  );
}

function pendingName(field: string) {
  return `Reading ${field} from document…`;
}

describe("field extraction loading feedback", () => {
  it("spins beside relevant fields while waiting, without disabling editing or changing labels", () => {
    const state = createExtractionState(createEmptyCreateForm("foreign"));
    render(<Fields state={state} pending={["foreign-passport"]} />);
    expect(
      screen.getByRole("status", { name: pendingName("First name") }),
    ).toHaveClass("animate-spin", "motion-reduce:animate-none");
    expect(
      screen.getByRole("status", { name: pendingName("passport number") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: pendingName("visa number") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: pendingName("Email") }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "First name" })).toBeEnabled();
  });

  it("stops for autofilled fields while another document is still being read", () => {
    const state = createExtractionState(createEmptyCreateForm("foreign"));
    state.form.firstName = "Ana";
    state.autofilled["person.firstName"] = { value: "Ana", previousValue: "" };
    const { rerender } = render(
      <Fields state={state} pending={["foreign-passport", "foreign-visa"]} />,
    );
    expect(
      screen.queryByRole("status", { name: pendingName("First name") }),
    ).not.toBeInTheDocument();
    rerender(<Fields state={state} pending={["foreign-visa"]} />);
    expect(
      screen.queryByRole("status", { name: pendingName("passport number") }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: pendingName("visa number") }),
    ).toBeInTheDocument();
  });

  it("does not show waiting feedback for operator edits, including intentional clears", () => {
    let state = createExtractionState(createEmptyCreateForm("foreign"));
    state = markExtractionFieldEdited(state, "person.firstName");
    state = markExtractionFieldEdited(
      state,
      "document.foreign-passport.number",
    );
    render(<Fields state={state} pending={["foreign-passport"]} />);
    expect(
      screen.queryByRole("status", { name: pendingName("First name") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: pendingName("passport number") }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: pendingName("Locality") }),
    ).toBeInTheDocument();
  });

  it("removes all spinners when requests finish or are cancelled and restores them on retry", () => {
    const state = createExtractionState(createEmptyCreateForm("foreign"));
    const { rerender } = render(
      <Fields state={state} pending={["foreign-passport"]} />,
    );
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    rerender(<Fields state={state} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<Fields state={state} pending={["foreign-passport"]} />);
    expect(
      screen.getByRole("status", { name: pendingName("First name") }),
    ).toBeInTheDocument();
  });

  it("waits for the residence proof for electronic ID address fields", () => {
    const state = createExtractionState(createEmptyCreateForm("romanian"));
    state.form.documents = createInitialDocuments("romanian", "electronic");
    const { rerender } = render(
      <Fields state={state} pending={["romanian-electronic-national-id"]} />,
    );
    expect(
      screen.getByRole("status", { name: pendingName("First name") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: pendingName("Locality") }),
    ).not.toBeInTheDocument();
    rerender(<Fields state={state} pending={["romanian-proof-of-address"]} />);
    expect(
      screen.getByRole("status", { name: pendingName("Locality") }),
    ).toBeInTheDocument();
  });
});
