import { describe, expect, it } from "vitest";

import { formatSecondsAsMinutesAndSeconds } from "./format-seconds";

describe("formatSecondsAsMinutesAndSeconds", () => {
  it.each([
    { totalSeconds: 600, expected: "10:00" },
    { totalSeconds: 65, expected: "1:05" },
    { totalSeconds: 9, expected: "0:09" },
    { totalSeconds: 0, expected: "0:00" },
    { totalSeconds: -1, expected: "0:00" },
  ])(
    "formats $totalSeconds seconds as $expected",
    ({ totalSeconds, expected }) => {
      expect(formatSecondsAsMinutesAndSeconds(totalSeconds)).toBe(expected);
    },
  );
});
