import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  insurancePolicyResponse,
  writeInsurancePolicies,
} from "./scooter-insurance";

@Injectable()
export class ScooterInsuranceService {
  constructor(private readonly prisma: PrismaService) {}
  list(id: string) {
    return this.load(this.prisma, id);
  }
  private async load(
    db: Pick<Prisma.TransactionClient, "scooter">,
    id: string,
  ): Promise<v1.scooters.ScooterInsuranceList> {
    const row = await db.scooter.findFirst({
      where: { id, deletedAt: null },
      select: {
        updatedAt: true,
        insurancePolicies: {
          include: {
            revisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Scooter not found");
    return {
      updatedAt: row.updatedAt.toISOString(),
      policies: row.insurancePolicies
        .filter((policy) => !policy.deletedAt)
        .map(insurancePolicyResponse),
      history: row.insurancePolicies
        .flatMap((policy) =>
          policy.revisions.map((revision) =>
            v1.scooters.insuranceRevisionSchema.parse({
              ...revision,
              createdAt: revision.createdAt.toISOString(),
            }),
          ),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }
  async delete(id: string, policyId: string, expectedUpdatedAt: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Scooter" WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!rows.length) throw new NotFoundException("Scooter not found");
      const scooter = await tx.scooter.findUniqueOrThrow({
        where: { id },
        select: { updatedAt: true },
      });
      if (scooter.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime())
        throw new ConflictException({
          code: "SCOOTER_UPDATE_CONFLICT",
          message: "Reload before deleting insurance.",
        });
      const policy = await tx.scooterInsurancePolicy.findFirst({
        where: { id: policyId, scooterId: id, deletedAt: null },
      });
      if (!policy) throw new NotFoundException("Insurance policy not found");
      // The scooter lock serializes this count with all policy mutations.
      if (
        (await tx.scooterInsurancePolicy.count({
          where: { scooterId: id, deletedAt: null },
        })) <= 1
      )
        throw new ConflictException({
          code: "INSURANCE_LAST_POLICY",
          message: "The last insurance policy cannot be deleted.",
        });
      const previous = await tx.scooterInsuranceRevision.findFirst({
        where: { policyId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      await tx.scooterInsuranceRevision.create({
        data: {
          policyId,
          action: "deleted",
          source: previous?.source ?? "unknown",
          snapshot: insurancePolicyResponse(policy),
        },
      });
      await tx.scooterInsurancePolicy.update({
        where: { id: policyId },
        data: { deletedAt: new Date() },
      });
      await tx.scooter.update({
        where: { id },
        data: {
          updatedAt: new Date(
            Math.max(Date.now(), scooter.updatedAt.getTime() + 1),
          ),
        },
      });
      return this.load(tx, id);
    });
  }
  async update(id: string, input: v1.scooters.ScooterInsuranceSave) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Scooter" WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!rows.length) throw new NotFoundException("Scooter not found");
      const scooter = await tx.scooter.findUniqueOrThrow({
        where: { id },
        select: { vin: true, updatedAt: true },
      });
      if (
        scooter.updatedAt.getTime() !==
        new Date(input.expectedUpdatedAt).getTime()
      )
        throw new ConflictException({
          code: "SCOOTER_UPDATE_CONFLICT",
          message: "Scooter changed. Reload before saving insurance.",
        });
      await writeInsurancePolicies(
        tx,
        id,
        scooter.vin,
        input.policies,
        input.source,
      );
      await tx.scooter.update({
        where: { id },
        data: {
          updatedAt: new Date(
            Math.max(Date.now(), scooter.updatedAt.getTime() + 1),
          ),
        },
      });
      return this.load(tx, id);
    });
  }
}
