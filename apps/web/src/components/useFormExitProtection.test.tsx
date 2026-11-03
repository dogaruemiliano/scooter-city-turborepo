import Link from "next/link";
import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  PageHeaderNavigationContext,
  type PageHeaderNavigationOptions,
} from "./PageHeaderNavigation";
import { useFormExitProtection } from "./useFormExitProtection";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  register: vi.fn((options: PageHeaderNavigationOptions) => {
    void options;
    return () => {};
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));

function Form({ pending = false }: { pending?: boolean }) {
  const [value, setValue] = useState("");
  const exit = useFormExitProtection({ dirty: value !== "", pending });
  return (
    <>
      {exit.protection}
      <input
        aria-label="Name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        onClick={() => {
          exit.complete();
          mocks.replace("/saved");
        }}
      >
        Finish
      </button>
      <Link href="/en/persons">People</Link>
    </>
  );
}
function renderForm(pending = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <PageHeaderNavigationContext value={mocks.register}>
        <Form pending={pending} />
      </PageHeaderNavigationContext>
    </NextIntlClientProvider>,
  );
}
function headerBack() {
  mocks.register.mock.calls.at(-1)![0].onBack!();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({ __NA: true }, "", "/en/persons/new");
});

it("leaves untouched forms immediately and preserves values when a dirty exit is cancelled", async () => {
  const user = userEvent.setup();
  renderForm();
  act(headerBack);
  expect(mocks.back).toHaveBeenCalledOnce();
  await user.type(screen.getByLabelText("Name"), "Ada");
  act(headerBack);
  expect(
    screen.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Name")).toHaveValue("Ada");
  expect(mocks.back).toHaveBeenCalledOnce();
});

it("protects browser Back and skips its sentinel after confirming discard", async () => {
  const user = userEvent.setup();
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  renderForm();
  await user.type(screen.getByLabelText("Name"), "Ada");
  fireEvent.popState(window, { state: {} });
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(go).toHaveBeenCalledExactlyOnceWith(-2);
  go.mockRestore();
});

it("blocks all exit paths while pending, including forms without edits", () => {
  renderForm(true);
  expect(mocks.register.mock.calls.at(-1)![0].backDisabled).toBe(true);
  act(headerBack);
  fireEvent.click(screen.getByRole("link", { name: "People" }));
  fireEvent.popState(window, { state: {} });
  expect(mocks.back).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(false);
});

it("bypasses exit warnings after successful completion", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.type(screen.getByLabelText("Name"), "Ada");
  await user.click(screen.getByRole("button", { name: "Finish" }));
  expect(mocks.replace).toHaveBeenCalledWith("/saved");
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});
