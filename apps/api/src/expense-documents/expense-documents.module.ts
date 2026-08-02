import { Module } from "@nestjs/common";

import { ImageStorageModule } from "../image-storage/image-storage.module";
import { ExpenseDocumentsController } from "./expense-documents.controller";
import { ExpenseDocumentsService } from "./expense-documents.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [ExpenseDocumentsController],
  providers: [ExpenseDocumentsService],
  exports: [ExpenseDocumentsService],
})
export class ExpenseDocumentsModule {}
