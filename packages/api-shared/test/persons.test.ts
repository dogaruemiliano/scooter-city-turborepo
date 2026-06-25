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
      documentStatus: "unverified",
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
    documentType: "passport",
    documentIssuingCountryCode: " ro ",
    documentExpiresOn: "2030-01-31",
    documentStatus: "verified",
  });

  assert.equal(parsed.documentIssuingCountryCode, "RO");
  assert.equal(parsed.documentStatus, "verified");
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
    v1.persons.createPersonInputSchema.safeParse({
      email: "rider@example.com",
      phone: "+40712345678",
      firstName: "Ada",
      lastName: "Lovelace",
      documentStatus: "pending",
    }).success,
    false,
  );
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
