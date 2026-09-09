import { Prisma } from "../../generated/prisma/client";
import {
  FinanceConflictError,
  FinanceNotFoundError,
} from "../domain/finance.errors";
import { SuppliersService } from "./suppliers.service";

const timestamp = new Date("2026-08-23T10:00:00.000Z");

describe("SuppliersService", () => {
  it("normalizes unique fields and derives VAT payer status from the CIF prefix", async () => {
    const { repository, service } = setup();

    const result = await service.create({
      name: "  Rotakt S.R.L. ",
      taxIdentifier: "C.F. RO 6334441",
    });

    expect(repository.createSupplier).toHaveBeenCalledWith({
      name: "  Rotakt S.R.L. ",
      normalizedName: "ROTAKT SRL",
      taxIdentifier: "C.F. RO 6334441",
      normalizedTaxIdentifier: "6334441",
      isVatPayer: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        name: "  Rotakt S.R.L. ",
        taxIdentifier: "C.F. RO 6334441",
        isVatPayer: true,
      }),
    );
  });

  it("keeps a CIF without a country prefix as a non-VAT supplier", async () => {
    const { repository, service } = setup();

    await service.create({
      name: "Local Shop",
      taxIdentifier: "C.F. 6334441",
    });

    expect(repository.createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedTaxIdentifier: "6334441",
        isVatPayer: false,
      }),
    );
  });

  it("returns the exact existing supplier when a create request is retried", async () => {
    const { repository, service } = setup();
    repository.createSupplier.mockRejectedValue(uniqueConstraintError());
    repository.findSupplierByNormalizedIdentity.mockResolvedValue(
      supplierRow(),
    );

    const result = await service.create({
      name: "Rotakt S.R.L.",
      taxIdentifier: "C.F. RO6334441",
    });

    expect(repository.findSupplierByNormalizedIdentity).toHaveBeenCalledWith({
      normalizedName: "ROTAKT SRL",
      normalizedTaxIdentifier: "6334441",
    });
    expect(result.id).toBe("supplier-existing");
  });

  it("keeps the conflict when a stale read has not observed the exact supplier", async () => {
    const { repository, service } = setup();
    repository.createSupplier.mockRejectedValue(uniqueConstraintError());
    repository.findSupplierByNormalizedIdentity.mockResolvedValue(null);

    await expect(
      service.create({ name: "Rotakt SRL", taxIdentifier: "RO6334441" }),
    ).rejects.toBeInstanceOf(FinanceConflictError);
  });

  it.each([
    ["name", supplierRow({ normalizedTaxIdentifier: "9999999" })],
    ["CIF", supplierRow({ normalizedName: "ANOTHER SUPPLIER SRL" })],
  ])(
    "keeps the conflict when only the normalized %s matches",
    async (_field, conflictingSupplier) => {
      const { repository, service } = setup();
      repository.createSupplier.mockRejectedValue(uniqueConstraintError());
      repository.findSupplierByNormalizedIdentity.mockResolvedValue(
        conflictingSupplier,
      );

      await expect(
        service.create({ name: "Rotakt SRL", taxIdentifier: "RO6334441" }),
      ).rejects.toBeInstanceOf(FinanceConflictError);
    },
  );

  it("refuses to edit a supplier that does not exist", async () => {
    const { repository, service } = setup();
    repository.findSupplierById.mockResolvedValue(null);

    await expect(
      service.update("missing", { name: "Updated name" }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    expect(repository.updateSupplier).not.toHaveBeenCalled();
  });
});

function setup() {
  const repository = {
    listSuppliers: jest.fn().mockResolvedValue([]),
    findSupplierById: jest.fn(),
    findSupplierByNormalizedIdentity: jest.fn().mockResolvedValue(null),
    createSupplier: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        id: "supplier-1",
        ...input,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
    updateSupplier: jest.fn(),
  };
  const service = new SuppliersService(repository as never);

  return { repository, service };
}

function supplierRow(
  overrides: Partial<ReturnType<typeof supplierRowBase>> = {},
) {
  return { ...supplierRowBase(), ...overrides };
}

function supplierRowBase() {
  return {
    id: "supplier-existing",
    name: "Rotakt SRL",
    normalizedName: "ROTAKT SRL",
    taxIdentifier: "RO6334441",
    normalizedTaxIdentifier: "6334441",
    isVatPayer: true,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function uniqueConstraintError(): Error {
  return Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error,
    { code: "P2002" },
  );
}
