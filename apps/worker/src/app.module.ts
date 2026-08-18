import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCoreModule } from '@creative-seo/ai';
import { AutomationCoreModule } from '@creative-seo/automation';
import { ContentCoreModule } from '@creative-seo/content';
import { MetricsCoreModule } from '@creative-seo/metrics';
import { OperationsCoreModule } from '@creative-seo/operations';
import { VisibilityCoreModule } from '@creative-seo/visibility';
import { ReportingCoreModule } from '@creative-seo/reporting';
import { LinksCoreModule } from '@creative-seo/links';
import { Site } from '@creative-seo/database';
import { createDataSourceOptions } from '@creative-seo/database';
import { WorkerConfig } from './config/worker-config';
import { WorkerConfigModule } from './config/worker-config.module';
import { HealthServer } from './health/health-server';
import { QueueManager } from './queue/queue-manager';
import { QueueProcessor } from './queue/queue-processor';
import { ScheduledJobsService } from './queue/scheduler';
import { AutomationScheduler } from './queue/automation-scheduler';
import { Gc06SchedulerService } from './queue/gc06-scheduler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], ignoreEnvVars: false }),
    WorkerConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [WorkerConfig],
      useFactory: (config: WorkerConfig) =>
        createDataSourceOptions({
          url: config.env.DATABASE_URL,
          migrationsRun: false,
          logging: config.env.NODE_ENV !== 'production' && config.env.NODE_ENV !== 'test',
        }),
    }),
    TypeOrmModule.forFeature([Site]),
    AiCoreModule,
    MetricsCoreModule,
    AutomationCoreModule,
    ContentCoreModule,
    OperationsCoreModule,
    VisibilityCoreModule,
    ReportingCoreModule,
    LinksCoreModule,
  ],
  providers: [QueueManager, HealthServer, QueueProcessor, ScheduledJobsService, AutomationScheduler, Gc06SchedulerService],
})
export class AppModule {}
