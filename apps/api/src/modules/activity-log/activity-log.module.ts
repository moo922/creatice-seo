import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from '@creative-seo/database';
import { ActivityLogService } from './activity-log.service';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog])],
  providers: [ActivityLogService, ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
