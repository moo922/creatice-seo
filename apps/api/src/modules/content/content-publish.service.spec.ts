import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentPublishService } from './content-publish.service';
import { WordPressClientService } from '../wordpress/wordpress-client.service';
import type { Repository } from 'typeorm';

const NOW = new Date('2025-01-01T00:00:00Z');

function makeRepo(overrides: Record<string, unknown> = {}) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(overrides.findOneResult ?? null),
    find: jest.fn().mockResolvedValue(overrides.findResult ?? []),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockImplementation((data) => Promise.resolve({
      ...data,
      id: data.id ?? 'pub-1',
      createdAt: data.createdAt ?? NOW,
      updatedAt: data.updatedAt ?? NOW,
    })),
  };
  return repo as unknown as Repository<any>;
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    createDraft: jest.fn().mockResolvedValue({ id: 100, link: 'https://example.com/draft', status: 'draft' }),
    updatePostStatus: jest.fn().mockResolvedValue({ id: 100, link: 'https://example.com/post', status: 'publish' }),
    getPost: jest.fn().mockResolvedValue({ id: 100, link: 'https://example.com/post', status: 'publish', title: 'Test Title', content: '<p>Hello</p>' }),
    getContent: jest.fn().mockResolvedValue({ id: 100, content: '<p>Hello</p>', content_hash: 'abc123' }),
    writeSeoMetadata: jest.fn().mockResolvedValue({ updated: ['title', 'description'], post_id: 100, seo: { available: true, title: 'Test', description: 'Desc', canonical: '', robots: [], focus_keywords: 'kw', schema: null } }),
    getSeoMetadata: jest.fn().mockResolvedValue({ id: 100, rank_math: { available: true, title: 'Test Title', description: 'Test Desc', canonical: 'https://example.com', robots: [], focus_keywords: 'keyword', schema: null } }),
    writeContent: jest.fn().mockResolvedValue({ id: 100, content: '<p>Updated</p>', content_hash: 'def456' }),
    getInternalLinks: jest.fn().mockResolvedValue([]),
    rankMath: jest.fn().mockResolvedValue({ detected: true, version: '1.0.0', meta_keys: {} }),
    discoverCapabilities: jest.fn().mockResolvedValue({
      connectorVersion: '1.0.0', wpVersion: '6.4', phpVersion: '8.2',
      rankMathDetected: true, rankMathVersion: '1.0.0',
      canReadPosts: true, canWritePosts: true, canWriteSeoMetadata: true,
      canWriteSchema: true, canReadInternalLinks: true, canWriteContent: true,
      postTypes: ['post', 'page'],
    }),
    updatePost: jest.fn().mockResolvedValue({ id: 100, link: 'https://example.com/updated', status: 'draft', title: 'Original', content_hash: 'abc123' }),
    ...overrides,
  } as unknown as WordPressClientService;
}

function makeWordpress(overrides: Record<string, unknown> = {}) {
  return {
    publishConnection: jest.fn().mockResolvedValue({
      creds: { url: 'https://example.com', username: 'u', password: 'p' },
      integration: { id: 'int-1', rankMathDetected: true },
    }),
    ...overrides,
  } as any;
}

function makeOps() {
  return { createChangeLog: jest.fn().mockResolvedValue({}) } as any;
}

function makeActivities() {
  return { record: jest.fn().mockResolvedValue({}) } as any;
}

function rowWithDates(extra: Record<string, unknown> = {}) {
  return { id: 'pub-1', createdAt: NOW, updatedAt: NOW, ...extra };
}

describe('ContentPublishService', () => {
  describe('createDraft', () => {
    it('creates a WP draft and writes Rank Math SEO metadata', async () => {
      const pkg = {
        id: 'pkg-1', siteId: 'site-1',
        packageData: { draft: { htmlContent: '<p>Content</p>' }, slug: 'test-slug', seoTitle: 'SEO Title', metaDescription: 'Meta Desc', recommendedUrl: 'https://example.com/test' },
        brief: { title: 'Brief Title', primaryKeyword: 'keyword' },
      };
      const packages = makeRepo({ findOneResult: pkg });
      const sites = makeRepo({ findOneResult: { settings: {} } });
      const client = makeClient();
      const wordpress = makeWordpress();
      const publications = makeRepo();

      const service = new ContentPublishService(publications, packages, sites, wordpress, client, makeOps(), makeActivities());
      const result = await service.createDraft('site-1', 'org-1', { packageId: 'pkg-1' }, 'user-1');

      expect(client.createDraft).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ title: 'SEO Title', slug: 'test-slug' }),
      );
      expect(client.writeSeoMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        100,
        expect.objectContaining({ title: 'SEO Title', description: 'Meta Desc', canonical: 'https://example.com/test', focus_keywords: 'keyword' }),
      );
      expect(client.getSeoMetadata).toHaveBeenCalledWith(expect.any(Object), 100);
      expect(client.getPost).toHaveBeenCalled();
      expect(client.getContent).toHaveBeenCalled();
      expect(publications.save).toHaveBeenCalled();
    });

    it('fails if connector lacks write permissions', async () => {
      const pkg = {
        id: 'pkg-1', siteId: 'site-1',
        packageData: { draft: { htmlContent: '<p>Content</p>' }, slug: 'test' },
        brief: { title: 'Title', primaryKeyword: 'kw' },
      };
      const packages = makeRepo({ findOneResult: pkg });
      const sites = makeRepo({ findOneResult: { settings: {} } });
      const client = makeClient({ discoverCapabilities: jest.fn().mockResolvedValue({ canWritePosts: false, rankMathDetected: true }) });
      const wordpress = makeWordpress();
      const publications = makeRepo();

      const service = new ContentPublishService(publications, packages, sites, wordpress, client, makeOps(), makeActivities());
      await expect(service.createDraft('site-1', 'org-1', { packageId: 'pkg-1' }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('stores metadata locally when Rank Math is not active', async () => {
      const pkg = {
        id: 'pkg-1', siteId: 'site-1',
        packageData: { draft: { htmlContent: '<p>Content</p>' }, slug: 'test' },
        brief: { title: 'Title', primaryKeyword: 'kw' },
      };
      const packages = makeRepo({ findOneResult: pkg });
      const sites = makeRepo({ findOneResult: { settings: {} } });
      const client = makeClient({ discoverCapabilities: jest.fn().mockResolvedValue({ canWritePosts: true, rankMathDetected: false }) });
      const wordpress = makeWordpress();
      const publications = makeRepo();

      const service = new ContentPublishService(publications, packages, sites, wordpress, client, makeOps(), makeActivities());
      await service.createDraft('site-1', 'org-1', { packageId: 'pkg-1' }, 'user-1');

      expect(client.writeSeoMetadata).not.toHaveBeenCalled();
      expect(client.createDraft).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing package', async () => {
      const packages = makeRepo({ findOneResult: null });
      const sites = makeRepo();
      const client = makeClient();
      const wordpress = makeWordpress();

      const service = new ContentPublishService(makeRepo(), packages, sites, wordpress, client, makeOps(), makeActivities());
      await expect(service.createDraft('site-1', 'org-1', { packageId: 'missing' }, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when package has no draft HTML', async () => {
      const pkg = rowWithDates({ id: 'pkg-1', siteId: 'site-1', packageData: {}, brief: {} });
      const packages = makeRepo({ findOneResult: pkg });
      const sites = makeRepo();
      const client = makeClient();
      const wordpress = makeWordpress();

      const service = new ContentPublishService(makeRepo(), packages, sites, wordpress, client, makeOps(), makeActivities());
      await expect(service.createDraft('site-1', 'org-1', { packageId: 'pkg-1' }, 'user-1')).rejects.toThrow('no draft HTML');
    });
  });

  describe('approve', () => {
    it('transitions DRAFT to APPROVED', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'DRAFT', siteId: 'site-1', approvedBy: null, approvedAt: null });
      const publications = makeRepo({ findOneResult: row });

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());
      const result = await service.approve('pub-1', 'user-1');

      expect(result.status).toBe('APPROVED');
      expect(publications.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-1' }));
    });

    it('rejects non-DRAFT status', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'PUBLISHED', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.approve('pub-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('publish', () => {
    it('publishes when no conflict detected', async () => {
      const row = rowWithDates({
        id: 'pub-1', status: 'APPROVED', siteId: 'site-1', wpPostId: '100', url: null,
        preChangeSnapshot: { contentHash: 'abc123' }, title: 'Test',
      });
      const publications = makeRepo({ findOneResult: row });
      const client = makeClient();
      const wordpress = makeWordpress();
      const ops = makeOps();

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), wordpress, client, ops, makeActivities());
      const result = await service.publish('pub-1', 'user-1');

      expect(result.status).toBe('PUBLISHED');
      expect(client.updatePostStatus).toHaveBeenCalledWith(expect.any(Object), 100, 'publish');
      expect(ops.createChangeLog).toHaveBeenCalled();
    });

    it('refuses to publish when content hash conflict detected', async () => {
      const row = rowWithDates({
        id: 'pub-1', status: 'APPROVED', siteId: 'site-1', wpPostId: '100', url: null,
        preChangeSnapshot: { contentHash: 'abc123' }, title: 'Test', conflict: null, error: null,
      });
      const publications = makeRepo({ findOneResult: row });
      const client = makeClient({ getContent: jest.fn().mockResolvedValue({ id: 100, content: '<p>Changed</p>', content_hash: 'DIFFERENT' }) });
      const wordpress = makeWordpress();

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), wordpress, client, makeOps(), makeActivities());
      const result = await service.publish('pub-1', 'user-1');

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Conflict detected');
      expect(client.updatePostStatus).not.toHaveBeenCalled();
    });

    it('rejects non-APPROVED status', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'DRAFT', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.publish('pub-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verify', () => {
    it('marks VERIFIED when all checks pass', async () => {
      const row = rowWithDates({
        id: 'pub-1', status: 'PUBLISHED', siteId: 'site-1', wpPostId: '100', url: 'https://example.com/post',
        title: 'Test Title', verification: null, error: null,
        preChangeSnapshot: { contentHash: 'abc123' },
      });
      const publications = makeRepo({ findOneResult: row });
      const client = makeClient();
      global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), client, makeOps(), makeActivities());
      const result = await service.verify('pub-1', 'user-1');

      expect(result.status).toBe('VERIFIED');
      expect(result.verification).toMatchObject({
        postStatus: 'publish',
        titleMatch: true,
        contentHashMatch: true,
        seoMetadataWritten: true,
      });
    });

    it('stays PUBLISHED when title does not match', async () => {
      const row = rowWithDates({
        id: 'pub-1', status: 'PUBLISHED', siteId: 'site-1', wpPostId: '100', url: null,
        title: 'Expected Title', verification: null, error: null,
        preChangeSnapshot: { contentHash: 'abc123' },
      });
      const publications = makeRepo({ findOneResult: row });
      const client = makeClient({ getPost: jest.fn().mockResolvedValue({ id: 100, link: '', status: 'publish', title: 'Wrong Title' }) });

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), client, makeOps(), makeActivities());
      const result = await service.verify('pub-1', 'user-1');

      expect(result.status).toBe('PUBLISHED');
      expect(result.verification?.titleMatch).toBe(false);
      expect(result.verification?.error).toContain('title mismatch');
    });

    it('rejects non-PUBLISHED status', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'APPROVED', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.verify('pub-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rollback', () => {
    it('restores pre-change snapshot and sets status to ROLLBACK', async () => {
      const row = rowWithDates({
        id: 'pub-1', status: 'PUBLISHED', siteId: 'site-1', wpPostId: '100',
        preChangeSnapshot: { title: 'Original', slug: 'original-slug', seoMetadata: { title: 'Old Title', description: 'Old Desc', canonical: '', focus_keywords: 'old', robots: [] } },
        error: null,
      });
      const publications = makeRepo({ findOneResult: row });
      const client = makeClient();
      const wordpress = makeWordpress();

      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), wordpress, client, makeOps(), makeActivities());
      const result = await service.rollback('pub-1', 'user-1');

      expect(result.status).toBe('ROLLBACK');
      expect(client.updatePost).toHaveBeenCalledWith(expect.any(Object), 100, { title: 'Original', slug: 'original-slug' });
      expect(client.writeSeoMetadata).toHaveBeenCalledWith(
        expect.any(Object), 100,
        expect.objectContaining({ title: 'Old Title', description: 'Old Desc', focus_keywords: 'old' }),
      );
      expect(client.updatePostStatus).toHaveBeenCalledWith(expect.any(Object), 100, 'draft');
    });

    it('rejects rollback for DRAFT status', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'DRAFT', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.rollback('pub-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('state machine enforcement', () => {
    it('only allows APPROVED from DRAFT', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'VERIFIED', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.approve('pub-1', 'user-1')).rejects.toThrow('Only DRAFT');
    });

    it('only allows publish from APPROVED', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'DRAFT', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.publish('pub-1', 'user-1')).rejects.toThrow('Only APPROVED');
    });

    it('only allows verify from PUBLISHED', async () => {
      const row = rowWithDates({ id: 'pub-1', status: 'APPROVED', siteId: 'site-1' });
      const publications = makeRepo({ findOneResult: row });
      const service = new ContentPublishService(publications, makeRepo(), makeRepo(), makeWordpress(), makeClient(), makeOps(), makeActivities());

      await expect(service.verify('pub-1', 'user-1')).rejects.toThrow('Only PUBLISHED');
    });
  });
});
