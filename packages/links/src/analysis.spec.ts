import { analyzeLinkGraph } from './analysis';
import type { ApprovedTarget, CrawledPageData } from './graph';

const domain = 'https://example.com';

const page = (url: string, text: string, outLinks: Array<{ url: string; anchor: string }> = [], httpStatus: number | null = null): CrawledPageData => ({
  url,
  text,
  headings: [],
  httpStatus,
  outLinks,
});

const target = (url: string, overrides: Partial<ApprovedTarget> = {}): ApprovedTarget => ({
  url,
  clusterId: 'cluster-a',
  clusterName: 'SEO Tools',
  primaryKeyword: 'seo tools',
  keywords: ['seo tools', 'keyword research'],
  ...overrides,
});

describe('analyzeLinkGraph', () => {
  it('detects orphan pages (approved targets with no internal inlinks)', () => {
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: [page('https://example.com/home', 'we write about seo tools and keyword research here')],
      approvedTargets: [target('https://example.com/seo-tools')],
    });
    expect(result.stats.orphanPages).toBe(1);
    expect(result.suggestions.some((s) => s.detection === 'ORPHAN')).toBe(true);
    const orphan = result.suggestions.find((s) => s.detection === 'ORPHAN')!;
    expect(orphan.sourceUrl).toBe('https://example.com/home');
    expect(orphan.targetUrl).toBe('https://example.com/seo-tools');
    expect(orphan.anchor).toBe('seo tools');
  });

  it('detects weakly linked targets below the threshold', () => {
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: [
        page('https://example.com/home', 'seo tools overview', [{ url: 'https://example.com/seo-tools', anchor: 'seo tools' }]),
        page('https://example.com/blog', 'the best keyword research methods and seo tools'),
      ],
      approvedTargets: [target('https://example.com/seo-tools')],
    });
    expect(result.stats.weakTargets).toBe(1);
    expect(result.suggestions.some((s) => s.detection === 'WEAK_TARGET')).toBe(true);
  });

  it('detects broken internal links to unknown URLs', () => {
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: [
        page('https://example.com/home', 'seo tools', [{ url: 'https://example.com/gone-page', anchor: 'gone' }]),
        page('https://example.com/seo-tools', 'seo tools'),
      ],
      approvedTargets: [target('https://example.com/seo-tools')],
    });
    expect(result.stats.brokenLinks).toBe(1);
    const broken = result.suggestions.find((s) => s.detection === 'BROKEN')!;
    expect(broken.action).toBe('REMOVE_LINK');
    expect(broken.targetUrl).toBe('https://example.com/gone-page');
  });

  it('detects relevant link opportunities between related sources and targets', () => {
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: [
        page('https://example.com/home', 'our guide to seo tools and keyword research for agencies'),
        page('https://example.com/seo-tools', 'seo tools'),
        page('https://example.com/unrelated', 'pricing for consulting services'),
      ],
      approvedTargets: [target('https://example.com/seo-tools')],
    });
    expect(result.stats.opportunities).toBeGreaterThan(0);
    const opportunity = result.suggestions.find((s) => s.detection === 'OPPORTUNITY')!;
    expect(opportunity.sourceUrl).toBe('https://example.com/home');
    expect(opportunity.action).toBe('ADD_LINK');
    expect(opportunity.confidence).toBeGreaterThan(0);
  });

  it('never suggests self-links', () => {
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: [page('https://example.com/seo-tools', 'the page about seo tools and keyword research')],
      approvedTargets: [target('https://example.com/seo-tools')],
    });
    for (const suggestion of result.suggestions) {
      expect(suggestion.sourceUrl === suggestion.targetUrl).toBe(false);
    }
  });

  it('detects overused anchors and conflicting links', () => {
    const pages = [
      page('https://example.com/a', 'seo tools a', [
        { url: 'https://example.com/seo-tools', anchor: 'seo tools' },
        { url: 'https://example.com/seo-tools-alt', anchor: 'seo tools' },
      ]),
      page('https://example.com/b', 'seo tools b', [{ url: 'https://example.com/seo-tools', anchor: 'seo tools' }]),
      page('https://example.com/c', 'seo tools c', [{ url: 'https://example.com/seo-tools', anchor: 'seo tools' }]),
      page('https://example.com/seo-tools', 'the main seo tools page'),
      page('https://example.com/seo-tools-alt', 'the alternative seo tools page'),
    ];
    const result = analyzeLinkGraph({
      siteDomain: domain,
      crawledPages: pages,
      approvedTargets: [
        target('https://example.com/seo-tools'),
        target('https://example.com/seo-tools-alt', { clusterId: 'cluster-a' }),
      ],
    });
    expect(result.stats.overusedAnchors).toBeGreaterThan(0);
    expect(result.suggestions.some((s) => s.detection === 'OVERUSED_ANCHOR')).toBe(true);
    expect(result.stats.conflictingLinks).toBeGreaterThan(0);
  });
});
