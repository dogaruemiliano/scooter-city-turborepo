import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../../generated/prisma/client";
import {
  FinanceConflictError,
  FinanceNotFoundError,
  FinanceValidationError,
} from "../domain/finance.errors";
import {
  normalizeSupplierName,
  normalizeSupplierTaxIdentifier,
  supplierTaxIdentifierHasCountryPrefix,
} from "../domain/supplier-normalization";
import { toSupplier } from "../finance.mapper";
import { PrismaFinanceRepository } from "../infrastructure/prisma-finance.repository";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class SuppliersService {
  constructor(private readonly repository: PrismaFinanceRepository) {}

  async list(
    query: v1.finance.ListSuppliersQuery,
  ): Promise<v1.finance.SupplierList> {
    const search = query.search?.trim() ?? "";
    const rows = await this.repository.listSuppliers({
      normalizedNameSearch: search ? normalizeSupplierName(search) : null,
      normalizedTaxIdentifierSearch: search
        ? normalizeSupplierTaxIdentifier(search)
        : null,
      includeInactive: query.includeInactive,
    });

    return { items: rows.map(toSupplier) };
  }

  async create(
    input: v1.finance.CreateSupplierInput,
  ): Promise<v1.finance.Supplier> {
    const normalized = normalizeSupplier(input.name, input.taxIdentifier);

    try {
      return toSupplier(
        await this.repository.createSupplier({
          name: input.name,
          normalizedName: normalized.name,
          taxIdentifier: input.taxIdentifier,
          normalizedTaxIdentifier: normalized.taxIdentifier,
          isVatPayer: supplierTaxIdentifierHasCountryPrefix(
            input.taxIdentifier,
          ),
        }),
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.repository.findSupplierByNormalizedIdentity(
          {
            normalizedName: normalized.name,
            normalizedTaxIdentifier: normalized.taxIdentifier,
          },
        );

        if (
          existing?.normalizedName === normalized.name &&
          existing.normalizedTaxIdentifier === normalized.taxIdentifier
        ) {
          return toSupplier(existing);
        }
      }

      this.handleWriteError(error);
    }
  }

  async update(
    supplierId: string,
    input: v1.finance.UpdateSupplierInput,
  ): Promise<v1.finance.Supplier> {
    const current = await this.repository.findSupplierById(supplierId);
    if (!current) {
      throw new FinanceNotFoundError("That supplier does not exist.", {
        supplierId,
      });
    }

    const name = input.name ?? current.name;
    const taxIdentifier = input.taxIdentifier ?? current.taxIdentifier;
    const normalized = normalizeSupplier(name, taxIdentifier);

    try {
      return toSupplier(
        await this.repository.updateSupplier(supplierId, {
          name,
          normalizedName: normalized.name,
          taxIdentifier,
          normalizedTaxIdentifier: normalized.taxIdentifier,
          isVatPayer: supplierTaxIdentifierHasCountryPrefix(taxIdentifier),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        }),
      );
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  private handleWriteError(error: unknown): never {
    if (isUniqueConstraintViolation(error)) {
      throw new FinanceConflictError(
        "A supplier with this name or CIF already exists.",
      );
    }

    throw error;
  }
}

function normalizeSupplier(
  name: string,
  taxIdentifier: string,
): { name: string; taxIdentifier: string } {
  const normalizedName = normalizeSupplierName(name);
  const normalizedTaxIdentifier = normalizeSupplierTaxIdentifier(taxIdentifier);

  if (!normalizedName || !normalizedTaxIdentifier) {
    throw new FinanceValidationError(
      "The supplier name and CIF must contain letters or numbers.",
    );
  }

  return {
    name: normalizedName,
    taxIdentifier: normalizedTaxIdentifier,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
