import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { GlobalProvidersService } from './global-providers.service';
import { TestProviderConnectionDto, UpdateGlobalProviderDto } from './ai.dto';

@Controller('ai/providers')
@RequirePermissions('ai:manage')
export class GlobalProvidersController {
  constructor(private readonly providers: GlobalProvidersService) {}

  @Get()
  list() {
    return this.providers.list();
  }

  @Put(':provider')
  update(
    @Param('provider') provider: string,
    @Body() dto: UpdateGlobalProviderDto,
  ) {
    return this.providers.update(provider, dto);
  }

  @Post(':provider/test')
  test(
    @Param('provider') provider: string,
    @Body() dto: TestProviderConnectionDto,
  ) {
    return this.providers.testConnection(provider, dto.apiKey);
  }

  @Post(':provider/disconnect')
  disconnect(@Param('provider') provider: string) {
    return this.providers.disconnect(provider);
  }
}
