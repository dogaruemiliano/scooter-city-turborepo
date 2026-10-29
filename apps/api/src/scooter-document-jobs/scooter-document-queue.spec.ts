import type { Env } from "../config/env";
import { Logger } from "@nestjs/common";
import type { Prisma, ScooterDocumentJob } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { DocumentValidationService } from "../document-validation/document-validation.service";
import type { OpenAiScooterDocumentJobProvider } from "../scooter-document-extraction/openai-scooter-document-job.provider";
import type { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import {
  processingReservationWhere,
  ScooterDocumentDispatcherService,
  selectWaitingJobs,
} from "./scooter-document-dispatcher.service";

const waitingJob = (id: string, userId: string, sessionId = id) =>
  ({
    id,
    userId,
    sessionId,
    createdAt: new Date(1000),
    slotReservedAt: null,
  }) as ScooterDocumentJob;

it("shares available slots across owners and different scooters", () => {
  const jobs = [
    waitingJob("a1", "owner-a", "scooter-a"),
    waitingJob("a2", "owner-a", "scooter-a"),
    waitingJob("a3", "owner-a", "scooter-b"),
    waitingJob("b1", "owner-b"),
    waitingJob("b2", "owner-b"),
  ];
  expect(
    selectWaitingJobs(jobs, [], new Map(), 4).map((job) => job.id),
  ).toEqual(["a1", "b1", "a3", "b2"]);
});

it("advances untouched scooters before continuing a large earlier PDF set", () => {
  const jobs = [
    waitingJob("old", "owner", "already-started"),
    waitingJob("new", "owner"),
  ];
  const history = new Map([["already-started", new Date()]]);
  expect(
    selectWaitingJobs(jobs, [{ userId: "owner" }], history, 3).map(
      (job) => job.id,
    ),
  ).toEqual(["new", "old"]);
});

it("rotates busy owners so a later admin's import is not starved by earlier bulk uploads", () => {
  const jobs = [
    waitingJob("a", "owner-a"),
    waitingJob("b", "owner-b"),
    waitingJob("c", "owner-c"),
  ];
  const recent = new Map([
    ["owner-a", new Date(3000)],
    ["owner-b", new Date(2000)],
  ]);
  expect(
    selectWaitingJobs(jobs, [], new Map(), 2, recent).map((job) => job.id),
  ).toEqual(["c", "b"]);
});

it("retains a reservation for uncertain remote work even when cancelled or expired", () => {
  const now = new Date();
  expect(processingReservationWhere(now)).toEqual({
    OR: [
      {
        slotReservedAt: { not: null },
        status: {
          in: expect.arrayContaining(["running", "queued"]) as string[],
        },
        expiresAt: { gt: now },
      },
      { submissionUncertainAt: { not: null } },
    ],
  });
});

function dispatcherSetup(count: number) {
  const candidate = {
    ...waitingJob("job", "owner"),
    status: "queued",
    expiresAt: new Date(Date.now() + 86_400_000),
    source: { bucket: "private", storageKey: "original.pdf" },
    validatedSource: null,
    session: { status: "open", expiresAt: new Date(Date.now() + 86_400_000) },
  };
  const update = jest
    .fn<Promise<ScooterDocumentJob>, [{ data: Record<string, unknown> }]>()
    .mockImplementation(({ data }) =>
      Promise.resolve({ ...candidate, ...data }),
    );
  const updateMany = jest
    .fn<Promise<{ count: number }>, [Prisma.ScooterDocumentJobUpdateManyArgs]>()
    .mockResolvedValue({ count: 1 });
  const tx = {
    $queryRaw: jest.fn(),
    scooterDocumentJob: {
      findFirst: jest.fn().mockResolvedValue(candidate),
      count: jest.fn().mockResolvedValue(count),
      update,
    },
    scooterDocumentResource: { create: jest.fn() },
  };
  const prisma = {
    $transaction: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
    scooterDocumentJob: { updateMany },
  };
  const validate = jest.fn().mockResolvedValue({ storageKey: "prepared.pdf" });
  const dispatcher = new ScooterDocumentDispatcherService(
    prisma as unknown as PrismaService,
    {
      createDocumentAnalysisKey: () => "prepared.pdf",
    } as unknown as ImageStorageService,
    { validate } as unknown as DocumentValidationService,
    {} as OpenAiScooterDocumentJobProvider,
    {} as ScooterDocumentExtractionService,
    { SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED: true } as Env,
  );
  return { dispatcher, candidate, validate, tx, updateMany };
}

it("keeps queued work intact and includes database cause codes when a dispatcher tick fails", async () => {
  const { dispatcher } = dispatcherSetup(0);
  const refused = Object.assign(new Error("private connection information"), {
    code: "ECONNREFUSED",
  });
  jest
    .spyOn(dispatcher, "runOnce")
    .mockRejectedValue(new AggregateError([refused], ""));
  const warn = jest
    .spyOn(Logger.prototype, "warn")
    .mockImplementation(() => {});
  try {
    await expect(dispatcher.tick()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      { errorName: "AggregateError", errorCodes: ["ECONNREFUSED"] },
      "Document dispatcher failed; durable work remains queued.",
    );
  } finally {
    warn.mockRestore();
  }
});

it("leaves a normal waiting job queued when the owner's active slots are full", async () => {
  const { dispatcher, candidate, validate, tx } = dispatcherSetup(20);
  await dispatcher.process(candidate);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  expect(tx.scooterDocumentJob.update).not.toHaveBeenCalled();
  expect(validate).not.toHaveBeenCalled();
});

it("starts the five-minute processing deadline only when a waiting job leases a slot", async () => {
  const { dispatcher, candidate, validate, tx, updateMany } =
    dispatcherSetup(0);
  const before = Date.now();
  await dispatcher.process(candidate);
  const reservation = tx.scooterDocumentJob.update.mock.calls[0][0].data as {
    slotReservedAt: Date;
    expiresAt: Date;
  };
  expect(reservation.slotReservedAt.getTime()).toBeGreaterThanOrEqual(before);
  expect(
    reservation.expiresAt.getTime() - reservation.slotReservedAt.getTime(),
  ).toBe(300_000);
  expect(validate).toHaveBeenCalledTimes(1);
  expect(updateMany.mock.calls[0][0].data).toMatchObject({
    status: "queued",
    validatedSource: { storageKey: "prepared.pdf" },
  });
});

it("keeps dispatching new files while an earlier validation is still in flight", async () => {
  let waiting = [waitingJob("first", "owner")];
  let finish!: () => void;
  const slow = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const prisma = {
    scooterDocumentJob: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            select,
          }: {
            where: { slotReservedAt?: unknown };
            select?: unknown;
          }) =>
            Promise.resolve(
              select || where.slotReservedAt !== null ? [] : waiting,
            ),
        ),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const dispatcher = new ScooterDocumentDispatcherService(
    prisma as unknown as PrismaService,
    {} as ImageStorageService,
    {} as DocumentValidationService,
    {} as OpenAiScooterDocumentJobProvider,
    {} as ScooterDocumentExtractionService,
    {} as Env,
  );
  jest
    .spyOn(
      dispatcher as unknown as { processEvents: () => Promise<void> },
      "processEvents",
    )
    .mockResolvedValue(undefined);
  const process = jest
    .spyOn(dispatcher, "process")
    .mockImplementation((job) =>
      job.id === "first" ? slow : Promise.resolve(),
    );
  await dispatcher.runOnce(false);
  waiting = [...waiting, waitingJob("second", "owner")];
  await dispatcher.runOnce(false);
  expect(process.mock.calls.map(([job]) => job.id)).toEqual([
    "first",
    "second",
  ]);
  finish();
  await slow;
});
