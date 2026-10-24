import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { messages } from "@repo/i18n";
import { PageLayout } from "@repo/ui/components/page-layout";
import { WizardForm } from "@repo/ui/components/wizard-form";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";

import CompanyLayout from "@/app/[locale]/company/layout";
import FinanceLayout from "@/app/[locale]/finance/layout";
import ScootersLoading from "@/app/[locale]/scooters/loading";
import ScootersError from "@/app/[locale]/scooters/error";
import FinanceListLoading from "@/app/[locale]/finance/_components/FinanceListLoading";

it("forwards landmark attributes and refs without adding a scroll or clipping boundary", () => {
  const ref = createRef<HTMLElement>();
  render(
    <PageLayout ref={ref} aria-label="Scooters" aria-busy>
      <p>Content</p>
    </PageLayout>,
  );
  expect(screen.getByRole("main", { name: "Scooters" })).toBe(ref.current);
  expect(ref.current).toHaveAttribute("aria-busy", "true");
  expect(ref.current).not.toHaveClass("overflow-hidden", "overflow-y-auto");
});

it("uses the same page boundary for section layouts, loading and error views", () => {
  function localized(children: React.ReactNode) {
    return (
      <NextIntlClientProvider locale="en" messages={messages.en}>
        {children}
      </NextIntlClientProvider>
    );
  }
  const view = render(localized(<ScootersLoading />));
  const classes = screen.getByRole("main").className;
  view.rerender(
    localized(<ScootersError error={new Error("offline")} reset={() => {}} />),
  );
  expect(screen.getByRole("main").className).toBe(classes);
  view.rerender(
    <CompanyLayout>
      <p>Company</p>
    </CompanyLayout>,
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("main").className).toBe(classes);
  view.rerender(
    localized(
      <FinanceLayout>
        <FinanceListLoading />
      </FinanceLayout>,
    ),
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("main").className).toBe(classes);
});

it("supports an unpadded wizard without changing step navigation", () => {
  function Example() {
    const [activeIndex, setActiveIndex] = useState(0);
    return (
      <PageLayout paddingX="none" paddingTop="compact">
        <WizardForm
          activeIndex={activeIndex}
          onStepChange={setActiveIndex}
          progressLabel="Progress"
          steps={[
            {
              id: "details",
              label: "Details",
              content: <input aria-label="Name" />,
            },
            { id: "review", label: "Review", content: <p>Ready to review</p> },
          ]}
          footer={
            <button type="button" onClick={() => setActiveIndex(1)}>
              Review details
            </button>
          }
        />
      </PageLayout>
    );
  }
  render(<Example />);
  expect(screen.getByRole("main")).toHaveAttribute("data-padding-x", "none");
  fireEvent.click(screen.getByRole("button", { name: "Review details" }));
  expect(screen.getByRole("heading", { name: "Review" })).toHaveFocus();
  expect(screen.getByText("Ready to review")).toBeVisible();
});

it("allows explicit sizing and spacing exceptions without nesting main landmarks", () => {
  const view = render(
    <PageLayout width="full" paddingX="none" paddingTop="none">
      Editor
    </PageLayout>,
  );
  expect(screen.getByRole("main")).toHaveAttribute("data-width", "full");
  expect(screen.getByRole("main")).not.toHaveClass(
    "px-(--page-gutter)",
    "pt-6",
  );
  view.rerender(
    <main>
      <PageLayout as="div" width="form">
        Embedded content
      </PageLayout>
    </main>,
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByText("Embedded content")).toHaveAttribute(
    "data-width",
    "form",
  );
});
