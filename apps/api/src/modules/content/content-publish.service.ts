import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentPackage, ContentPublication } from '@creative-seo/database';
import { OperationsService } from '@creative-seo/operations';
import type { ContentPublicationDto, CreatePublicationRequest } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { WordPressClientService } from '../wordpress/wordpress-client.service';
import { WordPressService } from '../wordpress/wordpress.service';

/**
 * Content publishing flow for a content package:
 * create draft (connector) -> approve (reviewer) -> publish (status=publish)
 * -> verify (post-publish check). Failures mark the publication FAILED with a
 * sanitized error and are never silent. Publishing records a page_created
 * change-log entry so it appears under "Work Completed".
 */
@Injectable()
export class ContentPublishService {
  constructor(
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(ContentPackage) private readonly packages: Repository<ContentPackage>,
    private readonly wordpress: WordPressService,
    private readonly client: WordPressClientService,
    private readonly operations: OperationsService,
    private readonly activities: ActivityLogService,
  ) {}

  async createDraft(
    siteId: string,
    organizationId: string | null,
    input: CreatePublicationRequest,
    userId: string | null,
  ): Promise<ContentPublicationDto> {
    const pkg = await this.packages.findOne({ where: { id: input.packageId, siteId } });
    if (!pkg) {
      throw new NotFoundException('Content package not found');
    }
    const data = (pkg.packageData ?? {}) as { draft?: { htmlContent: string }; slug?: string; seoTitle?: string; metaDescription?: string; recommendedUrl?: string; internalLinks?: unknown[] };
    const html = data.draft?.htmlContent ?? '';
    if (!html) {
      throw new BadRequestException('Content package has no draft HTML to publish');
    }
    const brief = (pkg.brief ?? {}) as { title?: string; primaryKeyword?: string };
    const title = data.seoTitle ?? brief.title ?? 'Untitled';
    const slug = input.slug ?? data.slug ?? '';

    const { creds, integration } = await this.wordpress.publishConnection(siteId);
    void integration;

    const row = this.publications.create({ siteId, organizationId, contentPackageId: pkg.id, title, status: 'DRAFT', url: null, meta: {}, createdBy: userId });
    try {
      const created = await this.client.createDraft(creds, { title, content: html, slug });
      row.wpPostId = String(created.id);
      row.url = created.link ?? null;
      row.meta = {
        slug,
        rankMath: { focusKeyword: brief.primaryKeyword ?? '', seoTitle: title, metaDescription: data.metaDescription ?? '' },
        internalLinks: data.internalLinks ?? [],
      };
      const saved = await this.publications.save(row);
      await this.audit(siteId, userId, 'create-draft', { publicationId: saved.id, wpPostId: created.id });
      return this.toDto(saved);
    } catch (error) {
      row.status = 'FAILED';
      row.error = sanitize(error);
      await this.publications.save(row);
      throw new BadGatewayException(sanitize(error));
    }
  }

  async approve(id: string, userId: string | null): Promise<ContentPublicationDto> {
    const row = await this.require(id);
    if (row.status !== 'DRAFT') {
      throw new BadRequestException(`Only DRAFT publications can be approved (current: ${row.status})`);
    }
    row.status = 'APPROVED';
    row.approvedBy = userId;
    row.approvedAt = new Date();
    const saved = await this.publications.save(row);
    await this.audit(row.siteId, userId, 'approve', { publicationId: saved.id });
    return this.toDto(saved);
  }

  async publish(id: string, userId: string | null): Promise<ContentPublicationDto> {
    const row = await this.require(id);
    if (row.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED publications can be published (current: ${row.status})`);
    }
    const postId = Number(row.wpPostId);
    if (!postId) {
      throw new BadRequestException('Publication has no WordPress post id');
    }
    const { creds } = await this.wordpress.publishConnection(row.siteId);
    try {
      const updated = await this.client.updatePostStatus(creds, postId, 'publish');
      row.status = 'PUBLISHED';
      row.url = updated.link ?? row.url;
      row.publishedAt = new Date();
      const saved = await this.publications.save(row);
      await this.operations.createChangeLog(
        row.siteId,
        row.organizationId,
        { pageUrl: row.url ?? '', changeType: 'page_created', before: null, after: { title: row.title, wpPostId: postId } },
        userId,
      );
      await this.audit(row.siteId, userId, 'publish', { publicationId: saved.id, url: row.url });
      return this.toDto(saved);
    } catch (error) {
      row.status = 'FAILED';
      row.error = sanitize(error);
      await this.publications.save(row);
      throw new BadGatewayException(sanitize(error));
    }
  }

  async verify(id: string, userId: string | null): Promise<ContentPublicationDto> {
    const row = await this.require(id);
    if (row.status !== 'PUBLISHED') {
      throw new BadRequestException(`Only PUBLISHED publications can be verified (current: ${row.status})`);
    }
    const postId = Number(row.wpPostId);
    const { creds } = await this.wordpress.publishConnection(row.siteId);
    try {
      const post = await this.client.getPost(creds, postId);
      if (post.status === 'publish') {
        row.status = 'VERIFIED';
        row.verifiedAt = new Date();
      } else {
        row.error = `Post status is "${post.status}", expected "publish"`;
      }
      const saved = await this.publications.save(row);
      await this.audit(row.siteId, userId, 'verify', { publicationId: saved.id, postStatus: post.status });
      return this.toDto(saved);
    } catch (error) {
      row.error = sanitize(error);
      await this.publications.save(row);
      throw new BadGatewayException(sanitize(error));
    }
  }

  async list(siteId: string): Promise<ContentPublicationDto[]> {
    const rows = await this.publications.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toDto(row));
  }

  private async require(id: string): Promise<ContentPublication> {
    const row = await this.publications.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Publication not found');
    }
    return row;
  }

  private async audit(siteId: string, userId: string | null, step: string, meta: Record<string, unknown>): Promise<void> {
    await this.activities.record({ action: 'content.publish', userId, siteId, entityType: 'content_publication', meta: { step, ...meta } });
  }

  private toDto(row: ContentPublication): ContentPublicationDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      contentPackageId: row.contentPackageId,
      wpPostId: row.wpPostId ? Number(row.wpPostId) : null,
      status: row.status as ContentPublicationDto['status'],
      title: row.title,
      url: row.url,
      meta: row.meta,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function sanitize(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'unknown WordPress publishing failure';
}
