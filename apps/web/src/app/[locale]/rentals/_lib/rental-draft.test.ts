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
  expect(period.startsAt).toBe("2026-12-27T22:00:00.000Z");
  expect(period.endsAt).toBe("2027-01-03T22:00:00.000Z");
  expect(period.timeZone).toBe("Europe/Bucharest");
  expect(weeklyPeriod({ day: "31", month: "02", year: "2026" })).toBeNull();
});

it("keeps Bucharest midnight across the autumn DST change regardless of device timezone", () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    const period = weeklyPeriod({ day: "24", month: "10", year: "2026" })!;
    expect(period.startsAt).toBe("2026-10-23T21:00:00.000Z");
    expect(period.endsAt).toBe("2026-10-30T22:00:00.000Z");
    expect(Date.parse(period.endsAt) - Date.parse(period.startsAt)).toBe(
      169 * 60 * 60 * 1000,
    );
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

it("persists first-step input after an actual edit without requiring the review step", () => {
  const draft = {
    ...emptyRentalDraft(),
    inputTouched: true,
    personId: "person",
  };
  expect(canPersistRentalDraft(draft)).toBe(true);
  writeRentalDraft("staff", draft);
  expect(readRentalDraft("staff")).toEqual(draft);
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

it("defaults new rentals to the Bucharest date and calculates the first week without persisting", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-23T22:30:00.000Z"));
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
