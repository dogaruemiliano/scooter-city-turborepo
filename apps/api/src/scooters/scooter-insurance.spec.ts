import { writeInsurancePolicies } from "./scooter-insurance";
import type { Prisma } from "../generated/prisma/client";

const policy = {
  id: "policy",
  insuredName: "Example SRL",
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  premiumAmount: 250.55,
  currency: "RON",
  documentVin: "LXYTCKP05P0000001",
  vinReviewConfirmed: false,
};
describe("insurance persistence", () => {
  const model = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const tx = {
    scooterInsurancePolicy: model,
  } as unknown as Prisma.TransactionClient;
  beforeEach(() => jest.resetAllMocks());
  it("creates a renewal without deleting historical policies", async () => {
    await writeInsurancePolicies(tx, "scooter", policy.documentVin, [policy]);
    expect(model.create).toHaveBeenCalledWith({
      data: {
        ...policy,
        scooterId: "scooter",
        rawFields: undefined,
        validFrom: new Date("2026-01-01T00:00:00Z"),
        validUntil: new Date("2026-12-31T00:00:00Z"),
      },
    });
    expect(model.update).not.toHaveBeenCalled();
  });
  it("rejects attempts to change a policy owned by another scooter", async () => {
    model.findUnique.mockResolvedValue({ id: "policy", scooterId: "other" });
    await expect(
      writeInsurancePolicies(tx, "scooter", policy.documentVin, [policy]),
    ).rejects.toThrow("does not belong");
    expect(model.update).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });
  it("checks saved policies when the scooter VIN changes without a policy payload", async () => {
    model.findFirst.mockResolvedValue({ id: "old-policy" });
    await expect(
      writeInsurancePolicies(tx, "scooter", "LXYTCKP05P0000002"),
    ).rejects.toThrow("VIN does not match");
    expect(model.findFirst).toHaveBeenCalledWith({
      where: {
        scooterId: "scooter",
        documentVin: { not: "LXYTCKP05P0000002" },
      },
      select: { id: true },
    });
  });
});
