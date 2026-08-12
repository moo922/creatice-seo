import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCoreModule } from '@creative-seo/ai';
import { createDataSourceOptions } from '@creative-seo/database';
import { WorkerConfig } from './config/worker-config';
import { HealthServer } from './health/health-server';
import { QueueManager } from './queue/queue-manager';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], ignoreEnvVars: false }),
    TypeOrmModule.forRootAsync({
      inject: [WorkerConfig],
      useFactory: (config: WorkerConfig) =>
        createDataSourceOptions({
          url: config.env.DATABASE_URL,
          migrationsRun: false,
          logging: config.env.NODE_ENV !== 'production' && config.env.NODE_ENV !== 'test',
        }),
    }),
    AiCoreModule,
  ],
  providers: [WorkerConfig, QueueManager, HealthServer],
})
export class AppModule {}
