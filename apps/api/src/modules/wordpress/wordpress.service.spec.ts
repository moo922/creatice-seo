import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import {
  Site,
  SiteSecret,
  WordPressIntegration,
  WordPressPost,
} from '@creative-seo/database';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { EncryptionService } from '../../security/encryption.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import type { ConnectorPostItem } from './wordpress-client.service';
import { WordPressService } from './wordpress.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34' }]),
}));

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';

const ACTOR: AuthPrincipal = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'editor@example.com',
  fullName: 'Editor',
  type: 'CLIENT',
  status: 'ACTIVE',
  organizationId: ORG_ID,
  roles: ['SEO_MANAGER'],
  permissions: ['wordpress:read', 'wordpress:manage'],
};

const CREDS = { url: 'https://example.com', username: 'u', password: 'p' };

const POST_ITEM: ConnectorPostItem = {
  wp_post_id: 7,
  post_type: 'post',
  url: 'https://example.com/hello',
  slug: 'hello',
  status: 'publish',
  title: 'Hello',
  content_hash: 'abc123',
  modified: '2024-01-02T03:04:05',
  modified_ts: 1704164645,
  seo: { available: true, title: 'Hello', description: '', canonical: '', robots: [], focus_keywords: '', schema: null },
};

type AnyRepo = Record<string, unknown>;

function mockRepo(): AnyRepo {
  return {
    create: jest.fn((entity: Record<string, unknown>) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => ({
      id: 'integration-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...entity,
    })),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as AnyRepo;
}

function buildService(overrides: {
  integrations?: Partial<AnyRepo>;
  posts?: Partial<AnyRepo>;
  sites?: Partial<AnyRepo>;
  secrets?: Partial<AnyRepo>;
  client?: Record<string, jest.Mock>;
}) {
  const repos = {
    integrations: mockRepo(),
    posts: mockRepo(),
    sites: mockRepo(),
    secrets: mockRepo(),
  };
  Object.assign(repos.integrations, overrides.integrations);
  Object.assign(repos.posts, overrides.posts);
  Object.assign(repos.sites, overrides.sites);
  Object.assign(repos.secrets, overrides.secrets);

  const client = {
    siteRootReachable: jest.fn().mockResolvedValue({ reachable: true, status: 200 }),
    info: jest.fn().mockResolvedValue({ wp_version: '6.4.2', php_version: '8.2.0' }),
    rankMath: jest.fn().mockResolvedValue({ detected: true, version: '1.0.219', meta_keys: {} }),
    permissions: jest
      .fn()
      .mockResolvedValue({ authenticated: true, can_read: true, can_write: true, can_manage: true }),
    plugins: jest.fn().mockResolvedValue({ plugins: [], total: 0 }),
    postTypes: jest.fn().mockResolvedValue({ post_types: [{ name: 'post', label: 'Posts' }], total: 1 }),
    listPosts: jest.fn().mockResolvedValue({ items: [POST_ITEM], total: 1, page: 1, per_page: 100, total_pages: 1 }),
    ...overrides.client,
  };

  const encryption = { decrypt: jest.fn().mockReturnValue(JSON.stringify(CREDS)) } as unknown as EncryptionService;
  const siteAccess = { assertSiteAccess: jest.fn().mockResolvedValue(undefined) } as unknown as SiteAccessService;
  const activities = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityLogService;

  const service = new WordPressService(
    repos.integrations as unknown as WordPressIntegrationRepository,
    repos.posts as unknown as WordPressPostRepository,
    repos.sites as unknown as SiteRepository,
    repos.secrets as unknown as SiteSecretRepository,
    client as unknown as never,
    encryption,
    siteAccess,
    activities,
  );

  return { service, repos, client, activities };
}

type WordPressIntegrationRepository = Repository<WordPressIntegration>;
type WordPressPostRepository = Repository<WordPressPost>;
type SiteRepository = Repository<Site>;
type SiteSecretRepository = Repository<SiteSecret>;

describe('WordPressService', () => {
  describe('checkConnection', () => {
    it('runs the onboarding steps in order and marks the integration CONNECTED', async () => {
      const { service, repos, activities } = buildService({
        sites: {
          findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }),
        },
        secrets: {
          findOne: jest.fn().mockResolvedValue({ encryptedPayload: 'enc:data' }),
        },
        integrations: {
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.checkConnection(SITE_ID, ACTOR, {});

      expect(result.passed).toBe(true);
      expect(result.integration.status).toBe('CONNECTED');
      expect(result.steps.map((step) => step.key)).toEqual([
        'wordpress_reachable',
        'connector_reachable',
        'rank_math',
        'permissions',
      ]);
      expect(result.steps.every((step) => step.status === 'ok')).toBe(true);
      expect(repos.integrations.save).toHaveBeenCalled();
      expect(activities.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'wordpress.check', siteId: SITE_ID, userId: ACTOR.id }),
      );
    });

    it('fails the check when the WordPress site is unreachable', async () => {
      const { service, client } = buildService({
        sites: { findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }) },
        secrets: { findOne: jest.fn().mockResolvedValue({ encryptedPayload: 'enc:data' }) },
        integrations: { findOne: jest.fn().mockResolvedValue(null) },
        client: {
          siteRootReachable: jest.fn().mockResolvedValue({ reachable: false, status: null }),
        },
      });

      const result = await service.checkConnection(SITE_ID, ACTOR, {});

      expect(result.passed).toBe(false);
      expect(result.integration.status).toBe('FAILED');
      expect(result.steps[0]).toMatchObject({ key: 'wordpress_reachable', status: 'failed' });
      expect(client.info).not.toHaveBeenCalled();
    });

    it('throws BadRequest when no WORDPRESS secret exists for the site', async () => {
      const { service } = buildService({
        sites: { findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }) },
        secrets: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.checkConnection(SITE_ID, ACTOR, {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sync', () => {
    it('creates imported posts on first sync', async () => {
      const { service, repos } = buildService({
        sites: { findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }) },
        secrets: { findOne: jest.fn().mockResolvedValue({ encryptedPayload: 'enc:data' }) },
        integrations: { findOne: jest.fn().mockResolvedValue(null) },
        posts: { findOne: jest.fn().mockResolvedValue(null) },
      });

      const result = await service.sync(SITE_ID, {}, ACTOR, {});

      expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0, total: 1, postTypes: ['post'] });
      expect(repos.posts.save).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: SITE_ID, wpPostId: '7', contentHash: 'abc123' }),
      );
    });

    it('is idempotent: unchanged posts are counted, not duplicated', async () => {
      const existing = {
        id: 'row-1',
        siteId: SITE_ID,
        wpPostId: '7',
        postType: 'post',
        url: POST_ITEM.url,
        slug: POST_ITEM.slug,
        status: POST_ITEM.status,
        title: POST_ITEM.title,
        contentHash: POST_ITEM.content_hash,
        rankMath: {},
        modifiedAt: new Date(POST_ITEM.modified_ts * 1000),
      };
      const { service } = buildService({
        sites: { findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }) },
        secrets: { findOne: jest.fn().mockResolvedValue({ encryptedPayload: 'enc:data' }) },
        integrations: { findOne: jest.fn().mockResolvedValue(null) },
        posts: { findOne: jest.fn().mockResolvedValue(existing) },
      });

      const result = await service.sync(SITE_ID, {}, ACTOR, {});

      expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1, total: 1 });
    });

    it('records updated when content hash changes', async () => {
      const existing = {
        id: 'row-1',
        siteId: SITE_ID,
        wpPostId: '7',
        postType: 'post',
        url: POST_ITEM.url,
        slug: POST_ITEM.slug,
        status: POST_ITEM.status,
        title: 'Old title',
        contentHash: 'old-hash',
        rankMath: {},
        modifiedAt: new Date(0),
      };
      const { service } = buildService({
        sites: { findOne: jest.fn().mockResolvedValue({ id: SITE_ID, organizationId: ORG_ID }) },
        secrets: { findOne: jest.fn().mockResolvedValue({ encryptedPayload: 'enc:data' }) },
        integrations: { findOne: jest.fn().mockResolvedValue(null) },
        posts: { findOne: jest.fn().mockResolvedValue(existing) },
      });

      const result = await service.sync(SITE_ID, {}, ACTOR, {});

      expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    });
  });
});
