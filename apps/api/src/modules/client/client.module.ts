import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { ClientPortalController, ClientSiteController } from './client.controller';
import { ClientService } from './client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [ClientPortalController, ClientSiteController],
  providers: [ClientService],
})
export class ClientModule {}
