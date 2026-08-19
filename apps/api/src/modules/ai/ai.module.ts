import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAiProviderCredential, Site } from '@creative-seo/database';
import { SecurityModule } from '../../security/security.module';
import { AiAdminController, SiteAiController } from './ai.controller';
import { GlobalProvidersController } from './global-providers.controller';
import { GlobalProvidersService } from './global-providers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Site, GlobalAiProviderCredential]),
    SecurityModule,
  ],
  controllers: [SiteAiController, AiAdminController, GlobalProvidersController],
  providers: [GlobalProvidersService],
})
export class AiModule {}
