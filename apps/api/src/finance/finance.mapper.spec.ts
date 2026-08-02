import { CompanyLegalForm, CounterpartyType } from "../generated/prisma/client";
import { toCounterpartySummary } from "./finance.mapper";

describe("finance counterparty summaries", () => {
  it("uses company legal names for company transaction parties", () => {
    expect(
      toCounterpartySummary({
        id: "counterparty-company",
        type: CounterpartyType.COMPANY,
        person: null,
        company: {
          legalName: "Scooter City SRL",
          legalForm: CompanyLegalForm.SRL,
        },
      }),
    ).toEqual({
      id: "counterparty-company",
      kind: "COMPANY",
      label: "Scooter City SRL",
    });
  });

  it("uses a person's full name for person transaction parties", () => {
    expect(
      toCounterpartySummary({
        id: "counterparty-person",
        type: CounterpartyType.PERSON,
        person: {
          email: "ana@example.com",
          firstName: "Ana",
          lastName: "Popescu",
        },
        company: null,
      }),
    ).toEqual({
      id: "counterparty-person",
      kind: "PERSON",
      label: "Ana Popescu",
    });
  });
});
