import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@creative-seo/database';
import type { PermissionKey, RoleKey } from '@creative-seo/types';
import { AppConfig } from '../../config/app-config';
import type { AuthPrincipal, AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AccessTokenPayload {
  sub: string;
  email: string;
  v: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, context.getHandler()) ?? 
      Reflect.getMetadata(IS_PUBLIC_KEY, context.getClass());
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.users.findOne({
      where: { id: payload.sub },
      relations: { roles: { permissions: true } },
    });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended');
    }
    if (user.tokenVersion !== payload.v) {
      throw new UnauthorizedException('Token is no longer valid');
    }

    request.user = toPrincipal(user);
    return true;
  }
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith('Bearer ')) {
    return null;
  }
  return value.slice('Bearer '.length).trim() || null;
}

export function toPrincipal(user: User): AuthPrincipal {
  const roles = (user.roles ?? []).map((role) => role.key as RoleKey);
  const permissions = Array.from(
    new Set((user.roles ?? []).flatMap((role) => (role.permissions ?? []).map((p) => p.key))),
  ) as PermissionKey[];
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    type: user.type,
    status: user.status,
    organizationId: user.organizationId,
    roles,
    permissions,
  };
}
