import { capitalizeExtractedName } from "./person-name";

describe("extracted name capitalization", () => {
  it.each([
    ["  ȘTEFAN IONUȚ ", "Ștefan Ionuț"],
    ["ANA-MARIA", "Ana-Maria"],
    ["popescu", "Popescu"],
    ["O’NEILL", "O’Neill"],
    ["McDonald de Silva", "McDonald De Silva"],
  ])("capitalizes %s without losing spelling", (input, expected) => {
    expect(capitalizeExtractedName(input)).toBe(expected);
  });
});
