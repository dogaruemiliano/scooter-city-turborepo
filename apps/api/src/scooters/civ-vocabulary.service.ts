import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CivVocabularyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open vocabulary populated by saved values, not an official RAR catalogue. */
  async list() {
    return v1.vehicleCiv.civVocabularySchema.parse(
      await this.prisma.civVocabularyEntry.findMany({
        where: { field: { in: [...v1.vehicleCiv.CIV_VOCABULARY_FIELDS] } },
        orderBy: [{ field: "asc" }, { value: "asc" }],
      }),
    );
  }

  async remember(
    tx: Prisma.TransactionClient,
    input: v1.scooters.UpdateScooterInput,
  ) {
    for (const field of v1.vehicleCiv.CIV_VOCABULARY_FIELDS) {
      const value = input[field];
      if (value)
        await tx.civVocabularyEntry.upsert({
          where: { field_value: { field, value } },
          create: { field, value },
          update: {},
        });
    }
  }
}
