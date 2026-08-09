import type { v1 } from "@repo/api-shared";

import type { ScooterBrand } from "../generated/prisma/client";

type ScooterBrandWithCount = ScooterBrand & {
  _count: { scooters: number };
};

export function toScooterBrand(
  row: ScooterBrandWithCount,
): v1.scooterBrands.ScooterBrand {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    scooterCount: row._count.scooters,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
