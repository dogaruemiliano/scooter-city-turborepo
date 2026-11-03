import { Module } from "@nestjs/common";
import { NotificationDispatcherService } from "./notification-dispatcher.service";
import { NotificationPushService } from "./notification-push.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPushService,
    NotificationDispatcherService,
  ],
})
export class NotificationsModule {}
