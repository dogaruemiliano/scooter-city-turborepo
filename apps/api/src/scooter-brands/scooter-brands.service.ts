import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { publishNotificationEvent } from "../notifications/notification-events";

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

  async create(
    input: v1.scooterBrands.CreateScooterBrandInput,
    actorId?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const brand = await tx.scooterBrand.create({
          data: { name: input.name, code: input.code },
          include: scooterBrandInclude,
        });
        await publishNotificationEvent(tx, {
          type: "brand.created",
          category: "brands",
          actorId,
          subjectType: "brand",
          subjectId: brand.id,
          subjectLabel: `${brand.name} (${brand.code})`,
          permissionKey: "scooter_brands.read",
          targetPath: "/scooters/brands",
        });
        return brand;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(
    id: string,
    input: v1.scooterBrands.UpdateScooterBrandInput,
    actorId?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.scooterBrand.findUnique({ where: { id } });
        if (!before) throw new NotFoundException("Scooter brand not found");
        const brand = await tx.scooterBrand.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.code !== undefined ? { code: input.code } : {}),
          },
          include: scooterBrandInclude,
        });
        const changes = (["name", "code"] as const).filter(
          (key) => before[key] !== brand[key],
        );
        if (changes.length)
          await publishNotificationEvent(tx, {
            type: "brand.updated",
            category: "brands",
            actorId,
            subjectType: "brand",
            subjectId: id,
            subjectLabel: `${brand.name} (${brand.code})`,
            permissionKey: "scooter_brands.read",
            targetPath: "/scooters/brands",
            changes,
          });
        return brand;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async delete(id: string, actorId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const brand = await tx.scooterBrand.findUnique({ where: { id } });
      if (!brand) throw new NotFoundException("Scooter brand not found");
      const scooterCount = await tx.scooter.count({
        where: { brandId: id },
      });
      if (scooterCount > 0) {
        throw new ConflictException(
          "A brand used by existing scooters cannot be deleted",
        );
      }
      await tx.scooterBrand.delete({ where: { id } });
      await publishNotificationEvent(tx, {
        type: "brand.deleted",
        category: "brands",
        actorId,
        subjectType: "brand",
        subjectId: id,
        subjectLabel: `${brand.name} (${brand.code})`,
        permissionKey: "scooter_brands.read",
        targetPath: null,
      });
    });
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
