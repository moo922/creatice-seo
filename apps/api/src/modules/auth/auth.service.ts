import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '@creative-seo/database';
import type { AuthUserDto } from '@creative-seo/types';
import { toPrincipal } from '../../common/guards/jwt-auth.guard';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { TokenService, type TokenPair } from './token.service';

export interface LoginResult {
  pair: TokenPair;
  user: AuthUserDto;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokenService,
    private readonly activities: ActivityLogService,
  ) {}

  async login(
    email: string,
    password: string,
    requestMeta: { ip?: string | null; userAgent?: string | null },
  ): Promise<LoginResult> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended');
    }

    const access = await this.tokens.createAccessToken(user);
    const refresh = await this.tokens.createRefreshToken(user.id, requestMeta);

    user.lastLoginAt = new Date();
    await this.users.save(user, { reload: false });

    await this.activities.record({
      action: 'auth.login',
      userId: user.id,
      organizationId: user.organizationId,
      meta: { email: user.email },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    });

    return {
      pair: {
        accessToken: access.token,
        accessTokenExpiresIn: access.expiresIn,
        refreshToken: refresh.raw,
      },
      user: toPrincipal(user),
    };
  }

  async refresh(
    rawToken: string,
    requestMeta: { ip?: string | null; userAgent?: string | null },
  ): Promise<LoginResult> {
    const { pair, user } = await this.tokens.rotate(rawToken, requestMeta);
    await this.activities.record({
      action: 'auth.refresh',
      userId: user.id,
      organizationId: user.organizationId,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    });
    return { pair, user: toPrincipal(user) };
  }

  async logout(
    rawToken: string | undefined,
    requestMeta: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    if (rawToken) {
      await this.tokens.revoke(rawToken);
    }
    await this.activities.record({
      action: 'auth.logout',
      meta: { hadToken: Boolean(rawToken) },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    });
  }
}
