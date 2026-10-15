import { Module } from "@nestjs/common";
import { ProblemsController } from "./problems.controller";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { ProblemPhotosService } from "./problem-photos.service";
import { ProblemsService } from "./problems.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [ProblemsController],
  providers: [ProblemsService, ProblemPhotosService],
})
export class ProblemsModule {}
