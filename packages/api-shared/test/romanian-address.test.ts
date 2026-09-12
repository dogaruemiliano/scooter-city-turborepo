import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRomanianCounty,
  parseRomanianAddress,
  ROMANIAN_COUNTY_NAMES,
} from "../src/v1/persons/romanian-address";

test("county codes, canonical names and unaccented names resolve to dropdown values", () => {
  assert.equal(Object.keys(ROMANIAN_COUNTY_NAMES).length, 42);
  for (const [code, name] of Object.entries(ROMANIAN_COUNTY_NAMES)) {
    assert.equal(normalizeRomanianCounty(code.toLowerCase()), name);
    assert.equal(normalizeRomanianCounty(name), name);
    assert.equal(normalizeRomanianCounty(`Jud.${code}`), name);
    assert.equal(
      normalizeRomanianCounty(
        name.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
      ),
      name,
    );
  }
});

test("parses county and municipality without requiring spaces after dots", () => {
  assert.deepEqual(parseRomanianAddress("Jud.VL Mun.Râmnicu Vâlcea"), {
    region: "Vâlcea",
    city: "Râmnicu Vâlcea",
  });
  assert.deepEqual(parseRomanianAddress("VL Mun.Râmnicu Vâlcea"), {
    region: "Vâlcea",
    city: "Râmnicu Vâlcea",
  });
});

test("extracts towns, communes and villages without street or building data", () => {
  for (const prefix of [
    "Mun.",
    "Municipiul ",
    "Or.",
    "Oraș ",
    "Oraşul ",
    "Orasul ",
    "Com.",
    "Comuna ",
    "Sat ",
    "Satul ",
    "Loc.",
    "Localitatea ",
  ]) {
    assert.deepEqual(
      parseRomanianAddress(
        `Jud.VL ${prefix}Călimănești Str.Calea lui Traian Nr.12 Bl.A`,
      ),
      {
        region: "Vâlcea",
        city: "Călimănești",
      },
    );
  }
  assert.deepEqual(
    parseRomanianAddress(
      "Județul Cluj, Com. Florești, Sat. Luna de Sus, Str. Principală 10",
    ),
    {
      region: "Cluj",
      city: "Luna de Sus",
    },
  );
  assert.deepEqual(
    parseRomanianAddress("Sat. Luna de Sus Com. Florești Jud.CJ"),
    {
      region: "Cluj",
      city: "Luna de Sus",
    },
  );
});

test("stops before boulevards and accepts slash-separated administrative parts", () => {
  assert.deepEqual(
    parseRomanianAddress(
      "Jud.VL / Mun.Râmnicu Vâlcea Bd.Tudor Vladimirescu Nr.12",
    ),
    {
      region: "Vâlcea",
      city: "Râmnicu Vâlcea",
    },
  );
});

test("handles multiword counties and Bucharest without treating sectors as cities", () => {
  assert.deepEqual(parseRomanianAddress("Jud. Satu Mare Mun.Satu Mare"), {
    region: "Satu Mare",
    city: "Satu Mare",
  });
  assert.deepEqual(
    parseRomanianAddress("Mun. București Sector 3 Str. Exemplu"),
    {
      region: "București",
      city: "București",
    },
  );
});

test("does not guess localities from county or street names, or expand unknown codes", () => {
  assert.equal(parseRomanianAddress("VL").city, undefined);
  assert.equal(parseRomanianAddress("Jud.XX").region, undefined);
  assert.equal(normalizeRomanianCounty("Unknown County"), "Unknown County");
  assert.equal(parseRomanianAddress("Str. Munteniei Nr.12").city, undefined);
});
