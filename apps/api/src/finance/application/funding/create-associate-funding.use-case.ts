import { Injectable } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { ImageStorageService } from "../../../image-storage/image-storage.service";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  FinanceNotFoundError,
  FinanceValidationError,
  IdempotencyConflictError,
} from "../../domain/finance.errors";
import { JournalValidator } from "../../domain/journal-validator";
import { AssociateFundingPostingPolicy } from "../../domain/policies/associate-funding-posting.policy";
import { toFinancialOperation } from "../../finance.mapper";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import {
  FUNDING_PROOF_DRAFT_PURPOSE,
  fundingProofUploadScope,
} from "./create-funding-proof-upload.use-case";
import {
  fingerprintFundingInput,
  fingerprintStoredFunding,
  toAssociateFundingCommand,
} from "./funding-command";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export interface CreateAssociateFundingRequest {
  input: v1.finance.CreateAssociateFundingInput;
  idempotencyKey: string;
  createdById: string;
}

@Injectable()
export class CreateAssociateFundingUseCase {
  constructor(
    private readonly policy: AssociateFundingPostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async execute({
    input,
    idempotencyKey,
    createdById,
  }: CreateAssociateFundingRequest): Promise<v1.finance.FinancialOperation> {
    const replay = await this.resolveReplay(input, idempotencyKey);
    if (replay) return replay;

    await this.assertReferences(input);
    const proof = input.proofUploadToken
      ? await this.prepareProof(input.proofUploadToken, createdById)
      : null;
    const plan = await this.policy.build(toAssociateFundingCommand(input));
    this.journal.assertBalanced(plan.postings);

    let operationId: string;
    try {
      operationId = await this.repository.createPostedAssociateFunding({
        bookId: input.bookId,
        occurredAt: new Date(input.occurredAt),
        description:
          input.type === "LOAN"
            ? "Associate loan received"
            : "Capital contribution received",
        idempotencyKey,
        createdById,
        amountMinor: input.amountMinor,
        type: input.type,
        associateId: input.associateId,
        destinationAccountId: input.destinationAccountId,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        proof,
        postings: plan.postings,
      });
    } catch (error) {
      const raced = await this.resolveRaceWinner(error, input, idempotencyKey);
      if (raced) return raced;
      throw error;
    }

    return this.loadOperation(operationId);
  }

  private async assertReferences(
    input: v1.finance.CreateAssociateFundingInput,
  ): Promise<void> {
    const book = await this.repository.findBookById(input.bookId);
    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.");
    }
    if (book.type !== "COMPANY") {
      throw new FinanceValidationError(
        "Company funding can only be recorded in the company finance book.",
      );
    }
    if (
      !book.members.some((member) => member.associateId === input.associateId)
    ) {
      throw new FinanceValidationError(
        "The provider must be an associate in the company finance book.",
      );
    }
  }

  private async prepareProof(uploadToken: string, userId: string) {
    const stored = await this.imageStorage.completePresignedUpload(
      uploadToken,
      fundingProofUploadScope(userId),
    );
    const draft = await this.prisma.draftUpload.findUnique({
      where: { storageKey: stored.storageKey },
    });

    if (
      !draft ||
      draft.claimedAt ||
      draft.expiresAt <= new Date() ||
      draft.userId !== userId ||
      draft.purpose !== FUNDING_PROOF_DRAFT_PURPOSE ||
      draft.provider !== stored.provider ||
      draft.bucket !== stored.bucket ||
      draft.contentType !== stored.contentType ||
      draft.byteSize !== stored.byteSize ||
      draft.checksumSha256 !== stored.checksumSha256
    ) {
      throw new FinanceValidationError(
        "The receipt upload is expired, already used, or does not match.",
      );
    }

    return { draftUploadId: draft.id, storageKey: stored.storageKey };
  }

  private async resolveReplay(
    input: v1.finance.CreateAssociateFundingInput,
    idempotencyKey: string,
  ) {
    const existing = await this.repository.findOperationByIdempotencyKey(
      input.bookId,
      idempotencyKey,
    );
    if (!existing) return null;
    if (fingerprintStoredFunding(existing) !== fingerprintFundingInput(input)) {
      throw new IdempotencyConflictError(
        "This idempotency key was already used for different company funding.",
      );
    }
    return toFinancialOperation(existing);
  }

  private async resolveRaceWinner(
    error: unknown,
    input: v1.finance.CreateAssociateFundingInput,
    idempotencyKey: string,
  ) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
      ? this.resolveReplay(input, idempotencyKey)
      : null;
  }

  private async loadOperation(operationId: string) {
    const row = await this.repository.findOperationById(operationId);
    if (!row) {
      throw new FinanceNotFoundError(
        "The company funding was saved but could not be read back.",
      );
    }
    return toFinancialOperation(row);
  }
}
