import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import type { Repository } from 'typeorm';

type Repo = Repository<any>;

function makeRepo(overrides: Record<string, unknown> = {}) {
  const repo: Repo = {
    findOne: jest.fn().mockResolvedValue(overrides.findOneResult ?? null),
    find: jest.fn().mockResolvedValue(overrides.findResult ?? []),
    findOneBy: jest.fn().mockResolvedValue(overrides.findOneResult ?? null),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: data.id ?? 'id-1' })),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(overrides.rawRows ?? []),
      getRawOne: jest.fn().mockResolvedValue(overrides.rawOne ?? null),
    }),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return repo;
}

function makeService(overrides: Record<string, unknown> = {}) {
  const repos = {
    keywords: makeRepo(overrides.keywords),
    keywordSources: makeRepo(overrides.keywordSources),
    metrics: makeRepo(overrides.metrics),
    clusters: makeRepo(overrides.clusters),
    clusterKeywords: makeRepo(overrides.clusterKeywords),
    mappings: makeRepo(overrides.mappings),
    properties: makeRepo(overrides.properties),
    queryMetrics: makeRepo(overrides.queryMetrics),
    queryPageMetrics: makeRepo(overrides.queryPageMetrics),
    opportunities: makeRepo(overrides.opportunities),
    cannibalizationCases: makeRepo(overrides.cannibalizationCases),
    discoveryJobs: makeRepo(overrides.discoveryJobs),
    crawlRuns: makeRepo(overrides.crawlRuns),
    crawlPages: makeRepo(overrides.crawlPages),
    wpPosts: makeRepo(overrides.wpPosts),
    sites: makeRepo(overrides.sites),
  };
  const ai = { generateStructured: jest.fn().mockResolvedValue({ data: { clusters: [] }, result: {} }) } as any;
  const googleAds = { isAvailable: jest.fn().mockResolvedValue({ available: false }) } as any;
  const activities = { record: jest.fn().mockResolvedValue({}) } as any;

  const service = new KeywordsService(
    repos.keywords,
    repos.keywordSources,
    repos.metrics,
    repos.clusters,
    repos.clusterKeywords,
    repos.mappings,
    repos.properties,
    repos.queryMetrics,
    repos.queryPageMetrics,
    repos.opportunities,
    repos.cannibalizationCases,
    repos.discoveryJobs,
    repos.crawlRuns,
    repos.crawlPages,
    repos.wpPosts,
    repos.sites,
    ai,
    googleAds,
    activities,
  ) as unknown as KeywordsService & { repos: typeof repos };

  Object.assign(service, { repos });
  return service;
}

describe('KeywordsService', () => {
  describe('seed — multi-source merge (Test 113)', () => {
    it('dedupes Arabic hamza variants into one canonical keyword with source association', async () => {
      const svc = makeService();
      // First seed creates a keyword; second seed finds it by hash.
      svc.repos.keywords.findOne
        .mockResolvedValueOnce(null) // first: no existing
        .mockResolvedValueOnce({
          id: 'kw-1', siteId: 's1', keyword: 'شركة إعلانات', normalized: 'شركه اعلانات', source: 'MANUAL', language: 'ar',
          intent: 'REVIEW_REQUIRED', normalizedHash: 'x'.repeat(64), status: 'DISCOVERED',
          createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
        }); // second: existing
      const saved = {
        id: 'kw-1', siteId: 's1', keyword: 'شركة إعلانات', normalized: 'شركه اعلانات', source: 'MANUAL', language: 'ar', status: 'DISCOVERED',
        intent: 'REVIEW_REQUIRED', normalizedHash: 'x'.repeat(64), createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
      };
      svc.repos.keywords.save.mockResolvedValue(saved);

      await svc.seed('s1', { keyword: 'شركة إعلانات', source: 'MANUAL' });
      await svc.seed('s1', { keyword: 'شركة اعلانات', source: 'GSC' });

      // Exactly one canonical keyword created; GSC association recorded.
      expect(svc.repos.keywords.save).toHaveBeenCalledTimes(1);
      expect(svc.repos.keywordSources.save).toHaveBeenCalled();
    });

    it('throws for an empty keyword', async () => {
      const svc = makeService();
      await expect(svc.seed('s1', { keyword: '   ' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('overrideMapping — manual lock (Test 122)', () => {
    it('marks an approved mapping REVIEW_REQUIRED when its URL changes', async () => {
      const mappingRow = {
        id: 'm1', siteId: 's1', url: 'https://example.com/a', status: 'APPROVED',
        manualOverride: true, clusterId: null, keywordId: null,
        source: 'AUTO', createdAt: new Date(), updatedAt: new Date(),
      };
      const svc = makeService({ mappings: { findOneResult: mappingRow } });

      const result = await svc.overrideMapping('s1', 'm1', { url: 'https://example.com/b' }, 'u1');

      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.reason).toContain('review');
    });
  });

  describe('buildContentRequestFromOpportunity (Test 126)', () => {
    it('maps an approved NEW_PAGE opportunity to a CREATE content request without re-entry', async () => {
      const svc = makeService({
        opportunities: {
          findOneResult: { id: 'op1', siteId: 's1', clusterId: 'c1', keywordId: 'kw1', type: 'NEW_PAGE', status: 'APPROVED', targetUrl: 'https://example.com/seo' },
        },
        clusters: { findOneResult: { id: 'c1', intent: 'COMMERCIAL', pageType: 'SERVICE', primaryKeywordId: 'kw1' } },
        clusterKeywords: { findResult: [{ clusterId: 'c1', keywordId: 'kw1', role: 'PRIMARY' }, { clusterId: 'c1', keywordId: 'kw2', role: 'SECONDARY' }] },
        keywords: { findResult: [{ id: 'kw1', keyword: 'seo services' }, { id: 'kw2', keyword: 'seo agency' }] },
      });

      const result = await svc.buildContentRequestFromOpportunity('op1');

      expect(result.primaryKeyword).toBe('seo services');
      expect(result.secondaryKeywords).toEqual(['seo agency']);
      expect(result.action).toBe('CREATE');
      expect(result.clusterId).toBe('c1');
      expect(result.intent).toBe('COMMERCIAL');
      expect(result.targetUrl).toBe('https://example.com/seo');
    });

    it('rejects opportunities that are not approved', async () => {
      const svc = makeService({
        opportunities: { findOneResult: { id: 'op1', siteId: 's1', status: 'OPEN' } },
      });
      await expect(svc.buildContentRequestFromOpportunity('op1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('activateMappingAfterPublish (Section 79)', () => {
    it('activates a NEW_PLANNED mapping after verified publication', async () => {
      const svc = makeService({ mappings: { findOneResult: null } });

      await svc.activateMappingAfterPublish('s1', 'c1', 'https://example.com/seo', '55');

      expect(svc.repos.mappings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACTIVE', wpPostId: '55', mappingType: 'NEW_PLANNED' }),
      );
    });

    it('does not silently rewrite an approved mapping whose URL changed (Section 80)', async () => {
      const mappingRow = {
        id: 'm1', siteId: 's1', clusterId: 'c1', url: 'https://example.com/old',
        status: 'APPROVED', manualOverride: true, source: 'AUTO',
        createdAt: new Date(), updatedAt: new Date(),
      };
      const svc = makeService({ mappings: { findOneResult: mappingRow } });

      await svc.activateMappingAfterPublish('s1', 'c1', 'https://example.com/new', '55');

      const saved = svc.repos.mappings.save.mock.calls[0][0];
      expect(saved.status).toBe('REVIEW_REQUIRED');
      expect(saved.reason).toContain('review');
    });
  });

  describe('getCluster / requireSite', () => {
    it('throws NotFoundException for a missing cluster', async () => {
      const svc = makeService();
      svc.repos.clusters.findOne.mockResolvedValue(null);
      await expect(svc.getCluster('s1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
