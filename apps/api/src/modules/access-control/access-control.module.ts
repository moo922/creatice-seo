import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteMembership, User } from '@creative-seo/database';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Registers the global authentication + authorization guards and provides the
 * tenant-isolation service. Guard order: JwtAuthGuard -> PermissionsGuard.
 */
@Global()
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User, SiteMembership])],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    JwtAuthGuard,
    PermissionsGuard,
    SiteAccessGuard,
    SiteAccessService,
  ],
  exports: [JwtAuthGuard, PermissionsGuard, SiteAccessGuard, SiteAccessService],
})
export class AccessControlModule {}
