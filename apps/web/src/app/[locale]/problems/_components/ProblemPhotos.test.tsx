import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemPhotos } from "./ProblemPhotos";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.fetch, url: (path: string) => path },
}));
const problem = v1.problems.problemSchema.parse({
  id: "problem",
  scooterId: "scooter",
  title: "Replace pads",
  description: "",
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
    registrationNumber: null,
  },
  status: "in_progress",
  difficulty: "hard",
  priority: "high",
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  assigneeId: "mechanic",
  assignee: null,
  revision: 3,
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
  resolvedAt: null,
});
function photo(name: string) {
  const file = new File(["image"], name, { type: "image/jpeg" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  return file;
}
function renderPhotos(
  save: (photos: v1.problems.ProblemPhotoDraft[]) => Promise<void>,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ProblemPhotos
        problem={problem}
        editable
        disabled={false}
        onSave={save}
        onBusyChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  URL.createObjectURL = vi.fn(
    (file: Blob) => `blob:${file.size}-${Math.random()}`,
  );
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  mocks.fetch.mockReset().mockResolvedValue({
    uploadUrl: "https://storage.example/upload",
    uploadToken: "token",
    headers: {},
    maxBytes: 15000000,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("task attachment collection", () => {
  it("opens the camera from the gallery add tile and keeps file selection available", async () => {
    renderPhotos(vi.fn());
    expect(screen.queryByRole("button", { name: "Take photos" })).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Choose photos" }));
    const capture = await screen.findByRole("dialog", { name: "Take photos" });
    const input = screen.getByLabelText("Choose photos", { selector: "input" });
    const choose = vi.spyOn(input, "click");
    await userEvent
      .setup()
      .click(within(capture).getByRole("button", { name: "Choose photos" }));
    expect(choose).toHaveBeenCalledOnce();
  });

  it("appends multiple selections and saves the whole batch", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    renderPhotos(save);
    const input = screen.getByLabelText("Choose photos", { selector: "input" });
    expect(input).toHaveAttribute("multiple");
    fireEvent.change(input, {
      target: { files: [photo("one.jpg"), photo("two.jpg")] },
    });
    fireEvent.change(input, { target: { files: [photo("three.jpg")] } });
    expect(screen.getByText("3 / 10 photos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save photos" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith([
        { uploadToken: "token", fileName: "one.jpg" },
        { uploadToken: "token", fileName: "two.jpg" },
        { uploadToken: "token", fileName: "three.jpg" },
      ]),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/problems/problem/photo-upload-url",
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() =>
      expect(screen.getByText("0 / 10 photos")).toBeInTheDocument(),
    );
  });

  it("retains uploaded drafts for retry when attachment saving fails", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Task changed; retry"))
      .mockResolvedValueOnce(undefined);
    renderPhotos(save);
    fireEvent.change(
      screen.getByLabelText("Choose photos", { selector: "input" }),
      { target: { files: [photo("pads.jpg")] } },
    );
    await user.click(screen.getByRole("button", { name: "Save photos" }));
    await screen.findByText("Task changed; retry");
    expect(screen.getByText("1 / 10 photos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save photos" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized batch without replacing the selected photos", () => {
    renderPhotos(vi.fn());
    expect(screen.queryByText(/Up to 10/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const input = screen.getByLabelText("Choose photos", { selector: "input" });
    fireEvent.change(input, { target: { files: [photo("keep.jpg")] } });
    fireEvent.change(input, {
      target: {
        files: Array.from({ length: 10 }, (_, i) => photo(`extra-${i}.jpg`)),
      },
    });
    expect(screen.getByText("1 / 10 photos")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Up to 10");
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [photo("valid.jpg")] } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Up to 10/)).toBeNull();
  });
});
