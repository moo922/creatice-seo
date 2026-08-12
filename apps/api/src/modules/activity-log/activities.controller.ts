import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivitiesService } from './activities.service';

class ActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}

@Controller('activities')
@UseGuards(SiteAccessGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermissions('activities:read')
  list(
    @Query() query: ActivityQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.activities.list(
      {
        page: query.page,
        perPage: query.perPage,
        siteId: query.siteId,
        userId: query.userId,
        organizationId: query.organizationId,
        action: query.action,
      },
      user,
    );
  }
}
