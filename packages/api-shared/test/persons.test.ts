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

test("person document photo schemas expose slot metadata and content routes", () => {
  const contentUrl = v1.persons.ROUTES.documents.photos.content(
    "person-1",
    "document-1",
    "front",
  );
  const uploadUrl = v1.persons.ROUTES.documents.photos.createUploadUrl(
    "person-1",
    "document-1",
    "front",
  );
  const completeUploadUrl = v1.persons.ROUTES.documents.photos.completeUpload(
    "person-1",
    "document-1",
    "front",
  );
  const readUrl = v1.persons.ROUTES.documents.photos.readUrl(
    "person-1",
    "document-1",
    "front",
  );

  assert.equal(
    contentUrl,
    "/v1/persons/person-1/documents/document-1/photos/front/content",
  );
  assert.equal(
    uploadUrl,
    "/v1/persons/person-1/documents/document-1/photos/front/upload-url",
  );
  assert.equal(
    completeUploadUrl,
    "/v1/persons/person-1/documents/document-1/photos/front/complete-upload",
  );
  assert.equal(
    readUrl,
    "/v1/persons/person-1/documents/document-1/photos/front/read-url",
  );
  assert.equal(
    v1.persons.personDocumentPhotoSlotSchema.safeParse("front").success,
    true,
  );
  assert.equal(
    v1.persons.personDocumentPhotoSlotSchema.safeParse("portrait").success,
    false,
  );

  assert.deepEqual(
    v1.persons.personDocumentPhotoSchema.parse({
      id: "photo-1",
      personDocumentId: "document-1",
      slot: "front",
      assetId: "asset-1",
      contentType: "image/jpeg",
      byteSize: 1234,
      checksumSha256: "abc123",
      contentUrl,
      createdAt: "2026-06-26T10:00:00.000Z",
      deletedAt: null,
    }),
    {
      id: "photo-1",
      personDocumentId: "document-1",
      slot: "front",
      assetId: "asset-1",
      contentType: "image/jpeg",
      byteSize: 1234,
      checksumSha256: "abc123",
      contentUrl,
      createdAt: "2026-06-26T10:00:00.000Z",
      deletedAt: null,
    },
  );

  const checksumSha256 =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  assert.deepEqual(
    v1.persons.createPersonDocumentPhotoUploadUrlInputSchema.parse({
      contentType: "image/webp",
      byteSize: 1234,
      checksumSha256,
    }),
    {
      contentType: "image/webp",
      byteSize: 1234,
      checksumSha256,
    },
  );
  assert.equal(
    v1.persons.createPersonDocumentPhotoUploadUrlInputSchema.safeParse({
      contentType: "application/pdf",
      byteSize: 1234,
      checksumSha256,
    }).success,
    false,
  );
  assert.equal(
    v1.persons.createPersonDocumentPhotoUploadUrlInputSchema.safeParse({
      contentType: "image/webp",
      byteSize: 1234,
      checksumSha256: "abc123",
    }).success,
    false,
  );
  assert.equal(
    v1.persons.personDocumentPhotoUploadUrlSchema.parse({
      uploadUrl: "https://s3.example/upload",
      uploadToken: "token",
      method: "PUT",
      headers: {
        "Content-Type": "image/webp",
        "x-amz-checksum-sha256": "ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8=",
      },
      expiresAt: "2026-06-26T10:05:00.000Z",
      maxBytes: 10485760,
    }).method,
    "PUT",
  );
  assert.equal(
    v1.persons.completePersonDocumentPhotoUploadInputSchema.parse({
      uploadToken: "token",
    }).uploadToken,
    "token",
  );
  assert.equal(
    v1.persons.personDocumentPhotoReadUrlSchema.parse({
      readUrl: "https://s3.example/read",
      method: "GET",
      headers: {},
      expiresAt: "2026-06-26T10:05:00.000Z",
    }).method,
    "GET",
  );
});

test("person audit schemas expose safe activity metadata and routes", () => {
  assert.equal(
    v1.persons.ROUTES.auditEvents.list("person-1"),
    "/v1/persons/person-1/audit-events",
  );
  assert.equal(
    v1.persons.ROUTES.documents.replace("person-1", "document-1"),
    "/v1/persons/person-1/documents/document-1/replace",
  );

  const parsed = v1.persons.personAuditEventSchema.parse({
    id: "audit-1",
    type: "PERSON_DOCUMENT_REPLACED",
    personId: "person-1",
    actor: {
      kind: "user",
      userId: "user-1",
      email: "admin@example.com",
      name: null,
    },
    document: {
      id: "document-2",
      type: "nationalId",
      status: "verified",
    },
    replacement: {
      oldDocument: {
        id: "document-1",
        type: "nationalId",
        status: "expired",
      },
      newDocument: {
        id: "document-2",
        type: "nationalId",
        status: "verified",
      },
    },
    changes: [
      {
        field: "document.number",
        oldValue: "[redacted] 3456",
        newValue: "[redacted] 9999",
      },
    ],
    createdAt: "2026-06-26T10:00:00.000Z",
  });

  assert.equal(parsed.type, "PERSON_DOCUMENT_REPLACED");
  assert.equal(parsed.changes[0]?.oldValue?.includes("123456"), false);
  assert.equal(
    v1.persons.personAuditEventTypeSchema.safeParse("LOGIN_SUCCESS").success,
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
  assert.equal(
    v1.persons.getDateOfBirthFromCnp("190 022 812 3450"),
    "1990-02-28",
  );
  assert.equal(v1.persons.getDateOfBirthFromCnp("1900228123456"), null);
});

test("person CNP helpers derive minority from date of birth", () => {
  assert.equal(
    v1.persons.isUnder18FromDateOfBirth(
      "2010-06-26",
      new Date("2028-06-25T12:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    v1.persons.isUnder18FromDateOfBirth(
      "2010-06-26",
      new Date("2028-06-26T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    v1.persons.isUnder18FromCnp(
      "5100626123456",
      new Date("2028-06-25T12:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    v1.persons.isUnder18FromCnp(
      "5100626123456",
      new Date("2028-06-26T00:00:00.000Z"),
    ),
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
