import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './auth.dto';

export const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password, this.requestMeta(req));
    this.setRefreshCookie(res, result.pair.refreshToken);
    return {
      accessToken: result.pair.accessToken,
      expiresIn: result.pair.accessTokenExpiresIn,
      user: result.user,
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.extractRefreshToken(req, body);
    if (!rawToken) {
      throw new BadRequestException('Refresh token missing');
    }
    const result = await this.auth.refresh(rawToken, this.requestMeta(req));
    this.setRefreshCookie(res, result.pair.refreshToken);
    return {
      accessToken: result.pair.accessToken,
      expiresIn: result.pair.accessTokenExpiresIn,
      user: result.user,
    };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.extractRefreshToken(req, body);
    await this.auth.logout(rawToken ?? undefined, this.requestMeta(req));
    this.clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: this.config.env.JWT_REFRESH_TTL * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  private extractRefreshToken(req: Request, body: RefreshDto): string | undefined {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return cookie ?? body.refreshToken;
  }

  private requestMeta(req: Request) {
    return {
      ip: (req.ip ?? null) as string | null,
      userAgent: (req.headers['user-agent'] ?? null) as string | null,
    };
  }
}
