import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { SaveButton } from "@repo/ui/components/save-button";
import { useFormAction } from "@/lib/form/use-form-action";
import { describe, expect, it, vi } from "vitest";

function Action({
  pending = false,
  error = false,
  success = false,
}: {
  pending?: boolean;
  error?: boolean;
  success?: boolean;
}) {
  const formAction = useFormAction();
  return (
    <SaveButton
      type="submit"
      {...formAction("save", { pending, error, success })}
    />
  );
}
function localized(node: React.ReactNode, locale: "en" | "ro" = "en") {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {node}
    </NextIntlClientProvider>
  );
}
describe("shared submission button", () => {
  it("keeps the action and primary style after failure and permits resubmission", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(
      localized(
        <form onSubmit={submit}>
          <Action error />
        </form>,
      ),
    );
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("data-state", "error");
    expect(button).toHaveClass("bg-primary");
    await userEvent.setup().click(button);
    expect(submit).toHaveBeenCalledOnce();
  });
  it("disables pending/success states and returns to the action when edited", () => {
    const view = render(localized(<Action pending />));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    view.rerender(localized(<Action success />));
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    view.rerender(localized(<Action />));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
  it("localizes the state labels and preserves meaningful destructive variants", () => {
    render(localized(<Action pending />, "ro"));
    expect(screen.getByRole("button", { name: "Se salvează…" })).toBeDisabled();
  });
  it("supports external form owners and purposeful variants", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <>
        <form id="delete-form" onSubmit={submit} />
        <SaveButton
          form="delete-form"
          type="submit"
          variant="destructive"
          state="error"
          idleLabel="Delete document"
          pendingLabel="Deleting…"
          successLabel="Deleted"
        />
      </>,
    );
    const button = screen.getByRole("button", { name: "Delete document" });
    expect(button).toHaveClass("bg-destructive");
    fireEvent.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  });
});
