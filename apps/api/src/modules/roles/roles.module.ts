import { Module } from '@nestjs/common';
import { PermissionsController, RolesController } from './roles.controller';

@Module({
  controllers: [RolesController, PermissionsController],
})
export class RolesModule {}
