import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteMembership } from '@creative-seo/database';
import type { AuthPrincipal } from '../auth.types';

@Injectable()
export class SiteAccessService {
  constructor(
    @InjectRepository(SiteMembership)
    private readonly memberships: Repository<SiteMembership>,
  ) {}

  isGlobal(user: AuthPrincipal): boolean {
    return user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
  }

  async isMember(siteId: string, userId: string): Promise<boolean> {
    const count = await this.memberships.count({
      where: { siteId, userId },
    });
    return count > 0;
  }

  async memberSiteIds(userId: string): Promise<string[]> {
    const rows = await this.memberships.find({
      where: { userId },
      select: { siteId: true },
    });
    return rows.map((row) => row.siteId);
  }

  /**
   * Enforces tenant isolation. Global roles (SUPER_ADMIN, ADMIN) may access any
   * site; all other roles require an explicit site membership.
   */
  async assertSiteAccess(user: AuthPrincipal, siteId: string): Promise<void> {
    if (this.isGlobal(user)) {
      return;
    }
    if (!(await this.isMember(siteId, user.id))) {
      throw new ForbiddenException(`No access to site ${siteId}`);
    }
  }
}
