import { beforeEach, expect, it, vi } from "vitest";
import {
  attachRentalPerson,
  emptyRentalDraft,
  hasRentalDraftInput,
  canPersistRentalDraft,
  readRentalDraft,
  removeRentalDraft,
  rentalDraftKey,
  weeklyPeriod,
  writeRentalDraft,
} from "./rental-draft";
import {
  personCreateDestination,
  personCreateCancelHref,
} from "../../persons/_lib/person-create-destination";

beforeEach(() => localStorage.clear());

it("preserves partial input and isolates drafts by operator", () => {
  const draft = {
    ...emptyRentalDraft(),
    detailsCompleted: true,
    startDate: { day: "2", month: "", year: "" },
    scooterId: "scooter-1",
  };
  writeRentalDraft("operator-1", draft);
  expect(readRentalDraft("operator-1")).toEqual(draft);
  expect(readRentalDraft("operator-2")).toBeNull();
});

it("rejects corrupt or unsupported stored values", () => {
  for (const value of [
    "{",
    '{"version":0}',
    JSON.stringify({ ...emptyRentalDraft(), period: {} }),
  ]) {
    localStorage.setItem(rentalDraftKey("staff"), value);
    expect(readRentalDraft("staff")).toBeNull();
  }
});

it("uses seven calendar days across month/year boundaries and rejects impossible dates", () => {
  const period = weeklyPeriod({ day: "28", month: "12", year: "2026" })!;
  const start = new Date(period.startsAt);
  const end = new Date(period.endsAt);
  expect([
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    start.getHours(),
  ]).toEqual([2026, 11, 28, 0]);
  expect([
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
    end.getHours(),
  ]).toEqual([2027, 0, 4, 0]);
  expect(weeklyPeriod({ day: "31", month: "02", year: "2026" })).toBeNull();
});

it("keeps the weekly boundary at local midnight over the autumn DST change", () => {
  // The suite runs in Europe/Bucharest for this check (see validation command).
  const period = weeklyPeriod({ day: "24", month: "10", year: "2026" })!;
  const start = new Date(period.startsAt);
  const end = new Date(period.endsAt);
  expect(end.getDate()).toBe(31);
  expect(end.getHours()).toBe(start.getHours());
  if (start.getTimezoneOffset() !== end.getTimezoneOffset())
    expect(Date.parse(period.endsAt) - Date.parse(period.startsAt)).toBe(
      169 * 60 * 60 * 1000,
    );
});

it("only attaches a created person to its original draft and never deletes a person", () => {
  const draft = {
    ...emptyRentalDraft(),
    detailsCompleted: true,
    scooterId: "scooter-1",
  };
  writeRentalDraft("staff", draft);
  attachRentalPerson("staff", "different-draft", "new-person");
  expect(readRentalDraft("staff")?.personId).toBe("");
  const destination = personCreateDestination(
    "/en/persons",
    "new-person",
    draft.id,
    "staff",
  );
  expect(destination).toContain("/en/rentals/new?");
  expect(
    new URL(destination, "https://example.test").searchParams.get("personId"),
  ).toBe("new-person");
  expect(readRentalDraft("staff")).toMatchObject({
    personId: "new-person",
    scooterId: "scooter-1",
  });
  const request = vi.spyOn(globalThis, "fetch");
  removeRentalDraft("staff", draft.id);
  expect(readRentalDraft("staff")).toBeNull();
  expect(request).not.toHaveBeenCalled();
  request.mockRestore();
});

it("preserves the normal person destination and only constructs local rental return paths", () => {
  expect(personCreateDestination("/persons", "p/1")).toBe("/persons/p%2F1");
  expect(personCreateCancelHref("/en/persons", "draft")).toBe(
    "/en/rentals/new",
  );
  expect(
    personCreateDestination("/persons", "p1", "https://outside.test"),
  ).toMatch(/^\/rentals\/new\?/);
});

it("does not remove a different draft or resurrect one discarded during person creation", () => {
  const draft = {
    ...emptyRentalDraft(),
    detailsCompleted: true,
    personId: "person",
  };
  writeRentalDraft("staff", draft);
  removeRentalDraft("staff", "stale-id");
  expect(readRentalDraft("staff")).toEqual(draft);
  removeRentalDraft("staff", draft.id);
  attachRentalPerson("staff", draft.id, "person");
  expect(readRentalDraft("staff")).toBeNull();
});

it("does not persist empty, whitespace-only, or navigation-only drafts", () => {
  const draft = {
    ...emptyRentalDraft(),
    step: "review" as const,
    detailsCompleted: true,
    customerNotes: "  ",
    startDate: { day: "", month: "", year: "" },
    period: null,
  };
  expect(hasRentalDraftInput(draft)).toBe(false);
  writeRentalDraft("staff", draft);
  expect(localStorage.getItem(rentalDraftKey("staff"))).toBeNull();
  writeRentalDraft("staff", { ...draft, internalNotes: "Staff note" });
  expect(readRentalDraft("staff")?.internalNotes).toBe("Staff note");
  writeRentalDraft("staff", draft);
  expect(readRentalDraft("staff")).toBeNull();
});

it("does not save input until details have been completed", () => {
  const draft = {
    ...emptyRentalDraft(),
    personId: "person",
    scooterId: "scooter",
    startDate: { day: "24", month: "10", year: "2026" },
  };
  expect(canPersistRentalDraft(draft)).toBe(false);
  writeRentalDraft("staff", draft);
  expect(readRentalDraft("staff")).toBeNull();
  writeRentalDraft("staff", {
    ...draft,
    detailsCompleted: true,
    step: "review",
  });
  expect(readRentalDraft("staff")?.detailsCompleted).toBe(true);
});

it("recognizes legacy review drafts but not legacy first-step drafts as eligible", () => {
  const draft = {
    ...emptyRentalDraft(),
    detailsCompleted: undefined,
    personId: "person",
  };
  for (const step of ["details", "review"] as const) {
    localStorage.setItem(
      rentalDraftKey("staff"),
      JSON.stringify({ ...draft, step }),
    );
    expect(canPersistRentalDraft(readRentalDraft("staff")!)).toBe(
      step === "review",
    );
  }
});

it("defaults new rentals to the local date and calculates the first week without persisting", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2026, 9, 24, 0, 30));
    const draft = emptyRentalDraft();
    expect(draft.startDate).toEqual({ day: "24", month: "10", year: "2026" });
    expect(draft.period).toEqual(weeklyPeriod(draft.startDate));
    expect(canPersistRentalDraft(draft)).toBe(false);
    writeRentalDraft("staff", draft);
    expect(readRentalDraft("staff")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
