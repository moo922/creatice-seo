import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import {
  CreateKnowledgeFactDto,
  ListKnowledgeFactsDto,
  UpdateKnowledgeFactDto,
} from './knowledge-base.dto';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('knowledge')
@RequirePermissions('knowledge:read')
export class KnowledgeBaseController {
  constructor(private readonly knowledge: KnowledgeBaseService) {}

  @Get()
  list(@Query() query: ListKnowledgeFactsDto, @CurrentUser() user: AuthPrincipal) {
    return this.knowledge.list(query, user);
  }
}

@Controller('sites/:siteId/knowledge')
@UseGuards(SiteAccessGuard)
export class SiteKnowledgeBaseController {
  constructor(private readonly knowledge: KnowledgeBaseService) {}

  @Get()
  @RequirePermissions('knowledge:read')
  listBySite(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.knowledge.listBySite(siteId, user);
  }

  @Post()
  @RequirePermissions('knowledge:manage')
  create(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateKnowledgeFactDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.knowledge.create(siteId, dto, user);
  }

  @Patch(':factId')
  @RequirePermissions('knowledge:manage')
  update(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('factId', ParseUUIDPipe) factId: string,
    @Body() dto: UpdateKnowledgeFactDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.knowledge.update(siteId, factId, dto, user);
  }

  @Delete(':factId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('knowledge:manage')
  async remove(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('factId', ParseUUIDPipe) factId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.knowledge.remove(siteId, factId, user);
  }
}
