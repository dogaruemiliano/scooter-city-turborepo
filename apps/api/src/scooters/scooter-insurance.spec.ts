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
    scooterInsuranceRevision: { findFirst: jest.fn(), create: jest.fn() },
  } as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    for (const method of [model.create, model.update])
      method.mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-02"),
        }),
      );
  });
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
        deletedAt: null,
        documentVin: { not: "LXYTCKP05P0000002" },
      },
      select: { id: true },
    });
  });
});

it("keeps the previous policy snapshot when correcting dates", async () => {
  const existing = {
    ...policy,
    scooterId: "scooter",
    rawFields: {},
    validFrom: new Date(policy.validFrom),
    validUntil: new Date(policy.validUntil),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };
  const revisions = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  };
  const tx = {
    scooterInsurancePolicy: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...existing, ...data }),
        ),
      findFirst: jest.fn(),
    },
    scooterInsuranceRevision: revisions,
  } as unknown as Prisma.TransactionClient;
  await writeInsurancePolicies(
    tx,
    "scooter",
    policy.documentVin,
    [{ ...policy, validUntil: "2027-01-01" }],
    "manual",
  );
  expect(revisions.create.mock.calls.map(([arg]) => arg.data)).toEqual([
    expect.objectContaining({
      source: "unknown",
      snapshot: expect.objectContaining({ validUntil: "2026-12-31" }),
    }),
    expect.objectContaining({
      source: "manual",
      snapshot: expect.objectContaining({ validUntil: "2027-01-01" }),
    }),
  ]);
});
