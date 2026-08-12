import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, SiteSecret } from '@creative-seo/database';
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSecret, Site])],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
