import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, Site, SiteMembership, User } from '@creative-seo/database';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Organization, SiteMembership, User])],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
