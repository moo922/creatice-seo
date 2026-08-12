import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RefreshToken, User } from '@creative-seo/database';
import type { PermissionKey, RoleKey } from '@creative-seo/types';
import { AppConfig } from '../../config/app-config';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface RefreshTokenEntity {
  raw: string;
  id: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly config: AppConfig,
  ) {}

  async createAccessToken(user: User): Promise<{ token: string; expiresIn: number }> {
    const roles = (user.roles ?? []).map((role) => role.key as RoleKey);
    const permissions = Array.from(
      new Set((user.roles ?? []).flatMap((role) => (role.permissions ?? []).map((p) => p.key))),
    ) as PermissionKey[];
    const payload = {
      sub: user.id,
      email: user.email,
      v: user.tokenVersion,
      roles,
      permissions,
    };
    const expiresIn = this.config.env.JWT_ACCESS_TTL;
    const token = await this.jwtService.signAsync(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn,
    });
    return { token, expiresIn };
  }

  async createRefreshToken(
    userId: string,
    meta: { userAgent?: string | null; ip?: string | null },
  ): Promise<RefreshTokenEntity> {
    const raw = randomBytes(48).toString('base64url');
    const token = this.refreshTokens.create({
      userId,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + this.config.env.JWT_REFRESH_TTL * 1000),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });
    const saved = await this.refreshTokens.save(token);
    return { raw, id: saved.id };
  }

  /**
   * Validates and rotates a refresh token in one transaction. Returns a fresh
   * pair; the old token is revoked and linked to its replacement.
   */
  async rotate(
    rawToken: string,
    meta: { userAgent?: string | null; ip?: string | null },
  ): Promise<{ pair: TokenPair; user: User }> {
    const existing = await this.refreshTokens.findOne({
      where: {
        tokenHash: this.hashToken(rawToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!existing) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.findUserWithRoles(existing.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    const replacement = await this.createRefreshToken(user.id, meta);

    await this.refreshTokens.update(
      { id: existing.id },
      { revokedAt: new Date(), replacedByTokenId: replacement.id },
    );

    const access = await this.createAccessToken(user);
    return {
      pair: {
        accessToken: access.token,
        accessTokenExpiresIn: access.expiresIn,
        refreshToken: replacement.raw,
      },
      user,
    };
  }

  async revoke(rawToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.hashToken(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async findUserWithRoles(userId: string): Promise<User | null> {
    return this.refreshTokens.manager.findOne(User, {
      where: { id: userId },
      relations: { roles: { permissions: true } },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
