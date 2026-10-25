import { BadRequestException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { createHash } from "node:crypto";

export const JOB_LIFETIME_MS = 5 * 60_000;
export const MAX_GLOBAL_PENDING_JOBS = 2000;
export const MAX_USER_PENDING_JOBS = 400;
export const MAX_GLOBAL_PROCESSING_JOBS = 20;
export const MAX_USER_PROCESSING_JOBS = MAX_GLOBAL_PROCESSING_JOBS;
export const SESSION_LIFETIME_MS = 24 * 60 * 60_000;
export const WORKER_LEASE_MS = 90_000;
export const UPLOAD_WRITE_GRACE_MS = 60 * 60_000;
export const VALIDATION_WRITE_GRACE_MS = 2 * 60_000;
export const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const ACTIVE_JOB_STATES = [
  "queued",
  "validating",
  "submitting",
  "submission_unknown",
  "running",
];

export async function lockEditorSession(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "ScooterDocumentEditorSession" WHERE "id" = ${id} FOR UPDATE`;
}

/** All create/upload/dispatch/save/discard paths take the same session lock. */
export async function requireOpenEditorSession(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
) {
  await lockEditorSession(tx, id);
  const session = await tx.scooterDocumentEditorSession.findFirst({
    where: { id, userId, status: "open", expiresAt: { gt: new Date() } },
  });
  if (!session)
    throw new BadRequestException({
      code: "DOCUMENT_EDITOR_SESSION_UNAVAILABLE",
      message: "Document editor session is closed or expired.",
    });
  return session;
}

export async function saveEditorSession(
  tx: Prisma.TransactionClient,
  sessionId: string | undefined,
  userId: string | undefined,
  scooterId: string,
  saveFingerprint?: string,
) {
  if (!sessionId) return;
  if (!userId)
    throw new BadRequestException("Document editor owner is required.");
  await requireOpenEditorSession(tx, sessionId, userId);
  await tx.scooterDocumentEditorSession.update({
    where: { id: sessionId },
    data: { status: "saved", scooterId, saveFingerprint, editorState: {} },
  });
}

export function editorSaveFingerprint(input: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, stable(item)]),
      );
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(input)))
    .digest("hex");
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^DOCUMENT_EXTRACTION_[A-Z_]+$/.test(code)
    ? code
    : "DOCUMENT_EXTRACTION_UNAVAILABLE";
}
