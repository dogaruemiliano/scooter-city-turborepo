import { BadRequestException, Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { createHash } from "node:crypto";

import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface CounterpartySearchRow {
  id: string;
  kind: v1.finance.FinancialCounterpartyKind;
  label: string;
  email: string | null;
  phoneSuffix: string | null;
  identifierSuffix: string | null;
  score: number;
}

interface CounterpartyCursor {
  version: 1;
  filterFingerprint: string;
  score: number;
  kind: v1.finance.FinancialCounterpartyKind;
  label: string;
  id: string;
}

const CURSOR_ERROR = "Invalid or stale counterparty search cursor";

@Injectable()
export class CounterpartySearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: v1.finance.SearchFinancialCounterpartiesQuery,
  ): Promise<v1.finance.FinancialCounterpartySearchResult> {
    const term = query.search.toLocaleLowerCase("ro-RO");
    const isPreview = term.length === 0;
    const escapedTerm = this.escapeLikePattern(term);
    const pattern = `%${escapedTerm}%`;
    const digits = term.replace(/\D/gu, "");
    const cursor = query.cursor ? this.parseCursor(query.cursor) : null;
    const filterFingerprint = this.filterFingerprint(
      term,
      query.kind,
      query.transactionType,
    );
    const personText = PrismaRuntime.sql`lower(
      coalesce(p.email, '') || ' ' ||
      coalesce(p.phone, '') || ' ' ||
      coalesce(p."firstName", '') || ' ' ||
      coalesce(p."lastName", '') || ' ' ||
      coalesce(p."addressLine1", '') || ' ' ||
      coalesce(p."addressLine2", '') || ' ' ||
      coalesce(p.city, '') || ' ' ||
      coalesce(p.region, '') || ' ' ||
      coalesce(p."postalCode", '') || ' ' ||
      coalesce(p."countryCode", '') || ' ' ||
      coalesce(p.notes, '')
    )`;
    const companyText = PrismaRuntime.sql`lower(
      coalesce(company."legalName", '') || ' ' ||
      coalesce(company."tradingName", '') || ' ' ||
      coalesce(company."taxIdentifier", '') || ' ' ||
      coalesce(company."taxIdentifierNormalized", '') || ' ' ||
      coalesce(company."registrationNumber", '') || ' ' ||
      coalesce(company.email, '') || ' ' ||
      coalesce(company.phone, '') || ' ' ||
      coalesce(company."phoneNormalized", '')
    )`;

    if (cursor && cursor.filterFingerprint !== filterFingerprint) {
      throw new BadRequestException(CURSOR_ERROR);
    }

    const rows = await this.prisma.$queryRaw<CounterpartySearchRow[]>(
      PrismaRuntime.sql`
        WITH candidates AS (
          SELECT
            cp.id,
            'PERSON'::text AS kind,
            concat_ws(' ', p."firstName", p."lastName") AS label,
            p.email,
            CASE WHEN p.phone IS NULL THEN NULL ELSE right(regexp_replace(p.phone, '\\D', '', 'g'), 4) END AS "phoneSuffix",
            right(identity.cnp, 4) AS "identifierSuffix",
            greatest(
              word_similarity(${term}, ${personText}),
              CASE WHEN lower(p.email) = ${term} THEN 1.7 ELSE 0 END,
              CASE
                WHEN ${digits} <> '' AND regexp_replace(p.phone, '\\D', '', 'g') = ${digits} THEN 1.8
                WHEN length(${digits}) >= 3 AND regexp_replace(p.phone, '\\D', '', 'g') LIKE ${digits + "%"} THEN 1.4
                ELSE 0
              END,
              CASE
                WHEN length(${digits}) = 13 AND identity.cnp = ${digits} THEN 2.0
                WHEN length(${digits}) >= 6 AND identity.cnp LIKE ${digits + "%"} THEN 1.5
                ELSE 0
              END
            )::double precision AS score
          FROM "Counterparty" cp
          JOIN "Person" p ON p.id = cp."personId"
          LEFT JOIN LATERAL (
            SELECT d.cnp
            FROM "PersonDocument" d
            WHERE d."personId" = p.id
              AND d."deletedAt" IS NULL
              AND d.cnp IS NOT NULL
            ORDER BY d."updatedAt" DESC, d.id ASC
            LIMIT 1
          ) identity ON true
          WHERE cp.type = 'PERSON'
            AND cp."isActive" = true
            AND p."deletedAt" IS NULL
            AND (${query.kind ?? null}::text IS NULL OR ${query.kind ?? null} = 'PERSON')
            AND (${isPreview} OR (
              ${personText} LIKE ${pattern} ESCAPE '\\'
              OR ${personText} %> ${term}
              OR (${digits} <> '' AND regexp_replace(p.phone, '\\D', '', 'g') LIKE ${"%" + digits + "%"})
              OR (length(${digits}) >= 6 AND identity.cnp LIKE ${digits + "%"})
            ))

          UNION ALL

          SELECT
            cp.id,
            'COMPANY'::text AS kind,
            coalesce(company."tradingName", company."legalName") AS label,
            company.email,
            CASE WHEN company."phoneNormalized" IS NULL THEN NULL ELSE right(company."phoneNormalized", 4) END AS "phoneSuffix",
            right(company."taxIdentifierNormalized", 4) AS "identifierSuffix",
            greatest(
              word_similarity(${term}, ${companyText}),
              CASE WHEN lower(company.email) = ${term} THEN 1.7 ELSE 0 END,
              CASE
                WHEN ${digits} <> '' AND company."phoneNormalized" = ${digits} THEN 1.8
                WHEN length(${digits}) >= 3 AND company."phoneNormalized" LIKE ${digits + "%"} THEN 1.4
                ELSE 0
              END,
              CASE
                WHEN length(${digits}) >= 4 AND company."taxIdentifierNormalized" = ${digits} THEN 2.0
                WHEN length(${digits}) >= 4 AND company."taxIdentifierNormalized" LIKE ${digits + "%"} THEN 1.5
                ELSE 0
              END
            )::double precision AS score
          FROM "Counterparty" cp
          JOIN "Company" company ON company.id = cp."companyId"
          WHERE cp.type = 'COMPANY'
            AND cp."isActive" = true
            AND company."isActive" = true
            AND company."deletedAt" IS NULL
            AND (${query.kind ?? null}::text IS NULL OR ${query.kind ?? null} = 'COMPANY')
            AND (${isPreview} OR (
              ${companyText} LIKE ${pattern} ESCAPE '\\'
              OR ${companyText} %> ${term}
              OR (${digits} <> '' AND company."phoneNormalized" LIKE ${"%" + digits + "%"})
              OR (length(${digits}) >= 4 AND company."taxIdentifierNormalized" LIKE ${digits + "%"})
            ))
        ), ranked AS (
          SELECT
            candidates.*,
            CASE WHEN ${isPreview} THEN (
              SELECT count(*)::double precision
              FROM "MoneyTransaction" mt
              WHERE mt."counterpartyId" = candidates.id
                AND mt.type = ${query.transactionType}::"MoneyTransactionType"
                AND mt.status = 'POSTED'
            ) ELSE candidates.score END AS "rankScore"
          FROM candidates
        )
        SELECT id, kind, label, email, "phoneSuffix", "identifierSuffix", "rankScore" AS score
        FROM ranked
        WHERE (
          ${cursor?.score ?? null}::double precision IS NULL
          OR "rankScore" < ${cursor?.score ?? null}::double precision
          OR (
            "rankScore" = ${cursor?.score ?? null}::double precision
            AND (kind, lower(label), id) > (
              ${cursor?.kind ?? null}::text,
              lower(${cursor?.label ?? null}::text),
              ${cursor?.id ?? null}::text
            )
          )
        )
        ORDER BY "rankScore" DESC, kind ASC, lower(label) ASC, id ASC
        LIMIT ${query.pageSize + 1}
      `,
    );

    const hasNextPage = rows.length > query.pageSize;
    const page = rows.slice(0, query.pageSize);
    const last = page.at(-1);

    return {
      items: page.map((row) => this.toItem(row)),
      nextCursor:
        hasNextPage && last
          ? this.encodeCursor({
              version: 1,
              filterFingerprint,
              score: last.score,
              kind: last.kind,
              label: last.label,
              id: last.id,
            })
          : null,
    };
  }

  private toItem(
    row: CounterpartySearchRow,
  ): v1.finance.FinancialCounterpartySearchItem {
    const phoneMasked = row.phoneSuffix ? `…${row.phoneSuffix}` : null;
    const identifierMasked = row.identifierSuffix
      ? `…${row.identifierSuffix}`
      : null;
    const metadata = [row.email, phoneMasked]
      .filter((value): value is string => Boolean(value))
      .join(" · ");

    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      description: metadata,
      email: row.email,
      phoneMasked,
      identifierMasked,
    };
  }

  private filterFingerprint(
    search: string,
    kind: v1.finance.FinancialCounterpartyKind | undefined,
    transactionType: "INCOME" | "EXPENSE",
  ): string {
    return createHash("sha256")
      .update(JSON.stringify([search, kind ?? null, transactionType]))
      .digest("base64url");
  }

  private encodeCursor(cursor: CounterpartyCursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  }

  private parseCursor(value: string): CounterpartyCursor {
    try {
      const bytes = Buffer.from(value, "base64url");
      if (bytes.length === 0 || bytes.toString("base64url") !== value) {
        throw new Error("Non-canonical base64url");
      }
      const parsed: unknown = JSON.parse(bytes.toString("utf8"));
      if (!this.isCursor(parsed)) throw new Error("Invalid cursor payload");
      return parsed;
    } catch {
      throw new BadRequestException(CURSOR_ERROR);
    }
  }

  private isCursor(value: unknown): value is CounterpartyCursor {
    if (!value || typeof value !== "object") return false;
    const cursor = value as Record<string, unknown>;
    return (
      Object.keys(cursor).length === 6 &&
      cursor.version === 1 &&
      typeof cursor.filterFingerprint === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(cursor.filterFingerprint) &&
      typeof cursor.score === "number" &&
      Number.isFinite(cursor.score) &&
      (cursor.kind === "PERSON" || cursor.kind === "COMPANY") &&
      typeof cursor.label === "string" &&
      cursor.label.length > 0 &&
      typeof cursor.id === "string" &&
      cursor.id.length > 0
    );
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/gu, "\\$&");
  }
}
