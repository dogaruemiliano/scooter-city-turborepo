import { scoreExtraction } from "./analyze-private-scooter-documents";

it("scores source page groups independently of model document ordering", () => {
  const score = scoreExtraction(
    {
      vin: "L5YAUCZB9H1148984",
      documents: [
        {
          documentType: "foreign_registration",
          pages: [1, 2],
          fields: { foreignRegistrationNumber: "D-123-AB" },
        },
        {
          documentType: "itp_certificate",
          pages: [3],
          inspections: [{ inspectionDate: "2026-01-02", result: "passed" }],
        },
      ],
    },
    {
      vin: "L5YAUCZB9H1148984",
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "2",
          documentType: "itp_certificate",
          pages: [3],
          vin: null,
          fields: {},
          rawFields: {},
          inspections: [
            {
              inspectionDate: "2026-01-02",
              validUntil: null,
              result: "passed",
              odometerKm: null,
              certificateNumber: null,
              rawFields: {},
            },
          ],
        },
        {
          id: "1",
          documentType: "foreign_registration",
          pages: [2, 1],
          vin: null,
          fields: { foreignRegistrationNumber: "D-123-AB" },
          rawFields: {},
        },
      ],
    },
  );
  expect(score).toEqual({
    checked: 6,
    correct: 6,
    missingDocuments: 0,
    unexpectedDocuments: 0,
  });
});

it("does not count a correct value on the wrong original page as an accurate group", () => {
  expect(
    scoreExtraction(
      {
        documents: [
          {
            documentType: "civ",
            pages: [1],
            fields: { civIssuedAt: "2026-01-02" },
          },
        ],
      },
      {
        vin: null,
        fields: {},
        rawFields: {},
        documents: [
          {
            id: "1",
            documentType: "civ",
            pages: [2],
            vin: null,
            fields: { civIssuedAt: "2026-01-02" },
            rawFields: {},
          },
        ],
      },
    ),
  ).toEqual({
    checked: 3,
    correct: 0,
    missingDocuments: 1,
    unexpectedDocuments: 1,
  });
});
