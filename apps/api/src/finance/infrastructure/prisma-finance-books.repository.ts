import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FinanceNotFoundError,
  FinanceValidationError,
} from "../domain/finance.errors";
import {
  provisionAssociateAccounts,
  provisionBookAccounts,
  provisionBookCategories,
} from "./finance-book.provisioner";

const BOOK_INCLUDE = {
  members: {
    include: {
      associate: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
    orderBy: { validFrom: "asc" },
  },
} satisfies Prisma.FinanceBookInclude;

function nameData(names: v1.finance.UpdateFinanceBookInput["names"]) {
  return {
    name: names.ro,
    nameTranslations: names.en ? { en: names.en } : {},
  };
}

@Injectable()
export class PrismaFinanceBooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: v1.finance.CreateFinanceBookInput, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const company =
          input.type === "ASSOCIATE_POOL"
            ? await tx.financeBook.findUnique({
                where: { type: "COMPANY" },
                include: BOOK_INCLUDE,
              })
            : null;
        if (input.type === "ASSOCIATE_POOL" && !company) {
          throw new FinanceValidationError(
            "Create the company book before the associate pool.",
          );
        }

        const owner = company
          ? null
          : await tx.user.findUnique({ where: { id: actorId } });
        if (!company && (!owner || owner.deletedAt)) {
          throw new FinanceNotFoundError(
            "The founding owner account is not available.",
          );
        }
        const members = company
          ? company.members.filter(
              (member) =>
                member.validFrom <= now &&
                (member.validUntil === null || member.validUntil > now),
            )
          : [
              {
                associateId: owner!.id,
                associate: owner!,
                shareBasisPoints: v1.finance.TOTAL_SHARE_BASIS_POINTS,
              },
            ];
        if (
          !members.length ||
          members.reduce((sum, member) => sum + member.shareBasisPoints, 0) !==
            v1.finance.TOTAL_SHARE_BASIS_POINTS
        ) {
          throw new FinanceValidationError(
            "Company associate shares must total 100% before creating the pool.",
          );
        }

        const book = await tx.financeBook.create({
          data: {
            ...nameData(input.names),
            type: input.type,
            functionalCurrency: "RON",
          },
        });
        await provisionBookAccounts(tx, book.id, book.type);
        await provisionBookCategories(tx, book.id, book.type);
        for (const member of members) {
          await tx.financeBookMember.create({
            data: {
              bookId: book.id,
              associateId: member.associateId,
              shareBasisPoints: member.shareBasisPoints,
              validFrom: now,
            },
          });
          await provisionAssociateAccounts(tx, book.id, book.type, {
            id: member.associateId,
            displayName:
              [member.associate.firstName, member.associate.lastName]
                .filter(Boolean)
                .join(" ") || member.associate.email,
          });
        }
        return tx.financeBook.findUniqueOrThrow({
          where: { id: book.id },
          include: BOOK_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  update(bookId: string, input: v1.finance.UpdateFinanceBookInput) {
    return this.prisma.financeBook.update({
      where: { id: bookId },
      data: nameData(input.names),
      include: BOOK_INCLUDE,
    });
  }
}
