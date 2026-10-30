import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";
import type { ScooterItpInspection } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function response(row: ScooterItpInspection): v1.scooters.ScooterItpInspection {
  return v1.scooters.scooterItpInspectionSchema.parse({
    id: row.id,
    result: row.result,
    source: row.source,
    effectiveDate:
      toDateOnlyString(row.effectiveDate ?? row.inspectionDate) ?? undefined,
    certificateNumber: row.certificateNumber,
    odometerKm: row.odometerKm,
    cardDocumentId: row.cardDocumentId,
    certificateDocumentId: row.certificateDocumentId,
    inspectionDate: toDateOnlyString(row.inspectionDate),
    validUntil: toDateOnlyString(row.validUntil),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

@Injectable()
export class ScooterItpService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scooterId: string): Promise<v1.scooters.ScooterItpList> {
    const scooter = await this.prisma.scooter.findFirst({
      where: { id: scooterId, deletedAt: null },
      select: { id: true, civDocument: { select: { issuedAt: true } } },
    });
    if (!scooter) throw new NotFoundException("Scooter not found");
    const rows = await this.prisma.scooterItpInspection.findMany({
      where: { scooterId },
      orderBy: [
        { effectiveDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    const inspections = rows.map(response);
    return {
      inspections,
      ...v1.scooters.scooterItpSummary(
        inspections,
        undefined,
        toDateOnlyString(scooter.civDocument?.issuedAt ?? null),
      ),
    };
  }

  async create(scooterId: string, input: v1.scooters.ScooterItpInput) {
    return this.prisma.$transaction(async (tx) => {
      // The same row lock serializes document removal and scooter updates.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Scooter" WHERE id = ${scooterId} AND "deletedAt" IS NULL FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException("Scooter not found");
      const scooter = await tx.scooter.findUniqueOrThrow({
        where: { id: scooterId },
        select: { vin: true },
      });
      const source = input.source ?? "document";
      if (source === "manual" && input.expectedLatestId !== undefined) {
        const latest = await tx.scooterItpInspection.findFirst({
          where: { scooterId },
          orderBy: [
            { effectiveDate: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
        });
        if ((latest?.id ?? null) !== input.expectedLatestId)
          throw new ConflictException({
            code: "ITP_RECORD_CONFLICT",
            message:
              "The inspection history changed. Reload before recording this update.",
          });
      }
      const documents =
        source === "manual"
          ? []
          : await tx.scooterDocument.findMany({
              where: {
                id: {
                  in: [
                    ...new Set([
                      input.cardDocumentId!,
                      input.certificateDocumentId!,
                    ]),
                  ],
                },
                scooterId,
                deletedAt: null,
                asset: { deletedAt: null },
              },
              select: { id: true, type: true, extractedData: true },
            });
      for (const [id, requiredType] of source === "manual"
        ? []
        : ([
            [input.cardDocumentId, "itp_card"],
            [input.certificateDocumentId, "itp_certificate"],
          ] as const)) {
        const document = documents.find((entry) => entry.id === id);
        if (!document)
          throw new BadRequestException({
            code: "ITP_EVIDENCE_REQUIRED",
            message: "Both inspection documents must belong to this scooter.",
          });
        const parsed = v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
          document.extractedData,
        );
        if (document.extractedData !== null && !parsed.success)
          throw new BadRequestException({
            code: "ITP_EVIDENCE_REQUIRED",
            message:
              "The document evidence must be reviewed again before confirming this inspection.",
          });
        const evidence = parsed.success ? parsed.data : null;
        const matching =
          evidence?.documents?.filter(
            (entry) => entry.documentType === requiredType,
          ) ?? [];
        if (
          evidence?.documents?.length
            ? !matching.length
            : document.type !== requiredType
        )
          throw new BadRequestException({
            code: "ITP_EVIDENCE_REQUIRED",
            message:
              "Select the updated yellow card and the inspection certificate.",
          });
        // A confirmed unreadable VIN is allowed; a different readable VIN is not.
        const vins = evidence?.documents?.length
          ? evidence.documents
              .filter((entry) =>
                v1.scooters.scooterDocumentReadsVin(entry.documentType),
              )
              .map((entry) => entry.vin)
          : v1.scooters.scooterDocumentReadsVin(document.type)
            ? [evidence?.vin]
            : [];
        if (vins.some((vin) => vin && vin !== scooter.vin))
          throw new BadRequestException({
            code: "ITP_VIN_MISMATCH",
            message: "The inspection document VIN does not match this scooter.",
          });
      }
      const inspectionDate = toDateOnlyDate(input.inspectionDate);
      const existing =
        (source === "document"
          ? await tx.scooterItpInspection.findUnique({
              where: {
                scooterId_cardDocumentId_certificateDocumentId_inspectionDate: {
                  scooterId,
                  cardDocumentId: input.cardDocumentId!,
                  certificateDocumentId: input.certificateDocumentId!,
                  inspectionDate: inspectionDate!,
                },
              },
            })
          : input.expectedLatestId
            ? await tx.scooterItpInspection.findFirst({
                where: {
                  scooterId,
                  source: "manual",
                  id: input.expectedLatestId,
                  inspectionDate,
                  validUntil: toDateOnlyDate(input.validUntil),
                  result: input.result,
                  certificateNumber: input.certificateNumber,
                  odometerKm: input.odometerKm,
                },
              })
            : null) ??
        (source === "document" && input.certificateNumber
          ? await tx.scooterItpInspection.findFirst({
              where: {
                scooterId,
                inspectionDate,
                certificateNumber: {
                  equals: input.certificateNumber,
                  mode: "insensitive",
                },
              },
            })
          : null);
      if (existing) {
        if (
          toDateOnlyString(existing.validUntil) !== input.validUntil ||
          existing.result !== input.result ||
          existing.certificateNumber?.toUpperCase() !==
            input.certificateNumber?.toUpperCase() ||
          existing.odometerKm !== input.odometerKm
        )
          throw new ConflictException({
            code: "ITP_RECORD_CONFLICT",
            message:
              "This inspection was already recorded with different values. Reload the inspection history.",
          });
        return response(existing);
      }
      return response(
        await tx.scooterItpInspection.create({
          data: {
            source,
            effectiveDate:
              inspectionDate ?? toDateOnlyDate(v1.common.dateOnlyToday())!,
            result: input.result,
            certificateNumber: input.certificateNumber,
            odometerKm: input.odometerKm,
            cardDocumentId: input.cardDocumentId,
            certificateDocumentId: input.certificateDocumentId,
            scooterId,
            inspectionDate,
            validUntil: toDateOnlyDate(input.validUntil),
          },
        }),
      );
    });
  }
}
