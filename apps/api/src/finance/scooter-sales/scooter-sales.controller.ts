import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
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

import type { AuthPrincipal } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import { CancelScooterSaleInput } from "./dto/cancel-scooter-sale.input";
import { CreateScooterSaleInput } from "./dto/create-scooter-sale.input";
import { ListScooterSalesQuery } from "./dto/list-scooter-sales.query";
import { RecordScooterSalePaymentInput } from "./dto/record-scooter-sale-payment.input";
import { ScooterFinancials } from "./dto/scooter-financials";
import { ScooterSale } from "./dto/scooter-sale";
import { ScooterSaleList } from "./dto/scooter-sale-list";
import { ScooterSalesService } from "./scooter-sales.service";

@ApiTags("finance-scooter-sales")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/scooter-sales", version: "1" })
export class ScooterSalesController {
  constructor(private readonly scooterSales: ScooterSalesService) {}

  @Post()
  @ApiOperation({
    operationId: "ScooterSalesController_create_v1",
    summary: "Sell a scooter to a buyer and charge their wallet",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ScooterSale })
  create(
    @Body() input: CreateScooterSaleInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ScooterSale> {
    return this.scooterSales.createSale(input, { actorUserId: actor.id });
  }

  @Get()
  @ApiOperation({
    operationId: "ScooterSalesController_list_v1",
    summary: "List scooter sales by scooter or buyer",
  })
  @ZodResponse({ type: ScooterSaleList })
  list(
    @Query() query: ListScooterSalesQuery,
  ): Promise<v1.finance.ScooterSaleList> {
    return this.scooterSales.list(query);
  }

  @Get(":id")
  @ApiOperation({
    operationId: "ScooterSalesController_get_v1",
    summary: "Get one scooter sale",
  })
  @ZodResponse({ type: ScooterSale })
  get(@Param("id") id: string): Promise<v1.finance.ScooterSale> {
    return this.scooterSales.get(id);
  }

  @Post(":id/payments")
  @ApiOperation({
    operationId: "ScooterSalesController_recordPayment_v1",
    summary: "Record a buyer payment toward a scooter sale",
  })
  @ZodResponse({ type: ScooterSale })
  recordPayment(
    @Param("id") id: string,
    @Body() input: RecordScooterSalePaymentInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ScooterSale> {
    return this.scooterSales.recordPayment(id, input, {
      actorUserId: actor.id,
    });
  }

  @Post(":id/cancel")
  @ApiOperation({
    operationId: "ScooterSalesController_cancel_v1",
    summary: "Cancel a scooter sale that has no recorded payments",
  })
  @ZodResponse({ type: ScooterSale })
  cancel(
    @Param("id") id: string,
    @Body() input: CancelScooterSaleInput,
  ): Promise<v1.finance.ScooterSale> {
    return this.scooterSales.cancelSale(id, input);
  }
}

@ApiTags("finance-scooter-sales")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/scooters", version: "1" })
export class ScooterFinancialsController {
  constructor(private readonly scooterSales: ScooterSalesService) {}

  @Get(":scooterId/financials")
  @ApiOperation({
    operationId: "ScooterFinancialsController_get_v1",
    summary: "Get a scooter's cost rollup and sale receivable",
  })
  @ZodResponse({ type: ScooterFinancials })
  getFinancials(
    @Param("scooterId") scooterId: string,
  ): Promise<v1.finance.ScooterFinancials> {
    return this.scooterSales.getScooterFinancials(scooterId);
  }
}
