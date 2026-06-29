import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import type { AuthPrincipal } from "../auth/auth.types";
import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";
import type { RequestMetadata } from "../common/http/request-metadata";
import type { StoredImage } from "../image-storage/image-storage.types";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type {
  AuditEvent,
  PersonDocument,
  Prisma,
} from "../generated/prisma/client";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  PersonDocumentPhotoWithAsset,
  PersonWithDocuments,
} from "./persons.mapper";

interface SearchIdRow {
  id: string;
}

interface SearchCountRow {
  total: number;
}

const PERSON_AUDIT_TARGET_TYPE = "person";
const PERSON_AUDIT_EVENT_LIMIT = 50;
const REDACTED_VALUE = "[redacted]";
const SET_VALUE = "[set]";
const PERSON_EMAIL_CONFLICT_CODE = "PERSON_EMAIL_CONFLICT";
const PERSON_PHONE_CONFLICT_CODE = "PERSON_PHONE_CONFLICT";

type PersonAuditContext = RequestMetadata & {
  actor: AuthPrincipal;
};

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: v1.persons.CreatePersonInput,
    context: PersonAuditContext,
  ): Promise<PersonWithDocuments> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.person.create({
          data: this.toCreateData(input),
          include: this.personInclude(),
        });

        await this.recordPersonAudit(tx, {
          type: AuditEventType.PERSON_CREATED,
          personId: created.id,
          context,
          changes: this.personCreateChanges(created),
        });

        for (const document of created.documents) {
          await this.recordPersonAudit(tx, {
            type: AuditEventType.PERSON_DOCUMENT_CREATED,
            personId: created.id,
            context,
            document,
            changes: this.documentCreateChanges(document),
          });
        }

        return created;
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

  async listAuditEvents(
    personId: string,
  ): Promise<v1.persons.PersonAuditEvent[]> {
    await this.ensureActivePerson(personId);

    const rows = await this.prisma.auditEvent.findMany({
      where: {
        targetType: PERSON_AUDIT_TARGET_TYPE,
        targetId: personId,
        type: { in: [...v1.persons.PERSON_AUDIT_EVENT_TYPES] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PERSON_AUDIT_EVENT_LIMIT,
    });

    return rows.map(toPersonAuditEvent);
  }

  async update(
    id: string,
    input: v1.persons.UpdatePersonInput,
    context: PersonAuditContext,
  ): Promise<PersonWithDocuments> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.person.findFirst({
          where: { id, deletedAt: null },
          include: this.personInclude(),
        });
        if (!existing) {
          throw new NotFoundException("Person not found");
        }

        const updated = await tx.person.update({
          where: { id },
          data: this.toUpdateData(input),
          include: this.personInclude(),
        });

        await this.recordPersonAudit(tx, {
          type: AuditEventType.PERSON_UPDATED,
          personId: id,
          context,
          changes: this.personUpdateChanges(existing, updated),
        });

        return updated;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async softDelete(id: string, context: PersonAuditContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.person.findFirst({
        where: { id, deletedAt: null },
        include: this.personInclude(),
      });

      if (!existing) {
        throw new NotFoundException("Person not found");
      }

      await tx.person.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.recordPersonAudit(tx, {
        type: AuditEventType.PERSON_DELETED,
        personId: id,
        context,
        changes: [],
      });
    });
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
    context: PersonAuditContext,
  ): Promise<PersonDocument> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureActivePerson(personId, tx);
        await this.ensureDocumentTypeAvailable(
          personId,
          input.type,
          undefined,
          tx,
        );

        const document = await tx.personDocument.create({
          data: {
            person: { connect: { id: personId } },
            ...this.toDocumentCreateData(input),
          },
        });

        await this.recordPersonAudit(tx, {
          type: AuditEventType.PERSON_DOCUMENT_CREATED,
          personId,
          context,
          document,
          changes: this.documentCreateChanges(document),
        });

        return document;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findActiveDocument(
    personId: string,
    documentId: string,
  ): Promise<PersonDocument | null> {
    return this.findActiveDocumentWithClient(this.prisma, personId, documentId);
  }

  private findActiveDocumentWithClient(
    db: PrismaClientLike,
    personId: string,
    documentId: string,
  ): Promise<PersonDocument | null> {
    return db.personDocument.findFirst({
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
    context: PersonAuditContext,
  ): Promise<PersonDocument> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findActiveDocumentWithClient(
          tx,
          personId,
          documentId,
        );
        if (!existing) {
          throw new NotFoundException("Person document not found");
        }

        if (input.type && input.type !== existing.type) {
          await this.ensureDocumentTypeAvailable(
            personId,
            input.type,
            documentId,
            tx,
          );
        }

        const updated = await tx.personDocument.update({
          where: { id: documentId },
          data: this.toDocumentUpdateData(input),
        });

        await this.recordPersonAudit(tx, {
          type: AuditEventType.PERSON_DOCUMENT_UPDATED,
          personId,
          context,
          document: updated,
          changes: this.documentUpdateChanges(existing, updated),
        });

        return updated;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async replaceDocument(
    personId: string,
    documentId: string,
    input: v1.persons.CreatePersonDocumentInput,
    context: PersonAuditContext,
  ): Promise<PersonDocument> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findActiveDocumentWithClient(
          tx,
          personId,
          documentId,
        );
        if (!existing) {
          throw new NotFoundException("Person document not found");
        }

        await this.ensureDocumentTypeAvailable(
          personId,
          input.type,
          documentId,
          tx,
        );

        const deletedAt = new Date();
        await tx.personDocument.update({
          where: { id: documentId },
          data: { deletedAt },
        });

        const replacement = await tx.personDocument.create({
          data: {
            person: { connect: { id: personId } },
            ...this.toDocumentCreateData(input),
          },
        });

        await this.recordPersonAudit(tx, {
          type: AuditEventType.PERSON_DOCUMENT_REPLACED,
          personId,
          context,
          document: replacement,
          replacement: {
            oldDocument: this.documentSummary(existing),
            newDocument: this.documentSummary(replacement),
          },
          changes: this.documentReplacementChanges(existing, replacement),
        });

        return replacement;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async softDeleteDocument(
    personId: string,
    documentId: string,
    context: PersonAuditContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.findActiveDocumentWithClient(
        tx,
        personId,
        documentId,
      );
      if (!existing) {
        throw new NotFoundException("Person document not found");
      }

      await tx.personDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });

      await this.recordPersonAudit(tx, {
        type: AuditEventType.PERSON_DOCUMENT_DELETED,
        personId,
        context,
        document: existing,
        changes: [],
      });
    });
  }

  async listDocumentPhotos(
    personId: string,
    documentId: string,
  ): Promise<PersonDocumentPhotoWithAsset[]> {
    await this.ensureActiveDocument(personId, documentId);

    return this.prisma.personDocumentPhoto.findMany({
      where: {
        personDocumentId: documentId,
        deletedAt: null,
        asset: { deletedAt: null },
      },
      include: { asset: true },
      orderBy: this.photoOrderBy(),
    });
  }

  async upsertDocumentPhoto(
    personId: string,
    documentId: string,
    slot: string,
    file: Express.Multer.File,
    uploadedByUserId: string,
  ): Promise<PersonDocumentPhotoWithAsset> {
    const normalizedSlot = this.requireDocumentPhotoSlot(slot);
    await this.ensureActiveDocument(personId, documentId);
    this.assertBufferedUpload(file);

    let stored: StoredImage | null = null;
    let replacedStorageKeys: string[] = [];

    try {
      stored = await this.imageStorage.storeImage({
        buffer: file.buffer,
        contentType: file.mimetype,
        byteSize: file.size,
      });
      const result = await this.replaceDocumentPhotoWithStoredImage(
        documentId,
        normalizedSlot,
        stored,
        uploadedByUserId,
      );
      replacedStorageKeys = result.replacedStorageKeys;

      await Promise.all(
        replacedStorageKeys.map((storageKey) =>
          this.deleteImageBestEffort(storageKey),
        ),
      );

      return result.photo;
    } catch (error) {
      if (stored) {
        await this.deleteImageBestEffort(stored.storageKey);
      }
      this.handleWriteError(error);
    }
  }

  async createDocumentPhotoUploadUrl(
    personId: string,
    documentId: string,
    slot: string,
    input: v1.persons.CreatePersonDocumentPhotoUploadUrlInput,
    uploadedByUserId: string,
  ): Promise<v1.persons.PersonDocumentPhotoUploadUrl> {
    const normalizedSlot = this.requireDocumentPhotoSlot(slot);
    await this.ensureActiveDocument(personId, documentId);

    const upload = await this.imageStorage.createPresignedUpload({
      ...input,
      scope: this.documentPhotoUploadScope(
        personId,
        documentId,
        normalizedSlot,
        uploadedByUserId,
      ),
    });

    return {
      ...upload,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  async completeDocumentPhotoUpload(
    personId: string,
    documentId: string,
    slot: string,
    input: v1.persons.CompletePersonDocumentPhotoUploadInput,
    uploadedByUserId: string,
  ): Promise<PersonDocumentPhotoWithAsset> {
    const normalizedSlot = this.requireDocumentPhotoSlot(slot);
    await this.ensureActiveDocument(personId, documentId);

    let stored: StoredImage | null = null;
    try {
      stored = await this.imageStorage.completePresignedUpload(
        input.uploadToken,
        this.documentPhotoUploadScope(
          personId,
          documentId,
          normalizedSlot,
          uploadedByUserId,
        ),
      );
      const result = await this.replaceDocumentPhotoWithStoredImage(
        documentId,
        normalizedSlot,
        stored,
        uploadedByUserId,
      );

      await Promise.all(
        result.replacedStorageKeys.map((storageKey) =>
          this.deleteImageBestEffort(storageKey),
        ),
      );

      return result.photo;
    } catch (error) {
      if (stored) {
        await this.deleteImageBestEffort(stored.storageKey);
      }
      this.handleWriteError(error);
    }
  }

  async getDocumentPhotoContent(
    personId: string,
    documentId: string,
    slot: string,
  ): Promise<{
    body: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
  }> {
    const photo = await this.findActiveDocumentPhoto(
      personId,
      documentId,
      slot,
    );
    if (!photo) {
      throw new NotFoundException("Person document photo not found");
    }

    const image = await this.imageStorage.readImage(photo.asset.storageKey);
    return {
      body: image.body,
      contentType: image.contentType ?? photo.asset.contentType,
      contentLength: image.contentLength,
    };
  }

  async softDeleteDocumentPhoto(
    personId: string,
    documentId: string,
    slot: string,
  ): Promise<void> {
    const photo = await this.findActiveDocumentPhoto(
      personId,
      documentId,
      slot,
    );
    if (!photo) {
      throw new NotFoundException("Person document photo not found");
    }

    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.personDocumentPhoto.update({
        where: { id: photo.id },
        data: { deletedAt },
      }),
      this.prisma.mediaAsset.update({
        where: { id: photo.assetId },
        data: { deletedAt },
      }),
    ]);

    await this.deleteImageBestEffort(photo.asset.storageKey);
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
      status: input.status ?? "verified",
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

  private async recordPersonAudit(
    tx: Prisma.TransactionClient,
    input: {
      type: AuditEventType;
      personId: string;
      context: PersonAuditContext;
      document?: PersonDocument;
      replacement?: v1.persons.PersonAuditReplacement;
      changes: v1.persons.PersonAuditFieldChange[];
    },
  ): Promise<void> {
    const meta = {
      actor: this.auditActor(input.context),
      document: input.document ? this.documentSummary(input.document) : null,
      replacement: input.replacement ?? null,
      changes: input.changes,
    } satisfies Prisma.InputJsonObject;

    await this.audit.recordRequired(tx, {
      type: input.type,
      userId: input.context.actor.id,
      targetType: PERSON_AUDIT_TARGET_TYPE,
      targetId: input.personId,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      meta,
    });
  }

  private auditActor(context: PersonAuditContext): v1.persons.PersonAuditActor {
    return {
      kind: "user",
      userId: context.actor.id,
      email: context.actor.email,
      name: null,
    };
  }

  private personCreateChanges(
    person: PersonWithDocuments,
  ): v1.persons.PersonAuditFieldChange[] {
    return compactChanges(
      personAuditValues(person).map(({ field, value }) =>
        createChange(field, value),
      ),
    );
  }

  private personUpdateChanges(
    existing: PersonWithDocuments,
    updated: PersonWithDocuments,
  ): v1.persons.PersonAuditFieldChange[] {
    return diffAuditValues(
      personAuditValues(existing),
      personAuditValues(updated),
    );
  }

  private documentCreateChanges(
    document: PersonDocument,
  ): v1.persons.PersonAuditFieldChange[] {
    return compactChanges(
      documentAuditValues(document).map(({ field, value }) =>
        createChange(field, value),
      ),
    );
  }

  private documentUpdateChanges(
    existing: PersonDocument,
    updated: PersonDocument,
  ): v1.persons.PersonAuditFieldChange[] {
    return diffAuditValues(
      documentAuditValues(existing),
      documentAuditValues(updated),
    );
  }

  private documentReplacementChanges(
    existing: PersonDocument,
    replacement: PersonDocument,
  ): v1.persons.PersonAuditFieldChange[] {
    return this.documentUpdateChanges(existing, replacement);
  }

  private documentSummary(
    document: PersonDocument,
  ): v1.persons.PersonAuditDocumentSummary {
    return {
      id: document.id,
      type: document.type as v1.persons.PersonDocumentType,
      status: document.status as v1.persons.PersonDocumentStatus,
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

  private async ensureActivePerson(
    id: string,
    db: PrismaClientLike = this.prisma,
  ): Promise<void> {
    const count = await db.person.count({
      where: { id, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException("Person not found");
    }
  }

  private async ensureActiveDocument(
    personId: string,
    documentId: string,
    db: PrismaClientLike = this.prisma,
  ): Promise<void> {
    const count = await db.personDocument.count({
      where: {
        id: documentId,
        personId,
        deletedAt: null,
        person: { deletedAt: null },
      },
    });
    if (count === 0) {
      throw new NotFoundException("Person document not found");
    }
  }

  private requireDocumentPhotoSlot(
    slot: string,
  ): v1.persons.PersonDocumentPhotoSlot {
    const parsed = v1.persons.personDocumentPhotoSlotSchema.safeParse(slot);
    if (!parsed.success) {
      throw new BadRequestException("Invalid person document photo slot");
    }
    return parsed.data;
  }

  private assertBufferedUpload(file: Express.Multer.File): void {
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException("Image file is required");
    }
  }

  private async replaceDocumentPhotoWithStoredImage(
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    storedImage: StoredImage,
    uploadedByUserId: string,
  ): Promise<{
    photo: PersonDocumentPhotoWithAsset;
    replacedStorageKeys: string[];
  }> {
    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const replaced = await tx.personDocumentPhoto.findMany({
        where: {
          personDocumentId: documentId,
          slot,
          deletedAt: null,
        },
        include: { asset: true },
      });
      const replacedAssetIds = replaced.map((row) => row.assetId);
      const replacedStorageKeys = replaced.map((row) => row.asset.storageKey);

      if (replaced.length > 0) {
        await tx.personDocumentPhoto.updateMany({
          where: {
            id: { in: replaced.map((row) => row.id) },
          },
          data: { deletedAt },
        });
        await tx.mediaAsset.updateMany({
          where: { id: { in: replacedAssetIds } },
          data: { deletedAt },
        });
      }

      const asset = await tx.mediaAsset.create({
        data: {
          provider: storedImage.provider,
          bucket: storedImage.bucket,
          storageKey: storedImage.storageKey,
          contentType: storedImage.contentType,
          byteSize: storedImage.byteSize,
          checksumSha256: storedImage.checksumSha256,
          uploadedByUser: { connect: { id: uploadedByUserId } },
        },
      });

      const photo = await tx.personDocumentPhoto.create({
        data: {
          personDocument: { connect: { id: documentId } },
          asset: { connect: { id: asset.id } },
          slot,
        },
        include: { asset: true },
      });

      return { photo, replacedStorageKeys };
    });
  }

  private async findActiveDocumentPhoto(
    personId: string,
    documentId: string,
    slot: string,
  ): Promise<PersonDocumentPhotoWithAsset | null> {
    const normalizedSlot = this.requireDocumentPhotoSlot(slot);

    return this.prisma.personDocumentPhoto.findFirst({
      where: {
        personDocumentId: documentId,
        slot: normalizedSlot,
        deletedAt: null,
        asset: { deletedAt: null },
        personDocument: {
          personId,
          deletedAt: null,
          person: { deletedAt: null },
        },
      },
      include: { asset: true },
    });
  }

  private documentPhotoUploadScope(
    personId: string,
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    uploadedByUserId: string,
  ): string {
    return `person-document-photo:${personId}:${documentId}:${slot}:${uploadedByUserId}`;
  }

  private async deleteImageBestEffort(storageKey: string): Promise<void> {
    try {
      await this.imageStorage.deleteImage(storageKey);
    } catch {
      // The database state is authoritative. Physical cleanup is retried by
      // future maintenance tooling if S3 temporarily rejects deletion.
    }
  }

  private async ensureDocumentTypeAvailable(
    personId: string,
    type: v1.persons.PersonDocumentType,
    exceptDocumentId?: string,
    db: PrismaClientLike = this.prisma,
  ): Promise<void> {
    const isIdentityDocument = v1.persons.isPersonIdentityDocumentType(type);
    const existing = await db.personDocument.findFirst({
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

  private photoOrderBy(): Prisma.PersonDocumentPhotoOrderByWithRelationInput[] {
    return [{ slot: "asc" }, { createdAt: "asc" }, { id: "asc" }];
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
      if (isPersonDocumentPhotoSlotConflict(error)) {
        throw new ConflictException(
          "Person document photo slot already exists",
        );
      }
      if (isMediaAssetStorageKeyConflict(error)) {
        throw new BadRequestException("Image upload token was already used");
      }
      if (isPersonEmailConflict(error)) {
        throw new ConflictException({
          code: PERSON_EMAIL_CONFLICT_CODE,
          message: "Email already exists",
          details: { field: "email" },
        });
      }
      if (isPersonPhoneConflict(error)) {
        throw new ConflictException({
          code: PERSON_PHONE_CONFLICT_CODE,
          message: "Phone already exists",
          details: { field: "phone" },
        });
      }
      throw new ConflictException("Person email or phone already exists");
    }
    throw error;
  }
}

function personAuditValues(person: PersonWithDocuments): AuditValue[] {
  return [
    { field: "email", value: person.email },
    { field: "phone", value: person.phone },
    { field: "firstName", value: person.firstName },
    { field: "lastName", value: person.lastName },
    {
      field: "dateOfBirth",
      value: toDateOnlyString(person.dateOfBirth),
    },
    { field: "addressLine1", value: person.addressLine1 },
    { field: "addressLine2", value: person.addressLine2 },
    { field: "city", value: person.city },
    { field: "region", value: person.region },
    { field: "postalCode", value: person.postalCode },
    { field: "countryCode", value: person.countryCode },
    { field: "notes", value: person.notes ? SET_VALUE : null },
  ];
}

function documentAuditValues(document: PersonDocument): AuditValue[] {
  return [
    { field: "document.type", value: document.type },
    { field: "document.series", value: document.series },
    {
      field: "document.number",
      value: maskSensitiveAuditValue(document.number),
    },
    { field: "document.cnp", value: maskSensitiveAuditValue(document.cnp) },
    {
      field: "document.issuingCountryCode",
      value: document.issuingCountryCode,
    },
    { field: "document.issuedBy", value: document.issuedBy },
    { field: "document.issuedOn", value: toDateOnlyString(document.issuedOn) },
    {
      field: "document.expiresOn",
      value: toDateOnlyString(document.expiresOn),
    },
    { field: "document.status", value: document.status },
    { field: "document.notes", value: document.notes ? SET_VALUE : null },
  ];
}

function createChange(
  field: string,
  value: string | null,
): v1.persons.PersonAuditFieldChange | null {
  if (value === null) {
    return null;
  }

  return { field, oldValue: null, newValue: value };
}

function diffAuditValues(
  oldValues: AuditValue[],
  newValues: AuditValue[],
): v1.persons.PersonAuditFieldChange[] {
  const oldByField = new Map(oldValues.map((item) => [item.field, item.value]));

  return compactChanges(
    newValues.map(({ field, value }) => {
      const oldValue = oldByField.get(field) ?? null;
      return oldValue === value ? null : { field, oldValue, newValue: value };
    }),
  );
}

function compactChanges(
  changes: Array<v1.persons.PersonAuditFieldChange | null>,
): v1.persons.PersonAuditFieldChange[] {
  return changes.filter(
    (change): change is v1.persons.PersonAuditFieldChange => change !== null,
  );
}

function maskSensitiveAuditValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const visibleLength = Math.min(4, value.length);
  return `${REDACTED_VALUE} ${value.slice(-visibleLength)}`;
}

function toPersonAuditEvent(row: AuditEvent): v1.persons.PersonAuditEvent {
  const meta = jsonObject(row.meta);
  const actor = v1.persons.personAuditActorSchema.safeParse(meta.actor);
  const document = v1.persons.personAuditDocumentSummarySchema
    .nullable()
    .safeParse(meta.document ?? null);
  const replacement = v1.persons.personAuditReplacementSchema
    .nullable()
    .safeParse(meta.replacement ?? null);
  const changes = v1.persons.personAuditFieldChangeSchema
    .array()
    .safeParse(meta.changes);

  return {
    id: row.id,
    type: v1.persons.personAuditEventTypeSchema.parse(row.type),
    personId: row.targetId ?? "",
    actor: actor.success
      ? actor.data
      : { kind: "system", userId: null, email: null, name: null },
    document: document.success ? document.data : null,
    replacement: replacement.success ? replacement.data : null,
    changes: changes.success ? changes.data : [],
    createdAt: row.createdAt.toISOString(),
  };
}

function jsonObject(
  value: PrismaRuntime.JsonValue | null,
): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

interface AuditValue {
  field: string;
  value: string | null;
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

function isPersonEmailConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  return isUniqueTarget(error, "email");
}

function isPersonPhoneConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  return isUniqueTarget(error, "phone");
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

function isPersonDocumentPhotoSlotConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  const target = error.meta?.target;

  if (typeof target === "string") {
    return target.includes("person_document_photo_active_slot_unique");
  }

  if (Array.isArray(target)) {
    return target.includes("personDocumentId") && target.includes("slot");
  }

  return false;
}

function isUniqueTarget(
  error: PrismaRuntime.PrismaClientKnownRequestError,
  field: string,
): boolean {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.some(
      (item): item is string =>
        typeof item === "string" && item.includes(field),
    );
  }

  if (typeof target === "string" && target.includes(field)) {
    return true;
  }

  return error.message.includes(`\`${field}\``);
}

function isMediaAssetStorageKeyConflict(
  error: PrismaRuntime.PrismaClientKnownRequestError,
): boolean {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("storageKey");
  }
  if (typeof target === "string") {
    return target.includes("storageKey");
  }

  return false;
}
