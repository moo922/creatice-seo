import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { In, Repository } from 'typeorm';
import { Role, User } from '@creative-seo/database';
import type { Paginated, RoleKey, UserDto } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AssignRolesDto, CreateUserDto, UpdateUserDto, UserQueryDto } from './users.dto';

const BCRYPT_ROUNDS = 12;

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly activities: ActivityLogService,
  ) {}

  async create(dto: CreateUserDto, actor: AuthPrincipal, meta: RequestMeta): Promise<UserDto> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.users.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('A user with this email already exists');
    }

    if (dto.type === 'CLIENT' && !dto.organizationId) {
      throw new ConflictException('Client users must belong to an organization');
    }

    const roleEntities = await this.resolveRoles(dto.roleKeys);

    const user = this.users.create({
      email,
      fullName: dto.fullName,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      type: dto.type,
      status: 'ACTIVE',
      organizationId: dto.organizationId ?? null,
    });
    user.roles = roleEntities;
    const saved = await this.users.save(user);

    await this.activities.record({
      action: 'user.create',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'user',
      entityId: saved.id,
      meta: { email: saved.email, roles: dto.roleKeys },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.findByIdOrThrow(saved.id, actor);
  }

  async list(query: UserQueryDto, principal: AuthPrincipal): Promise<Paginated<UserDto>> {
    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere('(user.email ILIKE :search OR user.fullName ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.role) {
      qb.andWhere('role.key = :role', { role: query.role });
    }
    if (!this.isGlobal(principal)) {
      qb.andWhere('user.organizationId = :org', { org: principal.organizationId ?? '' });
    } else if (query.organizationId) {
      qb.andWhere('user.organizationId = :org', { org: query.organizationId });
    }

    const [rows, total] = await Promise.all([
      qb.skip((query.page - 1) * query.perPage).take(query.perPage).getMany(),
      qb.getCount(),
    ]);

    return {
      data: rows.map(toDto),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async findByIdOrThrow(id: string, principal: AuthPrincipal): Promise<UserDto> {
    const user = await this.users.findOne({
      where: { id },
      relations: { roles: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!this.isGlobal(principal) && user.organizationId !== principal.organizationId) {
      throw new NotFoundException('User not found');
    }
    return toDto(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthPrincipal, meta: RequestMeta): Promise<UserDto> {
    const user = await this.getEntityOrThrow(id);
    if (!this.isGlobal(actor) && user.organizationId !== actor.organizationId) {
      throw new NotFoundException('User not found');
    }

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }
    if (dto.status !== undefined) {
      user.status = dto.status;
      if (dto.status === 'SUSPENDED') {
        user.tokenVersion += 1; // invalidate all active sessions
      }
    }
    await this.users.save(user);

    await this.activities.record({
      action: 'user.update',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'user',
      entityId: id,
      meta: { changed: dto },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.findByIdOrThrow(id, actor);
  }

  async deactivate(id: string, actor: AuthPrincipal, meta: RequestMeta): Promise<void> {
    const user = await this.getEntityOrThrow(id);
    if (!this.isGlobal(actor) && user.organizationId !== actor.organizationId) {
      throw new NotFoundException('User not found');
    }
    user.status = 'SUSPENDED';
    user.tokenVersion += 1;
    await this.users.save(user);

    await this.activities.record({
      action: 'user.deactivate',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'user',
      entityId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async assignRoles(id: string, dto: AssignRolesDto, actor: AuthPrincipal, meta: RequestMeta): Promise<UserDto> {
    const user = await this.getEntityOrThrow(id);
    if (!this.isGlobal(actor) && user.organizationId !== actor.organizationId) {
      throw new NotFoundException('User not found');
    }
    const roleEntities = await this.resolveRoles(dto.roleKeys);
    user.roles = roleEntities;
    user.tokenVersion += 1; // force re-login so fresh permissions are used
    await this.users.save(user);

    await this.activities.record({
      action: 'user.assign_roles',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'user',
      entityId: id,
      meta: { roles: dto.roleKeys },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.findByIdOrThrow(id, actor);
  }

  private async resolveRoles(roleKeys: RoleKey[]): Promise<Role[]> {
    const roles = await this.roles.findBy({ key: In(roleKeys) });
    if (roles.length !== new Set(roleKeys).size) {
      throw new NotFoundException('One or more roles do not exist');
    }
    return roles;
  }

  private async getEntityOrThrow(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private isGlobal(principal: AuthPrincipal): boolean {
    return principal.roles.includes('SUPER_ADMIN') || principal.roles.includes('ADMIN');
  }
}

function toDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    type: user.type,
    status: user.status,
    organizationId: user.organizationId,
    roles: (user.roles ?? []).map((role) => role.key as RoleKey),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
