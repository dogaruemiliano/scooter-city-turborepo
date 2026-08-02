import {
  BadRequestException,
  Body,
  Controller,
  Get,
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

import type { AuthPrincipal } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import { BusinessLegalEntitiesService } from "./business-legal-entities.service";
import {
  BusinessLegalEntityList,
  BusinessOwnerList,
  CreateExpenseInput,
  Expense,
  ExpenseActionInput,
  ExpenseList,
  ExpenseUserOptionList,
  ListExpenseOptionsQuery,
  ListExpensesQuery,
  ListExpenseUserOptionsQuery,
  UpdateExpenseInput,
  VatRegistrationPeriodList,
} from "./expense.dto";
import { ExpensesService } from "./expenses.service";

@ApiTags("finance-expenses")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/expenses", version: "1" })
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly entities: BusinessLegalEntitiesService,
  ) {}

  @Get("options/entities")
  @ApiOperation({
    operationId: "ExpensesController_listEntityOptions_v1",
    summary: "List business legal entities for expense entry",
  })
  @ZodResponse({ type: BusinessLegalEntityList })
  listEntityOptions(
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.BusinessLegalEntityList> {
    return this.entities.list(query.includeInactive);
  }

  @Get("options/users")
  @ApiOperation({
    operationId: "ExpensesController_listUserOptions_v1",
    summary: "Search eligible users for expense owner or payment selectors",
  })
  @ZodResponse({ type: ExpenseUserOptionList })
  listUserOptions(
    @Query() query: ListExpenseUserOptionsQuery,
  ): Promise<v1.finance.ExpenseUserOptionList> {
    return this.entities.listUserOptions(query);
  }

  @Get("options/owners")
  @ApiOperation({
    operationId: "ExpensesController_listOwnerOptions_v1",
    summary: "List formal owners effective on a date",
  })
  @ZodResponse({ type: BusinessOwnerList })
  listOwnerOptions(
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.BusinessOwnerList> {
    if (!query.legalEntityId) {
      throw new BadRequestException("legalEntityId is required");
    }
    return this.entities.listOwners(
      query.legalEntityId,
      query.on,
      query.includeInactive,
    );
  }

  @Get("options/vat-periods")
  @ApiOperation({
    operationId: "ExpensesController_listVatPeriodOptions_v1",
    summary: "List VAT periods for an entity and optional date",
  })
  @ZodResponse({ type: VatRegistrationPeriodList })
  listVatPeriodOptions(
    @Query() query: ListExpenseOptionsQuery,
  ): Promise<v1.finance.VatRegistrationPeriodList> {
    if (!query.legalEntityId) {
      throw new BadRequestException("legalEntityId is required");
    }
    return this.entities.listVatPeriods(query.legalEntityId, query.on);
  }

  @Post()
  @ApiOperation({
    operationId: "ExpensesController_create_v1",
    summary: "Create a compact expense draft and optionally post it",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Expense })
  create(
    @Body() input: CreateExpenseInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.Expense> {
    return this.expenses.create(input, { actorUserId: actor.id });
  }

  @Get()
  @ApiOperation({
    operationId: "ExpensesController_list_v1",
    summary: "List and filter expenses",
  })
  @ZodResponse({ type: ExpenseList })
  list(@Query() query: ListExpensesQuery): Promise<v1.finance.ExpenseList> {
    return this.expenses.list(query);
  }

  @Get(":id")
  @ApiOperation({
    operationId: "ExpensesController_get_v1",
    summary: "Get one expense",
  })
  @ZodResponse({ type: Expense })
  get(@Param("id") id: string): Promise<v1.finance.Expense> {
    return this.expenses.get(id);
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "ExpensesController_update_v1",
    summary: "Update a draft expense",
  })
  @ZodResponse({ type: Expense })
  update(
    @Param("id") id: string,
    @Body() input: UpdateExpenseInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.Expense> {
    return this.expenses.update(id, input, { actorUserId: actor.id });
  }

  @Post(":id/post")
  @ApiOperation({
    operationId: "ExpensesController_post_v1",
    summary: "Post a draft expense and generate its accounting effects",
  })
  @ZodResponse({ type: Expense })
  post(
    @Param("id") id: string,
    @Body() input: ExpenseActionInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.Expense> {
    return this.expenses.post(id, input, { actorUserId: actor.id });
  }

  @Post(":id/reverse")
  @ApiOperation({
    operationId: "ExpensesController_reverse_v1",
    summary: "Reverse a posted expense",
  })
  @ZodResponse({ type: Expense })
  reverse(
    @Param("id") id: string,
    @Body() input: ExpenseActionInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.Expense> {
    return this.expenses.reverse(id, input, { actorUserId: actor.id });
  }
}
