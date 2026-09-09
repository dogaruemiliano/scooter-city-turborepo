import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toFinanceBookMember } from "../finance.mapper";
import { PrismaFinanceRepository } from "../infrastructure/prisma-finance.repository";

@Injectable()
export class CompanyAssociatesService {
  constructor(private readonly repository: PrismaFinanceRepository) {}

  async get(): Promise<v1.finance.CompanyAssociates> {
    const record = await this.repository.getCompanyAssociates();
    return toResponse(record);
  }

  async update(
    input: v1.finance.UpdateCompanyAssociatesInput,
  ): Promise<v1.finance.CompanyAssociates> {
    const record = await this.repository.updateCompanyAssociates(input);
    return toResponse(record);
  }
}

function toResponse(
  record: Awaited<ReturnType<PrismaFinanceRepository["getCompanyAssociates"]>>,
): v1.finance.CompanyAssociates {
  return {
    items: record.members.map(toFinanceBookMember),
    managingOwnerId: record.managingOwnerId,
    canManage: true,
  };
}
