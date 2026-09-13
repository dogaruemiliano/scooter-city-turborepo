import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRomanianCounty,
  getRomanianLocalities,
  matchRomanianLocality,
  splitRomanianAddressLines,
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
      city: "Florești",
    },
  );
  assert.deepEqual(
    parseRomanianAddress("Sat. Luna de Sus Com. Florești Jud.CJ"),
    {
      region: "Cluj",
      city: "Florești",
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

test("uses the dataset to mix cities and communes with county-specific matching", () => {
  const names = getRomanianLocalities("VL").map((item) => item.name);
  assert.ok(names.includes("Râmnicu Vâlcea"));
  assert.ok(names.includes("Budești"));
  assert.ok(!names.includes("Cluj-Napoca"));
  assert.equal(
    matchRomanianLocality("Vâlcea", "mun.RAMNICU VALCEA"),
    "Râmnicu Vâlcea",
  );
  assert.equal(matchRomanianLocality("VL", "Com. budesti"), "Budești");
  assert.equal(matchRomanianLocality("CJ", "Râmnicu Vâlcea"), undefined);
  assert.equal(matchRomanianLocality("", "Budești"), undefined);
  assert.equal(parseRomanianAddress("Jud.CJ Sat.Luna de Sus").city, undefined);
});

test("keeps only street and number on line 1 and moves premises and village to line 2", () => {
  assert.deepEqual(
    splitRomanianAddressLines(
      "Jud.VL Mun.Râmnicu Vâlcea Str.Exemplu Nr.12 Bl.A Sc.B Et.2 Ap.5",
    ),
    {
      addressLine1: "Str. Exemplu, Nr. 12",
      addressLine2: "Bl. A, Sc. B, Et. 2, Ap. 5",
    },
  );
  assert.deepEqual(
    splitRomanianAddressLines(
      "Jud.CJ Com.Florești Sat.Luna de Sus Str.Principală Nr.10",
    ),
    {
      addressLine1: "Str. Principală, Nr. 10",
      addressLine2: "Sat. Luna de Sus",
    },
  );
  assert.deepEqual(splitRomanianAddressLines("Jud.VL Mun.Râmnicu Vâlcea"), {});
  assert.deepEqual(splitRomanianAddressLines("Calea lui Traian Nr.12 Bl.A"), {
    addressLine1: "Calea lui Traian, Nr. 12",
    addressLine2: "Bl. A",
  });
  assert.deepEqual(splitRomanianAddressLines("Str. Exemplu 12, apartment 4"), {
    addressLine1: "Str. Exemplu 12",
    addressLine2: "apartment 4",
  });
});
