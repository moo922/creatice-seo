import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDataSourceOptions } from '@creative-seo/database';
import { AiCoreModule } from '@creative-seo/ai';
import { ContentCoreModule } from '@creative-seo/content';
import { OperationsCoreModule } from '@creative-seo/operations';
import { VisibilityCoreModule } from '@creative-seo/visibility';
import { LinksCoreModule } from '@creative-seo/links';
import { ReportingCoreModule } from '@creative-seo/reporting';
import { OrchestrationCoreModule } from '@creative-seo/orchestration';
import { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/app-config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SecurityModule } from './security/security.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RedisModule } from './modules/redis/redis.module';
import { RolesModule } from './modules/roles/roles.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { SitesModule } from './modules/sites/sites.module';
import { ThrottleModule } from './modules/throttle/throttle.module';
import { UsersModule } from './modules/users/users.module';
import { WordPressModule } from './modules/wordpress/wordpress.module';
import { GscModule } from './modules/gsc/gsc.module';
import { AiModule } from './modules/ai/ai.module';
import { ContentModule } from './modules/content/content.module';
import { OperationsModule } from './modules/operations/operations.module';
import { VisibilityModule } from './modules/visibility/visibility.module';
import { LinksModule } from './modules/links/links.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ClientModule } from './modules/client/client.module';
import { OrchestrationModule } from './modules/orchestration/orchestration.module';
import { KeywordsModule } from './modules/keywords/keywords.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], ignoreEnvVars: false }),
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        createDataSourceOptions({
          url: config.env.DATABASE_URL,
          migrationsRun: false,
          logging: config.env.NODE_ENV !== 'production' && config.env.NODE_ENV !== 'test',
        }),
    }),
    AppConfigModule,
    AiCoreModule,
    ContentCoreModule,
    OperationsCoreModule,
    VisibilityCoreModule,
    LinksCoreModule,
    ReportingCoreModule,
    OrchestrationCoreModule,
    ThrottleModule,
    SecurityModule,
    RedisModule,
    ActivityLogModule,
    AccessControlModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrganizationsModule,
    SitesModule,
    SecretsModule,
    WordPressModule,
    GscModule,
    AiModule,
    ContentModule,
    OperationsModule,
    VisibilityModule,
    LinksModule,
    ReportingModule,
    ClientModule,
    OrchestrationModule,
    KeywordsModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
