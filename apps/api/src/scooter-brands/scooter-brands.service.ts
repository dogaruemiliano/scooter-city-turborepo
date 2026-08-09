import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const scooterBrandInclude = {
  _count: { select: { scooters: true } },
} as const;

@Injectable()
export class ScooterBrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.scooterBrand.findMany({
      include: scooterBrandInclude,
      orderBy: { name: "asc" },
    });
  }

  async create(input: v1.scooterBrands.CreateScooterBrandInput) {
    try {
      return await this.prisma.scooterBrand.create({
        data: { name: input.name, code: input.code },
        include: scooterBrandInclude,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(id: string, input: v1.scooterBrands.UpdateScooterBrandInput) {
    await this.get(id);
    try {
      return await this.prisma.scooterBrand.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
        },
        include: scooterBrandInclude,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    const scooterCount = await this.prisma.scooter.count({
      where: { brandId: id },
    });
    if (scooterCount > 0) {
      throw new ConflictException(
        "A brand used by existing scooters cannot be deleted",
      );
    }
    await this.prisma.scooterBrand.delete({ where: { id } });
  }

  private async get(id: string) {
    const brand = await this.prisma.scooterBrand.findUnique({
      where: { id },
      include: scooterBrandInclude,
    });
    if (!brand) throw new NotFoundException("Scooter brand not found");
    return brand;
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "A brand with this name or code already exists",
      );
    }
    throw error;
  }
}
