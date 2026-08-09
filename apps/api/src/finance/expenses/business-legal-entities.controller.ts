import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { RequireRoles } from "../../common/decorators/roles.decorator";
import { BusinessLegalEntitiesService } from "./business-legal-entities.service";
import {
  BusinessLegalEntity,
  BusinessLegalEntityList,
  BusinessOwner,
  BusinessOwnerList,
  CreateBusinessLegalEntityInput,
  CreateBusinessOwnerInput,
  CreateVatRegistrationPeriodInput,
  ListExpenseOptionsQuery,
  UpdateBusinessLegalEntityInput,
  UpdateBusinessOwnerInput,
  UpdateVatRegistrationPeriodInput,
  VatRegistrationPeriod,
  VatRegistrationPeriodList,
} from "./expense.dto";

@ApiTags("finance-expense-configuration")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/business-legal-entities", version: "1" })
export class BusinessLegalEntitiesController {
  constructor(private readonly entities: BusinessLegalEntitiesService) {}

  @Post()
  @ApiOperation({ operationId: "BusinessLegalEntitiesController_create_v1" })
  @ZodResponse({ status: HttpStatus.CREATED, type: BusinessLegalEntity })
  create(
    @Body() input: CreateBusinessLegalEntityInput,
  ): Promise<v1.finance.BusinessLegalEntity> {
    return this.entities.create(input);
  }

  @Get()
  @ApiOperation({ operationId: "BusinessLegalEntitiesController_list_v1" })
  @ZodResponse({ type: BusinessLegalEntityList })
  list(
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.BusinessLegalEntityList> {
    return this.entities.list(query.includeInactive);
  }

  @Get(":id")
  @ApiOperation({ operationId: "BusinessLegalEntitiesController_get_v1" })
  @ZodResponse({ type: BusinessLegalEntity })
  get(@Param("id") id: string): Promise<v1.finance.BusinessLegalEntity> {
    return this.entities.get(id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "BusinessLegalEntitiesController_update_v1" })
  @ZodResponse({ type: BusinessLegalEntity })
  update(
    @Param("id") id: string,
    @Body() input: UpdateBusinessLegalEntityInput,
  ): Promise<v1.finance.BusinessLegalEntity> {
    return this.entities.update(id, input);
  }

  @Post(":id/owners")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_createOwner_v1",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: BusinessOwner })
  createOwner(
    @Param("id") id: string,
    @Body() input: CreateBusinessOwnerInput,
  ): Promise<v1.finance.BusinessOwner> {
    return this.entities.createOwner(id, input);
  }

  @Get(":id/owners")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_listOwners_v1",
  })
  @ZodResponse({ type: BusinessOwnerList })
  listOwners(
    @Param("id") id: string,
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.BusinessOwnerList> {
    return this.entities.listOwners(id, query.on, query.includeInactive);
  }

  @Patch(":id/owners/:ownerId")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_updateOwner_v1",
  })
  @ZodResponse({ type: BusinessOwner })
  updateOwner(
    @Param("id") id: string,
    @Param("ownerId") ownerId: string,
    @Body() input: UpdateBusinessOwnerInput,
  ): Promise<v1.finance.BusinessOwner> {
    return this.entities.updateOwner(id, ownerId, input);
  }

  @Delete(":id/owners/:ownerId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_deleteOwner_v1",
  })
  deleteOwner(
    @Param("id") id: string,
    @Param("ownerId") ownerId: string,
  ): Promise<void> {
    return this.entities.deleteOwner(id, ownerId);
  }

  @Post(":id/vat-periods")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_createVatPeriod_v1",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: VatRegistrationPeriod })
  createVatPeriod(
    @Param("id") id: string,
    @Body() input: CreateVatRegistrationPeriodInput,
  ): Promise<v1.finance.VatRegistrationPeriod> {
    return this.entities.createVatPeriod(id, input);
  }

  @Get(":id/vat-periods")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_listVatPeriods_v1",
  })
  @ZodResponse({ type: VatRegistrationPeriodList })
  listVatPeriods(
    @Param("id") id: string,
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.VatRegistrationPeriodList> {
    return this.entities.listVatPeriods(id, query.on);
  }

  @Patch(":id/vat-periods/:periodId")
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_updateVatPeriod_v1",
  })
  @ZodResponse({ type: VatRegistrationPeriod })
  updateVatPeriod(
    @Param("id") id: string,
    @Param("periodId") periodId: string,
    @Body() input: UpdateVatRegistrationPeriodInput,
  ): Promise<v1.finance.VatRegistrationPeriod> {
    return this.entities.updateVatPeriod(id, periodId, input);
  }

  @Delete(":id/vat-periods/:periodId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "BusinessLegalEntitiesController_deleteVatPeriod_v1",
  })
  deleteVatPeriod(
    @Param("id") id: string,
    @Param("periodId") periodId: string,
  ): Promise<void> {
    return this.entities.deleteVatPeriod(id, periodId);
  }
}
