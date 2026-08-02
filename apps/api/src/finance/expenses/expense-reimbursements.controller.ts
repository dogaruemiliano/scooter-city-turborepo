import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
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
import {
  ExpenseReimbursementClaim,
  ExpenseReimbursementList,
  ListExpenseReimbursementsQuery,
  SettleExpenseReimbursementInput,
} from "./expense.dto";
import { ExpensesService } from "./expenses.service";

@ApiTags("finance-expense-reimbursements")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/expense-reimbursements", version: "1" })
export class ExpenseReimbursementsController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ operationId: "ExpenseReimbursementsController_list_v1" })
  @ZodResponse({ type: ExpenseReimbursementList })
  list(
    @Query() query: ListExpenseReimbursementsQuery,
  ): Promise<v1.finance.ExpenseReimbursementList> {
    return this.expenses.listReimbursements(query);
  }

  @Post(":claimId/settlements")
  @ApiOperation({ operationId: "ExpenseReimbursementsController_settle_v1" })
  @ZodResponse({ type: ExpenseReimbursementClaim })
  settle(
    @Param("claimId") claimId: string,
    @Body() input: SettleExpenseReimbursementInput,
    @CurrentUser() actor: AuthPrincipal,
  ): Promise<v1.finance.ExpenseReimbursementClaim> {
    return this.expenses.settleReimbursement(claimId, input, {
      actorUserId: actor.id,
    });
  }
}
