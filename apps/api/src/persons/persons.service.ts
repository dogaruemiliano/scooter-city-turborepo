import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../common/dates/date-only";
import type { PersonDocument, Prisma } from "../generated/prisma/client";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { PersonWithDocuments } from "./persons.mapper";

interface SearchIdRow {
  id: string;
}

interface SearchCountRow {
  total: number;
}

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: v1.persons.CreatePersonInput,
  ): Promise<PersonWithDocuments> {
    try {
      return await this.prisma.person.create({
        data: this.toCreateData(input),
        include: this.personInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async list(query: v1.persons.ListPersonsQuery): Promise<{
    items: PersonWithDocuments[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    if (query.search) {
      return this.search(query);
    }

    const where = this.toListWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        include: this.personInclude(),
        orderBy: this.toPersonOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  private async search(query: v1.persons.ListPersonsQuery): Promise<{
    items: PersonWithDocuments[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const cte = this.toSearchCte(query);
    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<SearchCountRow[]>(PrismaRuntime.sql`
        ${cte}
        SELECT count(*)::int AS total
        FROM scored
      `),
      this.prisma.$queryRaw<SearchIdRow[]>(PrismaRuntime.sql`
        ${cte}
        SELECT id
        FROM scored
        ORDER BY ${this.toSearchOrderBy(query)}
        OFFSET ${(query.page - 1) * query.pageSize}
        LIMIT ${query.pageSize}
      `),
    ]);

    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: countRows[0]?.total ?? 0,
      };
    }

    const order = new Map(ids.map((id, index) => [id, index]));
    const items = await this.prisma.person.findMany({
      where: { id: { in: ids } },
      include: this.personInclude(),
    });
    items.sort((first, second) => order.get(first.id)! - order.get(second.id)!);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: countRows[0]?.total ?? 0,
    };
  }

  async findActiveById(id: string): Promise<PersonWithDocuments | null> {
    return this.prisma.person.findFirst({
      where: { id, deletedAt: null },
      include: this.personInclude(),
    });
  }

  async update(
    id: string,
    input: v1.persons.UpdatePersonInput,
  ): Promise<PersonWithDocuments> {
    const existing = await this.findActiveById(id);
    if (!existing) {
      throw new NotFoundException("Person not found");
    }

    try {
      return await this.prisma.person.update({
        where: { id },
        data: this.toUpdateData(input),
        include: this.personInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.prisma.person.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException("Person not found");
    }
  }

  async listDocuments(personId: string): Promise<PersonDocument[]> {
    await this.ensureActivePerson(personId);
    return this.prisma.personDocument.findMany({
      where: { personId, deletedAt: null },
      orderBy: this.documentOrderBy(),
    });
  }

  async createDocument(
    personId: string,
    input: v1.persons.CreatePersonDocumentInput,
  ): Promise<PersonDocument> {
    await this.ensureActivePerson(personId);
    await this.ensureDocumentTypeAvailable(personId, input.type);

    try {
      return await this.prisma.personDocument.create({
        data: {
          person: { connect: { id: personId } },
          ...this.toDocumentCreateData(input),
        },
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findActiveDocument(
    personId: string,
    documentId: string,
  ): Promise<PersonDocument | null> {
    return this.prisma.personDocument.findFirst({
      where: {
        id: documentId,
        personId,
        deletedAt: null,
        person: { deletedAt: null },
      },
    });
  }

  async updateDocument(
    personId: string,
    documentId: string,
    input: v1.persons.UpdatePersonDocumentInput,
  ): Promise<PersonDocument> {
    const existing = await this.findActiveDocument(personId, documentId);
    if (!existing) {
      throw new NotFoundException("Person document not found");
    }

    if (input.type && input.type !== existing.type) {
      await this.ensureDocumentTypeAvailable(personId, input.type, documentId);
    }

    try {
      return await this.prisma.personDocument.update({
        where: { id: documentId },
        data: this.toDocumentUpdateData(input),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async softDeleteDocument(
    personId: string,
    documentId: string,
  ): Promise<void> {
    const existing = await this.findActiveDocument(personId, documentId);
    if (!existing) {
      throw new NotFoundException("Person document not found");
    }

    await this.prisma.personDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
  }

  private toCreateData(
    input: v1.persons.CreatePersonInput,
  ): Prisma.PersonCreateInput {
    return {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: toDateOnlyDate(input.dateOfBirth),
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      documents:
        input.documents && input.documents.length > 0
          ? {
              create: input.documents.map((document) =>
                this.toDocumentCreateData(document),
              ),
            }
          : undefined,
      notes: input.notes,
    };
  }

  private toUpdateData(
    input: v1.persons.UpdatePersonInput,
  ): Prisma.PersonUpdateInput {
    return {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: toDateOnlyDate(input.dateOfBirth),
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      notes: input.notes,
    };
  }

  private toDocumentCreateData(
    input: v1.persons.CreatePersonDocumentInput,
  ): Prisma.PersonDocumentCreateWithoutPersonInput {
    return {
      type: input.type,
      series: input.series,
      number: input.number,
      cnp: input.cnp,
      issuingCountryCode: input.issuingCountryCode,
      issuedBy: input.issuedBy,
      issuedOn: toDateOnlyDate(input.issuedOn),
      expiresOn: toDateOnlyDate(input.expiresOn),
      status: input.status ?? "unverified",
      notes: input.notes,
    };
  }

  private toDocumentUpdateData(
    input: v1.persons.UpdatePersonDocumentInput,
  ): Prisma.PersonDocumentUpdateInput {
    return {
      type: input.type,
      series: input.series,
      number: input.number,
      cnp: input.cnp,
      issuingCountryCode: input.issuingCountryCode,
      issuedBy: input.issuedBy,
      issuedOn: toDateOnlyDate(input.issuedOn),
      expiresOn: toDateOnlyDate(input.expiresOn),
      status: input.status,
      notes: input.notes,
    };
  }

  private toListWhere(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.PersonWhereInput {
    const and: Prisma.PersonWhereInput[] = [];

    switch (this.resolveRecordStatus(query)) {
      case "active":
        and.push({ deletedAt: null });
        break;
      case "deleted":
        and.push({ deletedAt: { not: null } });
        break;
      case "all":
        break;
    }

    if (query.countryCode) {
      and.push({ countryCode: query.countryCode });
    }

    and.push(...this.toDocumentFilterWhere(query));

    return and.length > 0 ? { AND: and } : {};
  }

  private toDocumentFilterWhere(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.PersonWhereInput[] {
    const and: Prisma.PersonWhereInput[] = [];
    const documentWhere = this.toMatchingDocumentWhere(query);

    if (query.documentExpiry === "missing") {
      and.push({ documents: { none: { deletedAt: null } } });
    }

    if (documentWhere) {
      and.push({ documents: { some: documentWhere } });
    }

    return and;
  }

  private toMatchingDocumentWhere(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.PersonDocumentWhereInput | null {
    const and: Prisma.PersonDocumentWhereInput[] = [{ deletedAt: null }];

    if (query.documentType) {
      and.push({ type: query.documentType });
    }
    if (query.documentStatus) {
      and.push({ status: query.documentStatus });
    }
    if (query.documentIssuingCountryCode) {
      and.push({ issuingCountryCode: query.documentIssuingCountryCode });
    }

    const expiresOn = this.toDocumentExpiresOnFilter(query);
    if (expiresOn) {
      and.push({ expiresOn });
    }

    return and.length > 1 ? { AND: and } : null;
  }

  private toDocumentExpiresOnFilter(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.DateTimeNullableFilter<"PersonDocument"> | null {
    if (query.documentExpiry === "missing") {
      return null;
    }

    const expiresOn: Prisma.DateTimeNullableFilter<"PersonDocument"> = {};
    const today = dateOnlyToday();
    const soon = addDateOnlyDays(today, 30);

    if (query.documentExpiry === "expired") {
      expiresOn.lt = toRequiredDateOnlyDate(today);
    }
    if (query.documentExpiry === "expiresSoon") {
      expiresOn.gte = toRequiredDateOnlyDate(today);
      expiresOn.lte = toRequiredDateOnlyDate(soon);
    }
    if (query.documentExpiry === "valid") {
      expiresOn.gt = toRequiredDateOnlyDate(soon);
    }
    if (query.documentExpiresFrom) {
      expiresOn.gte = toRequiredDateOnlyDate(query.documentExpiresFrom);
    }
    if (query.documentExpiresTo) {
      expiresOn.lte = toRequiredDateOnlyDate(query.documentExpiresTo);
    }

    return Object.keys(expiresOn).length > 0 ? expiresOn : null;
  }

  private toSearchCte(query: v1.persons.ListPersonsQuery): PrismaRuntime.Sql {
    const term = query.search!;
    const pattern = `%${term.toLowerCase()}%`;
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
    const documentText = PrismaRuntime.sql`lower(
      coalesce(d.type, '') || ' ' ||
      coalesce(d.series, '') || ' ' ||
      coalesce(d.number, '') || ' ' ||
      coalesce(d.cnp, '') || ' ' ||
      coalesce(d."issuingCountryCode", '') || ' ' ||
      coalesce(d."issuedBy", '') || ' ' ||
      coalesce(d.status, '') || ' ' ||
      coalesce(d.notes, '')
    )`;

    return PrismaRuntime.sql`
      WITH base AS (
        SELECT
          p.id,
          p.email,
          p."lastName",
          p."firstName",
          p."createdAt",
          p."updatedAt",
          ${personText} AS person_text
        FROM "Person" p
        WHERE ${this.toPersonFilterSql(query)}
      ),
      scored AS (
        SELECT
          b.id,
          b.email,
          b."lastName",
          b."firstName",
          b."createdAt",
          b."updatedAt",
          greatest(
            word_similarity(${term}, b.person_text),
            coalesce(max(word_similarity(${term}, ${documentText})), 0)
          ) AS score
        FROM base b
        LEFT JOIN "PersonDocument" d
          ON d."personId" = b.id
          AND d."deletedAt" IS NULL
        WHERE ${this.toSearchPredicateSql(term, pattern, documentText)}
        GROUP BY
          b.id,
          b.email,
          b."lastName",
          b."firstName",
          b."createdAt",
          b."updatedAt",
          b.person_text
      )
    `;
  }

  private toPersonFilterSql(
    query: v1.persons.ListPersonsQuery,
  ): PrismaRuntime.Sql {
    const clauses: PrismaRuntime.Sql[] = [];

    switch (this.resolveRecordStatus(query)) {
      case "active":
        clauses.push(PrismaRuntime.sql`p."deletedAt" IS NULL`);
        break;
      case "deleted":
        clauses.push(PrismaRuntime.sql`p."deletedAt" IS NOT NULL`);
        break;
      case "all":
        break;
    }

    if (query.countryCode) {
      clauses.push(PrismaRuntime.sql`p."countryCode" = ${query.countryCode}`);
    }

    clauses.push(...this.toDocumentFilterSql(query));

    return sqlAnd(clauses);
  }

  private toDocumentFilterSql(
    query: v1.persons.ListPersonsQuery,
  ): PrismaRuntime.Sql[] {
    const clauses: PrismaRuntime.Sql[] = [];
    const documentClauses = this.toMatchingDocumentFilterSql(query, "fd");

    if (query.documentExpiry === "missing") {
      clauses.push(PrismaRuntime.sql`
        NOT EXISTS (
          SELECT 1
          FROM "PersonDocument" md
          WHERE md."personId" = p.id
          AND md."deletedAt" IS NULL
        )
      `);
    }

    if (documentClauses.length > 1) {
      clauses.push(PrismaRuntime.sql`
        EXISTS (
          SELECT 1
          FROM "PersonDocument" fd
          WHERE fd."personId" = p.id
          AND ${sqlAnd(documentClauses)}
        )
      `);
    }

    return clauses;
  }

  private toMatchingDocumentFilterSql(
    query: v1.persons.ListPersonsQuery,
    alias: "fd",
  ): PrismaRuntime.Sql[] {
    const table = PrismaRuntime.raw(alias);
    const clauses: PrismaRuntime.Sql[] = [
      PrismaRuntime.sql`${table}."deletedAt" IS NULL`,
    ];

    if (query.documentType) {
      clauses.push(PrismaRuntime.sql`${table}.type = ${query.documentType}`);
    }
    if (query.documentStatus) {
      clauses.push(
        PrismaRuntime.sql`${table}.status = ${query.documentStatus}`,
      );
    }
    if (query.documentIssuingCountryCode) {
      clauses.push(
        PrismaRuntime.sql`${table}."issuingCountryCode" = ${query.documentIssuingCountryCode}`,
      );
    }

    clauses.push(...this.toDocumentExpiresOnSql(query, alias));

    return clauses;
  }

  private toDocumentExpiresOnSql(
    query: v1.persons.ListPersonsQuery,
    alias: "fd",
  ): PrismaRuntime.Sql[] {
    if (query.documentExpiry === "missing") {
      return [];
    }

    const table = PrismaRuntime.raw(alias);
    const clauses: PrismaRuntime.Sql[] = [];
    const today = dateOnlyToday();
    const soon = addDateOnlyDays(today, 30);

    if (query.documentExpiry === "expired") {
      clauses.push(PrismaRuntime.sql`${table}."expiresOn" < ${today}::date`);
    }
    if (query.documentExpiry === "expiresSoon") {
      clauses.push(PrismaRuntime.sql`${table}."expiresOn" >= ${today}::date`);
      clauses.push(PrismaRuntime.sql`${table}."expiresOn" <= ${soon}::date`);
    }
    if (query.documentExpiry === "valid") {
      clauses.push(PrismaRuntime.sql`${table}."expiresOn" > ${soon}::date`);
    }
    if (query.documentExpiresFrom) {
      clauses.push(
        PrismaRuntime.sql`${table}."expiresOn" >= ${query.documentExpiresFrom}::date`,
      );
    }
    if (query.documentExpiresTo) {
      clauses.push(
        PrismaRuntime.sql`${table}."expiresOn" <= ${query.documentExpiresTo}::date`,
      );
    }

    return clauses;
  }

  private toSearchPredicateSql(
    term: string,
    pattern: string,
    documentText: PrismaRuntime.Sql,
  ): PrismaRuntime.Sql {
    const clauses = [
      PrismaRuntime.sql`b.person_text ILIKE ${pattern}`,
      PrismaRuntime.sql`${documentText} ILIKE ${pattern}`,
    ];

    if (term.length >= 3) {
      clauses.push(PrismaRuntime.sql`${term} <% b.person_text`);
      clauses.push(PrismaRuntime.sql`${term} <% ${documentText}`);
    }

    return PrismaRuntime.sql`(${PrismaRuntime.join(clauses, " OR ")})`;
  }

  private resolveRecordStatus(
    query: v1.persons.ListPersonsQuery,
  ): v1.persons.PersonRecordStatus {
    return query.recordStatus ?? (query.includeDeleted ? "all" : "active");
  }

  private toPersonOrderBy(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.PersonOrderByWithRelationInput[] {
    switch (this.resolveListSort(query)) {
      case "nameDesc":
        return [{ lastName: "desc" }, { firstName: "desc" }, { id: "asc" }];
      case "createdAtDesc":
        return [{ createdAt: "desc" }, { id: "asc" }];
      case "createdAtAsc":
        return [{ createdAt: "asc" }, { id: "asc" }];
      case "updatedAtDesc":
        return [{ updatedAt: "desc" }, { id: "asc" }];
      case "updatedAtAsc":
        return [{ updatedAt: "asc" }, { id: "asc" }];
      case "emailAsc":
        return [{ email: "asc" }, { id: "asc" }];
      case "emailDesc":
        return [{ email: "desc" }, { id: "asc" }];
      case "relevance":
      case "nameAsc":
        return [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
    }
  }

  private toSearchOrderBy(
    query: v1.persons.ListPersonsQuery,
  ): PrismaRuntime.Sql {
    switch (this.resolveListSort(query)) {
      case "nameAsc":
        return PrismaRuntime.sql`"lastName" ASC, "firstName" ASC, score DESC, id ASC`;
      case "nameDesc":
        return PrismaRuntime.sql`"lastName" DESC, "firstName" DESC, score DESC, id ASC`;
      case "createdAtDesc":
        return PrismaRuntime.sql`"createdAt" DESC, score DESC, id ASC`;
      case "createdAtAsc":
        return PrismaRuntime.sql`"createdAt" ASC, score DESC, id ASC`;
      case "updatedAtDesc":
        return PrismaRuntime.sql`"updatedAt" DESC, score DESC, id ASC`;
      case "updatedAtAsc":
        return PrismaRuntime.sql`"updatedAt" ASC, score DESC, id ASC`;
      case "emailAsc":
        return PrismaRuntime.sql`email ASC, score DESC, id ASC`;
      case "emailDesc":
        return PrismaRuntime.sql`email DESC, score DESC, id ASC`;
      case "relevance":
        return PrismaRuntime.sql`score DESC, "lastName" ASC, "firstName" ASC, id ASC`;
    }
  }

  private resolveListSort(
    query: v1.persons.ListPersonsQuery,
  ): v1.persons.PersonListSort {
    if (query.sort === "relevance" && !query.search) {
      return "nameAsc";
    }

    return query.sort ?? (query.search ? "relevance" : "nameAsc");
  }

  private async ensureActivePerson(id: string): Promise<void> {
    const count = await this.prisma.person.count({
      where: { id, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException("Person not found");
    }
  }

  private async ensureDocumentTypeAvailable(
    personId: string,
    type: v1.persons.PersonDocumentType,
    exceptDocumentId?: string,
  ): Promise<void> {
    const isIdentityDocument = v1.persons.isPersonIdentityDocumentType(type);
    const existing = await this.prisma.personDocument.findFirst({
      where: {
        personId,
        ...(isIdentityDocument
          ? { type: { in: [...v1.persons.PERSON_IDENTITY_DOCUMENT_TYPES] } }
          : { type }),
        deletedAt: null,
        ...(exceptDocumentId ? { id: { not: exceptDocumentId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        isIdentityDocument
          ? "Person identity document already exists"
          : "Person document type already exists",
      );
    }
  }

  private personInclude() {
    return {
      documents: {
        where: { deletedAt: null },
        orderBy: this.documentOrderBy(),
      },
    } satisfies Prisma.PersonInclude;
  }

  private documentOrderBy(): Prisma.PersonDocumentOrderByWithRelationInput[] {
    return [{ type: "asc" }, { createdAt: "asc" }, { id: "asc" }];
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (isPersonDocumentTypeConflict(error)) {
        throw new ConflictException("Person document type already exists");
      }
      if (isPersonDocumentIdentityConflict(error)) {
        throw new ConflictException("Person identity document already exists");
      }
      throw new ConflictException("Person email or phone already exists");
    }
    throw error;
  }
}

function sqlAnd(clauses: PrismaRuntime.Sql[]): PrismaRuntime.Sql {
  if (clauses.length === 0) {
    return PrismaRuntime.sql`TRUE`;
  }

  return PrismaRuntime.sql`${PrismaRuntime.join(clauses, " AND ")}`;
}

function dateOnlyToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDateOnlyDays(value: string, days: number): string {
  const date = toRequiredDateOnlyDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toRequiredDateOnlyDate(value: string): Date {
  const date = toDateOnlyDate(value);
  if (!date) {
    throw new Error("Expected a validated date-only string.");
  }
  return date;
}

function isPersonDocumentTypeConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  const target = error.meta?.target;

  if (typeof target === "string") {
    return target.includes("person_document_active_type_unique");
  }

  if (Array.isArray(target)) {
    return target.includes("personId") && target.includes("type");
  }

  return false;
}

function isPersonDocumentIdentityConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  const target = error.meta?.target;

  if (typeof target === "string") {
    return target.includes("person_document_active_identity_unique");
  }

  if (Array.isArray(target)) {
    return target.length === 1 && target.includes("personId");
  }

  return false;
}
