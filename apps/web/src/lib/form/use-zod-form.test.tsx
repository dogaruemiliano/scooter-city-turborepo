import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { z } from "zod";
import { expect, it, vi } from "vitest";
import { useZodForm } from "./use-zod-form";

const schema = z.object({ name: z.string().min(1) });
it("locks all submission paths until validation/request completion and unlocks after failure", async () => {
  let reject: (reason: Error) => void = () => {};
  const submit = vi.fn(
    () =>
      new Promise<void>((_, rejectPromise) => {
        reject = rejectPromise;
      }),
  );
  const failed = vi.fn();
  function Form() {
    const form = useZodForm(schema, {
      defaultValues: { name: "Alex" },
      labelFor: () => "Name",
    });
    return (
      <form
        aria-label="Profile"
        onSubmit={(event) =>
          void form.handleSubmit(submit)(event).catch(failed)
        }
      >
        <input aria-label="Name" {...form.register("name")} />
      </form>
    );
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <Form />
    </NextIntlClientProvider>,
  );
  const form = screen.getByRole("form", { name: "Profile" });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  await act(async () => reject(new Error("Network unavailable")));
  await waitFor(() => expect(failed).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Alex");
  fireEvent.submit(form);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  await act(async () => reject(new Error("Still unavailable")));
});
