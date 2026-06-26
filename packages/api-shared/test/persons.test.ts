import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

test("createPersonInputSchema trims and normalizes required contact fields", () => {
  assert.deepEqual(
    v1.persons.createPersonInputSchema.parse({
      email: "  RIDER@EXAMPLE.COM ",
      phone: " +40712345678 ",
      firstName: "  Ada ",
      lastName: " Lovelace ",
    }),
    {
      email: "rider@example.com",
      phone: "+40712345678",
      firstName: "Ada",
      lastName: "Lovelace",
    },
  );
});

test("createPersonInputSchema requires a valid E.164 phone", () => {
  assert.equal(
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      phone: "0712345678",
      firstName: "Ada",
      lastName: "Lovelace",
    }).success,
    false,
  );
});

test("person schemas validate document values and date-only strings", () => {
  const parsed = v1.persons.createPersonInputSchema.parse({
    email: "rider@example.com",
    phone: "+40712345678",
    firstName: "Ada",
    lastName: "Lovelace",
    dateOfBirth: "1990-02-28",
    documents: [
      {
        type: "nationalId",
        series: " rx ",
        number: " 123456 ",
        cnp: "1900228123450",
        issuingCountryCode: " ro ",
        issuedBy: " SPCLEP Bucuresti ",
        issuedOn: "2024-01-15",
        expiresOn: "2030-01-31",
        status: "verified",
      },
      {
        type: "driverLicense",
        number: " B123456 ",
      },
    ],
  });

  assert.equal(parsed.documents?.[0]?.series, "rx");
  assert.equal(parsed.documents?.[0]?.number, "123456");
  assert.equal(parsed.documents?.[0]?.cnp, "1900228123450");
  assert.equal(parsed.documents?.[0]?.issuingCountryCode, "RO");
  assert.equal(parsed.documents?.[0]?.issuedBy, "SPCLEP Bucuresti");
  assert.equal(parsed.documents?.[0]?.issuedOn, "2024-01-15");
  assert.equal(parsed.documents?.[0]?.status, "verified");
  assert.equal(parsed.documents?.[1]?.number, "B123456");
  assert.equal(parsed.documents?.[1]?.status, "unverified");
  assert.equal(
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      phone: "+40712345678",
      firstName: "Ada",
      lastName: "Lovelace",
      documents: [{ type: "nationalId" }, { type: "nationalId" }],
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      phone: "+40712345678",
      firstName: "Ada",
      lastName: "Lovelace",
      documents: [{ type: "nationalId" }, { type: "passport" }],
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      phone: "+40712345678",
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-02-31",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonDocumentInputSchema.safeParse({
      type: "passport",
      status: "pending",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonDocumentInputSchema.safeParse({
      type: "nationalId",
      cnp: "123",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonDocumentInputSchema.safeParse({
      type: "nationalId",
      issuedOn: "2024-02-31",
    }).success,
    false,
  );
});

test("person document CNP validation checks checksum, date, county, and serial", () => {
  assert.equal(
    v1.persons.createPersonDocumentInputSchema.safeParse({
      type: "nationalId",
      cnp: "1900228123450",
    }).success,
    true,
  );

  const pastedCnp = v1.persons.createPersonDocumentInputSchema.parse({
    type: "nationalId",
    cnp: "190 022 812 3450",
  });
  assert.equal(pastedCnp.cnp, "1900228123450");

  for (const cnp of [
    "1900228123456",
    "1900230123454",
    "1900228801235",
    "1900228120009",
  ]) {
    assert.equal(
      v1.persons.createPersonDocumentInputSchema.safeParse({
        type: "nationalId",
        cnp,
      }).success,
      false,
      cnp,
    );
  }

  assert.equal(v1.persons.isValidCnp("1900228123450"), true);
  assert.equal(v1.persons.isValidCnp("1900228123456"), false);
});

test("updatePersonInputSchema rejects phone clearing and unknown fields", () => {
  assert.equal(
    v1.persons.updatePersonInputSchema.safeParse({ phone: null }).success,
    false,
  );
  assert.equal(
    v1.persons.updatePersonInputSchema.safeParse({ middleName: "Byron" })
      .success,
    false,
  );
});

test("listPersonsQuerySchema coerces paging and includeDeleted", () => {
  assert.deepEqual(
    v1.persons.listPersonsQuerySchema.parse({
      page: "2",
      pageSize: "10",
      search: "  ada ",
      includeDeleted: "true",
    }),
    {
      page: 2,
      pageSize: 10,
      search: "ada",
      includeDeleted: true,
    },
  );
  assert.deepEqual(v1.persons.listPersonsQuerySchema.parse({}), {
    page: 1,
    pageSize: 25,
    includeDeleted: false,
  });
});

test("listPersonsQuerySchema validates search filters", () => {
  assert.deepEqual(
    v1.persons.listPersonsQuerySchema.parse({
      recordStatus: "deleted",
      documentType: "passport",
      documentStatus: "verified",
      documentExpiry: "expiresSoon",
      documentExpiresFrom: "2026-06-01",
      documentExpiresTo: "2026-07-01",
      countryCode: " ro ",
      documentIssuingCountryCode: " us ",
      sort: "createdAtDesc",
    }),
    {
      page: 1,
      pageSize: 25,
      recordStatus: "deleted",
      documentType: "passport",
      documentStatus: "verified",
      documentExpiry: "expiresSoon",
      documentExpiresFrom: "2026-06-01",
      documentExpiresTo: "2026-07-01",
      countryCode: "RO",
      documentIssuingCountryCode: "US",
      sort: "createdAtDesc",
      includeDeleted: false,
    },
  );

  assert.equal(
    v1.persons.listPersonsQuerySchema.safeParse({
      recordStatus: "archived",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.listPersonsQuerySchema.safeParse({
      documentExpiry: "soon",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.listPersonsQuerySchema.safeParse({
      documentExpiresFrom: "2026-02-31",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.listPersonsQuerySchema.safeParse({
      sort: "firstNameAsc",
    }).success,
    false,
  );
});
