import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { SiteLinksController } from './links.controller';
import { AuditRulesController, SiteAuditController, SiteLighthouseController } from './audit.controller';
import { AeoAuditController, GeoAuditController } from './aeo-geo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [
    SiteLinksController, SiteAuditController, AuditRulesController,
    SiteLighthouseController, AeoAuditController, GeoAuditController,
  ],
})
export class LinksModule {}
