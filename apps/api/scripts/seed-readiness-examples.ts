/** Local-only demo vehicles with real, clearly marked demo document PDFs. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PrismaClient } from "../src/generated/prisma/client";
import { v1 } from "@repo/api-shared";

async function main() {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Readiness examples require the local development database.",
    );
  const bucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  if (!bucket)
    throw new Error("Document storage must be configured for demo CIV PDFs.");
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  });
  const s3 = new S3Client({ region: process.env.IMAGE_STORAGE_S3_REGION });
  const date = (offset: number) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + offset);
    return value;
  };
  const examples = [
    {
      key: "needs-civ",
      label: "Needs CIV",
      civ: false,
      registered: false,
      insured: false,
      inspected: false,
    },
    {
      key: "needs-registration",
      label: "Needs registration",
      civ: true,
      registered: false,
      insured: false,
      inspected: false,
    },
    {
      key: "needs-insurance",
      label: "Needs insurance",
      civ: true,
      registered: true,
      insured: false,
      inspected: true,
    },
    {
      key: "needs-itp",
      label: "Needs ITP",
      civ: true,
      registered: true,
      insured: true,
      inspected: false,
    },
    {
      key: "needs-both",
      label: "Needs insurance and ITP",
      civ: true,
      registered: true,
      insured: false,
      inspected: false,
    },
    {
      key: "ready",
      label: "Documents valid",
      civ: true,
      registered: true,
      insured: true,
      inspected: true,
    },
  ];
  try {
    const brand = await db.scooterBrand.upsert({
      where: { id: "demo-readiness-brand" },
      create: {
        id: "demo-readiness-brand",
        name: "Readiness demo",
        code: "DEMO",
      },
      update: {},
    });
    for (const [index, example] of examples.entries()) {
      const id = `demo-readiness-${example.key}`;
      const scooter = await db.$transaction(async (tx) => {
        const existing = await tx.scooter.findUnique({ where: { id } });
        const data = {
          brandId: brand.id,
          vin: `DEMRDY${String(index + 1).padStart(11, "0")}`,
          model: `Demo: ${example.label}`,
          powertrainType: "combustion" as const,
          engineDisplacementCc: 125,
          registrationType: example.registered
            ? ("national" as const)
            : ("unregistered" as const),
          registrationNumber: example.registered ? `B ${70 + index} DMO` : null,
          civAvailability: example.civ
            ? ("issued" as const)
            : ("unknown" as const),
          deletedAt: null,
        };
        if (existing) return tx.scooter.update({ where: { id }, data });
        const counter = await tx.scooterFleetCounter.update({
          where: { id: 1 },
          data: { lastNumber: { increment: 1 } },
        });
        return tx.scooter.create({
          data: { id, fleetNumber: counter.lastNumber, ...data },
        });
      });
      const documentTypes: ("civ" | "itp_card" | "itp_certificate")[] =
        example.civ
          ? ["civ", "itp_card", "itp_certificate"]
          : ["itp_card", "itp_certificate"];
      for (const type of documentTypes) {
        const documentId =
          type === "civ"
            ? `${id}-civ`
            : type === "itp_card"
              ? `${id}-demo-card`
              : `${id}-demo-certificate`;
        const pdf = await PDFDocument.create();
        const page = pdf.addPage();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawText(`DEMO ${type.toUpperCase()} - ${example.label}`, {
          x: 40,
          y: 760,
          size: 18,
          font,
        });
        page.drawText(`VIN: ${scooter.vin}`, { x: 40, y: 720, size: 12, font });
        page.drawText("Demonstration only. Not an official vehicle document.", {
          x: 40,
          y: 680,
          size: 12,
          font,
        });
        const bytes = await pdf.save();
        const key = `${process.env.IMAGE_STORAGE_S3_PREFIX || "documents"}/demo-readiness/${example.key}/${type}.pdf`;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: "application/pdf",
            ...(process.env.IMAGE_STORAGE_S3_KMS_KEY_ID
              ? {
                  ServerSideEncryption: "aws:kms" as const,
                  SSEKMSKeyId: process.env.IMAGE_STORAGE_S3_KMS_KEY_ID,
                }
              : {}),
          }),
        );
        const assetId = `${documentId}-asset`;
        const asset = {
          provider: "s3",
          bucket,
          storageKey: key,
          contentType: "application/pdf",
          byteSize: bytes.length,
          checksumSha256: createHash("sha256").update(bytes).digest("hex"),
          deletedAt: null,
        };
        await db.mediaAsset.upsert({
          where: { id: assetId },
          create: { id: assetId, ...asset },
          update: asset,
        });
        await db.scooterDocument.upsert({
          where: { id: documentId },
          create: {
            id: documentId,
            scooterId: id,
            type,
            fileName: `DEMO-${type.toUpperCase()}.pdf`,
            assetId,
          },
          update: { deletedAt: null },
        });
      }
      const policyId = `${id}-policy`;
      const policy = {
        validFrom: date(-30),
        validUntil: date(example.insured ? 180 : -1),
        documentVin: scooter.vin,
        vinReviewConfirmed: true,
        insuredName: "Demonstration policy",
      };
      await db.scooterInsurancePolicy.upsert({
        where: { id: policyId },
        create: { id: policyId, scooterId: id, ...policy },
        update: policy,
      });
      const inspectionId = `${id}-inspection`;
      const inspection = {
        inspectionDate: date(-60),
        validUntil: date(example.inspected ? 180 : -1),
        result: "passed",
        cardDocumentId: `${id}-demo-card`,
        certificateDocumentId: `${id}-demo-certificate`,
      };
      await db.scooterItpInspection.upsert({
        where: { id: inspectionId },
        create: { id: inspectionId, scooterId: id, ...inspection },
        update: inspection,
      });
      console.log(
        `${v1.scooters.scooterDisplayCode({ fleetNumber: scooter.fleetNumber, brandCode: brand.code })}: ${example.label}`,
      );
    }
  } finally {
    await db.$disconnect();
    s3.destroy();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo setup failed");
  process.exitCode = 1;
});
