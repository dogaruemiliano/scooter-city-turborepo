import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { createZodDto, ZodResponse } from "nestjs-zod";
import {
  RequireAllScope,
  RequireSuperAdmin,
  SelfService,
} from "../access/access.decorators";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

class ListQuery extends createZodDto(
  v1.notifications.listNotificationsQuerySchema,
) {}
class NotificationList extends createZodDto(
  v1.notifications.notificationListSchema,
) {}
class Notification extends createZodDto(v1.notifications.notificationSchema) {}
class EmptyInput extends createZodDto(
  v1.notifications.markNotificationReadInputSchema,
) {}
class ReadAllInput extends createZodDto(
  v1.notifications.markAllNotificationsReadInputSchema,
) {}
class PresentedInput extends createZodDto(
  v1.notifications.presentNotificationsInputSchema,
) {}
class Preferences extends createZodDto(
  v1.notifications.notificationPreferencesSchema,
) {}
class UpdatePreferences extends createZodDto(
  v1.notifications.updateNotificationPreferencesInputSchema,
) {}
class PushConfig extends createZodDto(v1.notifications.pushConfigSchema) {}
class RegisterSubscription extends createZodDto(
  v1.notifications.registerPushSubscriptionInputSchema,
) {}
class RemoveSubscription extends createZodDto(
  v1.notifications.removePushSubscriptionInputSchema,
) {}
class Result extends createZodDto(
  v1.notifications.notificationMutationResultSchema,
) {}
class ProcessingFailures extends createZodDto(
  v1.notifications.notificationProcessingFailuresSchema,
) {}

@ApiTags("notifications")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "notifications", version: "1" })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @SelfService()
  @ZodResponse({ type: NotificationList })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.notifications.list(user.id, query);
  }

  @Get("activity")
  @RequireAllScope("notifications.activity.read")
  @ZodResponse({ type: NotificationList })
  activity(@CurrentUser() user: AuthPrincipal, @Query() query: ListQuery) {
    return this.notifications.activity(user.id, query);
  }

  @Post("read-all")
  @SelfService()
  @ZodResponse({ type: Result })
  readAll(@CurrentUser() user: AuthPrincipal, @Body() input: ReadAllInput) {
    return this.notifications.markAllRead(user.id, input.cutoff);
  }

  @Post("presented")
  @SelfService()
  @ZodResponse({ type: Result })
  presented(@CurrentUser() user: AuthPrincipal, @Body() input: PresentedInput) {
    return this.notifications.presented(user.id, input.ids);
  }

  @Get("preferences")
  @SelfService()
  @ZodResponse({ type: Preferences })
  preferences(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.preferences(user.id);
  }

  @Patch("preferences")
  @SelfService()
  @ZodResponse({ type: Preferences })
  updatePreferences(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: UpdatePreferences,
  ) {
    return this.notifications.updatePreferences(user.id, input);
  }

  @Get("push-config")
  @SelfService()
  @ZodResponse({ type: PushConfig })
  pushConfig() {
    return this.notifications.pushConfig();
  }

  @Post("push-subscriptions")
  @SelfService()
  @ZodResponse({ type: Result })
  registerSubscription(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: RegisterSubscription,
  ) {
    return this.notifications.registerSubscription(
      user.id,
      user.sessionId,
      input,
    );
  }

  @Delete("push-subscriptions")
  @SelfService()
  @ZodResponse({ type: Result })
  removeSubscription(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: RemoveSubscription,
  ) {
    return this.notifications.removeSubscription(user.id, input.endpoint);
  }

  @Get("processing")
  @RequireSuperAdmin()
  @ZodResponse({ type: ProcessingFailures })
  processingFailures(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.processingFailures(user.id);
  }

  @Post("processing/events/:id/retry")
  @RequireSuperAdmin()
  @ZodResponse({ type: Result })
  retryEvent(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() _input: EmptyInput,
  ) {
    void _input;
    return this.notifications.retryEvent(user.id, id);
  }

  @Post("processing/deliveries/:id/retry")
  @RequireSuperAdmin()
  @ZodResponse({ type: Result })
  retryDelivery(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() _input: EmptyInput,
  ) {
    void _input;
    return this.notifications.retryDelivery(user.id, id);
  }

  @Get(":id")
  @SelfService()
  @ZodResponse({ type: Notification })
  detail(@CurrentUser() user: AuthPrincipal, @Param("id") id: string) {
    return this.notifications.detail(user.id, id);
  }

  @Patch(":id/read")
  @SelfService()
  @ZodResponse({ type: Result })
  read(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() _input: EmptyInput,
  ) {
    void _input;
    return this.notifications.markRead(user.id, id);
  }
}
