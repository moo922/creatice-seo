import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { ACTIVATION_STEPS, type ActivationStepDto, type ActivationStepKey, type SiteActivationDto } from '@creative-seo/types';
import { IsIn } from 'class-validator';
import { ActivationService } from './activation.service';

class RunStepDto {
  @IsIn(ACTIVATION_STEPS)
  stepKey: ActivationStepKey;
}

/**
 * Guided first-site activation wizard. Reads the plan (derived from real data
 * + persisted per-step state) and executes individual steps through the
 * existing application workflows. Failures surface actionable diagnostics and
 * the plan is resumable: completed expensive/destructive steps are never
 * auto-repeated.
 */
@Controller('sites/:siteId/activation')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class ActivationController {
  constructor(private readonly activation: ActivationService) {}

  @Get()
  get(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal): Promise<SiteActivationDto> {
    return this.activation.getActivation(siteId, user);
  }

  @Post('steps/run')
  @RequirePermissions('operations:manage')
  runStep(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: RunStepDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ActivationStepDto> {
    return this.activation.runStep(siteId, dto.stepKey, user);
  }
}
