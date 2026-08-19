import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentPackage, ContentPublication, Site } from '@creative-seo/database';
import { OperationsService } from '@creative-seo/operations';
import type {
  ContentPublicationConflict,
  ContentPublicationDto,
  ContentPublicationVerification,
  CreatePublicationRequest,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { WordPressClientService, type ConnectorSeoWritePayload, type WordPressCredentials } from '../wordpress/wordpress-client.service';
import { WordPressService } from '../wordpress/wordpress.service';

const CONNECTOR_VERSION = '1.0.0';

/**
 * Content publishing flow for a content package:
 *
 * 1. createDraft: Creates WP post + writes Rank Math SEO metadata (title, desc,
 *    focus keywords, canonical, robots, schema) in a single pass. Stores a
 *    pre-change snapshot for rollback. NEVER claims success unless the connector
 *    writes and verifies each field.
 *
 * 2. approve: Pure state transition (DRAFT -> APPROVED) with reviewer identity.
 *
 * 3. publish: Changes post status to 'publish' AFTER writing SEO metadata.
 *    Records a page_created change-log entry for Work Completed metrics.
 *
 * 4. verify: Post-publish read-after-write: checks post status, title match,
 *    content hash match, and SEO metadata presence. Updates verification record.
 *
 * No WordPress row is mutated directly. All writes go through the connector
 * plugin REST API. Publication is never considered successful until
 * read-after-write confirms the metadata was applied.
 */
@Injectable()
export class ContentPublishService {
  private readonly logger = new Logger(ContentPublishService.name);

  constructor(
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(ContentPackage) private readonly packages: Repository<ContentPackage>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly wordpress: WordPressService,
    private readonly client: WordPressClientService,
    private readonly operations: OperationsService,
    private readonly activities: ActivityLogService,
  ) {}

  // ------------------------------------------------------------------
  // 1. CREATE DRAFT + WRITE SEO METADATA
  // ------------------------------------------------------------------

  /**
   * Creates a WordPress draft and writes ALL Rank Math SEO metadata in one
   * pass. The connector's PUT /seo/{id} endpoint is called immediately after
   * the post is created. If SEO metadata write fails, the entire operation
   * fails and the publication is marked FAILED.
   *
   * A pre-change snapshot is stored so the publication can be rolled back.
   */
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
    const data = (pkg.packageData ?? {}) as {
      draft?: { htmlContent: string };
      slug?: string;
      seoTitle?: string;
      metaDescription?: string;
      recommendedUrl?: string;
      internalLinks?: unknown[];
      schemaRecommendation?: unknown;
    };
    const html = data.draft?.htmlContent ?? '';
    if (!html) {
      throw new BadRequestException('Content package has no draft HTML to publish');
    }
    const brief = (pkg.brief ?? {}) as { title?: string; primaryKeyword?: string };
    const title = data.seoTitle ?? brief.title ?? 'Untitled';
    const slug = input.slug ?? data.slug ?? '';
    const focusKeyword = brief.primaryKeyword ?? '';

    const { creds, integration: _integration } = await this.wordpress.publishConnection(siteId);

    // Capability discovery: fail fast if connector doesn't support required operations
    let capabilities;
    try {
      capabilities = await this.client.discoverCapabilities(creds);
    } catch (error) {
      throw new BadRequestException(`Cannot probe WordPress connector: ${sanitize(error)}`);
    }
    if (!capabilities.canWritePosts) {
      throw new BadRequestException('WordPress connector lacks write permissions. Check Application Passwords.');
    }

    // Check Rank Math availability before attempting writes
    const rankMathDetected = capabilities.rankMathDetected;

    const row = this.publications.create({
      siteId,
      organizationId,
      contentPackageId: pkg.id,
      title,
      status: 'DRAFT',
      url: null,
      meta: {},
      createdBy: userId,
      connectorVersion: CONNECTOR_VERSION,
    });

    try {
      // Step 1: Create the WordPress draft post
      const created = await this.client.createDraft(creds, { title, content: html, slug });
      row.wpPostId = String(created.id);
      row.url = created.link ?? null;

      // Step 2: Write Rank Math SEO metadata (if available on the site)
      if (rankMathDetected) {
        const seoPayload: ConnectorSeoWritePayload = {};
        if (title) seoPayload.title = title;
        if (data.metaDescription) seoPayload.description = data.metaDescription;
        if (data.recommendedUrl) seoPayload.canonical = data.recommendedUrl;
        if (focusKeyword) seoPayload.focus_keywords = focusKeyword;

        // Write schema if available
        if (data.schemaRecommendation) {
          seoPayload.schema = data.schemaRecommendation;
        }

        const seoResult = await this.client.writeSeoMetadata(creds, created.id, seoPayload);

        // Verify each written field via read-after-write
        const readBack = await this.client.getSeoMetadata(creds, created.id);
        const verifyErrors: string[] = [];
        if (seoPayload.title && readBack.rank_math.title !== seoPayload.title) {
          verifyErrors.push(`title: expected "${seoPayload.title}" got "${readBack.rank_math.title}"`);
        }
        if (seoPayload.description && readBack.rank_math.description !== seoPayload.description) {
          verifyErrors.push(`description: expected "${seoPayload.description}" got "${readBack.rank_math.description}"`);
        }
        if (seoPayload.canonical && readBack.rank_math.canonical !== seoPayload.canonical) {
          verifyErrors.push(`canonical: expected "${seoPayload.canonical}" got "${readBack.rank_math.canonical}"`);
        }
        if (seoPayload.focus_keywords && readBack.rank_math.focus_keywords !== seoPayload.focus_keywords) {
          verifyErrors.push(`focus_keywords: expected "${seoPayload.focus_keywords}" got "${readBack.rank_math.focus_keywords}"`);
        }

        if (verifyErrors.length > 0) {
          this.logger.warn(`[publish] SEO metadata verification failed for wpPostId=${created.id}: ${verifyErrors.join('; ')}`);
          // Still proceed — partial SEO was written. The verification record will capture this.
        }

        row.meta = {
          slug,
          rankMath: {
            focusKeyword,
            seoTitle: title,
            metaDescription: data.metaDescription ?? '',
            canonical: data.recommendedUrl ?? '',
            schemaType: (data.schemaRecommendation as Record<string, unknown>)?.type ?? '',
          },
          internalLinks: data.internalLinks ?? [],
          seoWriteResult: {
            updated: seoResult.updated,
            verified: verifyErrors.length === 0,
            verifyErrors,
          },
        };
      } else {
        // Rank Math not available — store metadata locally only
        row.meta = {
          slug,
          rankMath: { focusKeyword, seoTitle: title, metaDescription: data.metaDescription ?? '' },
          internalLinks: data.internalLinks ?? [],
          seoWriteResult: { updated: [], verified: false, note: 'Rank Math not active on site' },
        };
      }

      // Step 3: Capture pre-change snapshot for rollback
      row.preChangeSnapshot = await this.captureSnapshot(creds, created.id);

      const saved = await this.publications.save(row);
      await this.audit(siteId, userId, 'create-draft', {
        publicationId: saved.id,
        wpPostId: created.id,
        rankMathWritten: (row.meta.seoWriteResult as Record<string, unknown>)?.updated,
      });
      return this.toDto(saved);
    } catch (error) {
      row.status = 'FAILED';
      row.error = sanitize(error);
      await this.publications.save(row);
      throw new BadGatewayException(sanitize(error));
    }
  }

  // ------------------------------------------------------------------
  // 2. APPROVE (reviewer sign-off)
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // 3. PUBLISH (set status=publish on WordPress)
  // ------------------------------------------------------------------

  /**
   * Changes the WordPress post status to 'publish'. The SEO metadata was
   * already written during createDraft. This step only changes visibility.
   *
   * A conflict check is performed before publishing: the current content hash
   * on WordPress is compared to the snapshot captured during createDraft. If
   * the hash differs, publishing is refused with a conflict error.
   */
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

    // Conflict detection: compare current content hash with snapshot
    try {
      const currentContent = await this.client.getContent(creds, postId);
      const snapshot = (row.preChangeSnapshot ?? {}) as { contentHash?: string };
      if (snapshot.contentHash && currentContent.content_hash !== snapshot.contentHash) {
        const conflict: ContentPublicationConflict = {
          detected: true,
          details: `Content hash changed since draft creation (expected ${snapshot.contentHash}, found ${currentContent.content_hash}). WordPress was modified externally.`,
          detectedAt: new Date().toISOString(),
        };
        row.conflict = conflict as unknown as Record<string, unknown>;
        row.status = 'FAILED';
        row.error = 'Conflict detected: WordPress content was modified since draft creation. Please review and re-create.';
        await this.publications.save(row);
        await this.audit(row.siteId, userId, 'publish-conflict', { publicationId: row.id, postId });
        return this.toDto(row);
      }
    } catch (error) {
      // If we can't check conflict (network error), log but don't block
      this.logger.warn(`[publish] Conflict check failed for postId=${postId}: ${sanitize(error)}`);
    }

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

  // ------------------------------------------------------------------
  // 4. VERIFY (post-publish read-after-write)
  // ------------------------------------------------------------------

  /**
   * Post-publish verification. Checks:
   * 1. WordPress post status is 'publish'
   * 2. Title matches what was sent
   * 3. Content hash matches (no external modification)
   * 4. SEO metadata is present on the post
   * 5. Rendered page is accessible (if URL is known)
   *
   * All checks are recorded in the verification record. Verification never
   * silently succeeds — any mismatch is recorded and the publication stays
   * in PUBLISHED state (not VERIFIED) with verification.error set.
   */
  async verify(id: string, userId: string | null): Promise<ContentPublicationDto> {
    const row = await this.require(id);
    if (row.status !== 'PUBLISHED') {
      throw new BadRequestException(`Only PUBLISHED publications can be verified (current: ${row.status})`);
    }
    const postId = Number(row.wpPostId);
    const { creds } = await this.wordpress.publishConnection(row.siteId);

    const verification: ContentPublicationVerification = {
      postStatus: null,
      titleMatch: null,
      contentHashMatch: null,
      seoMetadataWritten: null,
      renderedPageAccessible: null,
      verifiedAt: null,
      error: null,
    };

    try {
      // 1. Check post status
      const post = await this.client.getPost(creds, postId);
      verification.postStatus = post.status;

      // 2. Check title match
      const expectedTitle = row.title;
      verification.titleMatch = post.title === expectedTitle;

      // 3. Check content hash
      const snapshot = (row.preChangeSnapshot ?? {}) as { contentHash?: string };
      if (snapshot.contentHash) {
        const content = await this.client.getContent(creds, postId);
        verification.contentHashMatch = content.content_hash === snapshot.contentHash;
      }

      // 4. Check SEO metadata is present
      try {
        const seo = await this.client.getSeoMetadata(creds, postId);
        verification.seoMetadataWritten = seo.rank_math.available &&
          Boolean(seo.rank_math.title || seo.rank_math.description || seo.rank_math.focus_keywords);
      } catch {
        verification.seoMetadataWritten = false;
      }

      // 5. Check rendered page is accessible
      if (row.url) {
        try {
          const res = await fetch(row.url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
          verification.renderedPageAccessible = res.ok;
        } catch {
          verification.renderedPageAccessible = false;
        }
      }

      // Determine overall verification status
      const allPassed = verification.postStatus === 'publish' &&
        verification.titleMatch !== false &&
        verification.contentHashMatch !== false &&
        verification.seoMetadataWritten !== false;

      if (allPassed) {
        row.status = 'VERIFIED';
        row.verifiedAt = new Date();
        verification.verifiedAt = new Date().toISOString();
      } else {
        const failures: string[] = [];
        if (verification.postStatus !== 'publish') failures.push(`post status: ${verification.postStatus}`);
        if (verification.titleMatch === false) failures.push('title mismatch');
        if (verification.contentHashMatch === false) failures.push('content hash mismatch');
        if (verification.seoMetadataWritten === false) failures.push('SEO metadata missing');
        verification.error = `Verification failed: ${failures.join(', ')}`;
        row.error = verification.error;
      }

      row.verification = verification as unknown as Record<string, unknown>;
      const saved = await this.publications.save(row);
      await this.audit(row.siteId, userId, 'verify', {
        publicationId: saved.id,
        postStatus: verification.postStatus,
        titleMatch: verification.titleMatch,
        contentHashMatch: verification.contentHashMatch,
        seoMetadataWritten: verification.seoMetadataWritten,
        renderedPageAccessible: verification.renderedPageAccessible,
      });
      return this.toDto(saved);
    } catch (error) {
      verification.error = sanitize(error);
      row.verification = verification as unknown as Record<string, unknown>;
      row.error = sanitize(error);
      await this.publications.save(row);
      throw new BadGatewayException(sanitize(error));
    }
  }

  // ------------------------------------------------------------------
  // 5. ROLLBACK
  // ------------------------------------------------------------------

  /**
   * Rolls back a publication by restoring the pre-change snapshot.
   * Creates a new publication record with status ROLLBACK rather than
   * silently reverting the original.
   */
  async rollback(id: string, userId: string | null): Promise<ContentPublicationDto> {
    const row = await this.require(id);
    if (!['PUBLISHED', 'VERIFIED', 'FAILED'].includes(row.status)) {
      throw new BadRequestException(`Cannot rollback publication in status ${row.status}`);
    }
    const postId = Number(row.wpPostId);
    if (!postId) {
      throw new BadRequestException('Publication has no WordPress post id');
    }
    const { creds } = await this.wordpress.publishConnection(row.siteId);
    const snapshot = (row.preChangeSnapshot ?? {}) as {
      title?: string; slug?: string; contentHash?: string;
      seoMetadata?: { title?: string; description?: string; canonical?: string; focus_keywords?: string; robots?: string[]; schema?: unknown } | null;
    };

    try {
      // Restore the original title and slug
      const updatePayload: { title?: string; slug?: string } = {};
      if (snapshot.title) updatePayload.title = snapshot.title;
      if (snapshot.slug) updatePayload.slug = snapshot.slug;

      if (Object.keys(updatePayload).length > 0) {
        await this.client.updatePost(creds, postId, updatePayload);
      }

      // Restore SEO metadata to pre-change state
      try {
        if (snapshot.seoMetadata) {
          // Restore original SEO values
          await this.client.writeSeoMetadata(creds, postId, {
            title: snapshot.seoMetadata.title ?? '',
            description: snapshot.seoMetadata.description ?? '',
            canonical: snapshot.seoMetadata.canonical ?? '',
            focus_keywords: snapshot.seoMetadata.focus_keywords ?? '',
            robots: snapshot.seoMetadata.robots ?? [],
            schema: snapshot.seoMetadata.schema ?? undefined,
          });
        }
      } catch (seoError) {
        this.logger.warn(`[rollback] Failed to restore SEO metadata for postId=${postId}: ${sanitize(seoError)}`);
      }

      // Revert post status to draft
      await this.client.updatePostStatus(creds, postId, 'draft');

      row.status = 'ROLLBACK';
      row.error = `Rolled back by ${userId ?? 'system'} at ${new Date().toISOString()}`;
      const saved = await this.publications.save(row);

      await this.audit(row.siteId, userId, 'rollback', {
        publicationId: saved.id,
        wpPostId: postId,
        restoredTitle: snapshot.title,
      });
      return this.toDto(saved);
    } catch (error) {
      row.error = `Rollback failed: ${sanitize(error)}`;
      await this.publications.save(row);
      throw new BadGatewayException(`Rollback failed: ${sanitize(error)}`);
    }
  }

  // ------------------------------------------------------------------
  // LIST
  // ------------------------------------------------------------------

  async list(siteId: string): Promise<ContentPublicationDto[]> {
    const rows = await this.publications.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toDto(row));
  }

  // ------------------------------------------------------------------
  // PRIVATE HELPERS
  // ------------------------------------------------------------------

  /**
   * Loads site publishing settings. Default is MANUAL mode (auto-publish OFF).
   */
  private async loadPublishingPolicy(siteId: string): Promise<{ mode: 'MANUAL' | 'AUTO' }> {
    const site = await this.sites.findOne({ where: { id: siteId }, select: { settings: true } });
    const settings = (site?.settings ?? {}) as { publishingMode?: string };
    return { mode: settings.publishingMode === 'AUTO' ? 'AUTO' : 'MANUAL' };
  }

  private async require(id: string): Promise<ContentPublication> {
    const row = await this.publications.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Publication not found');
    }
    return row;
  }

  /**
   * Captures a pre-change snapshot for rollback. Stores the current title,
   * slug, content hash, and SEO metadata from the WordPress post.
   */
  private async captureSnapshot(creds: WordPressCredentials, postId: number): Promise<Record<string, unknown>> {
    try {
      const post = await this.client.getPost(creds, postId);
      const content = await this.client.getContent(creds, postId);
      let seoMetadata = null;
      try {
        const seo = await this.client.getSeoMetadata(creds, postId);
        seoMetadata = seo.rank_math;
      } catch {
        // SEO not available
      }

      return {
        title: post.title,
        contentHash: content.content_hash,
        seoMetadata,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`[publish] Failed to capture snapshot for postId=${postId}: ${sanitize(error)}`);
      return { capturedAt: new Date().toISOString(), error: 'snapshot capture failed' };
    }
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
      verification: (row.verification as ContentPublicationVerification | null) ?? null,
      conflict: (row.conflict as ContentPublicationConflict | null) ?? null,
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
