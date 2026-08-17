import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { hash } from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AiService } from '@creative-seo/ai';
import type { AiGenerationResultDto } from '@creative-seo/types';
import {
  GscProperty,
  Organization,
  Role,
  Site,
  SiteSecret,
  User,
  WordPressIntegration,
  WordPressPost,
} from '@creative-seo/database';
import { AppModule } from '../src/app.module';
import { GscClientService } from '../src/modules/gsc/gsc-client.service';
import { WordPressClientService } from '../src/modules/wordpress/wordpress-client.service';
import { EncryptionService } from '../src/security/encryption.service';

/**
 * PRODUCTION READINESS — E2E SCENARIO
 *
 * Drives the full client lifecycle through the real API (supertest) against a
 * real PostgreSQL database. External integrations (AI providers, Google Search
 * Console, WordPress) are stubbed at the client layer; everything else runs the
 * real application code.
 *
 * Steps that have no backend implementation are recorded as BLOCKED. The gate
 * FAILS until the entire path passes — do not declare production ready while
 * any step is BLOCKED.
 *
 * Run:  npm run test:scenario --workspace=@creative-seo/api
 */

type StepStatus = 'PASS' | 'PARTIAL' | 'SKIP' | 'BLOCKED' | 'FAIL';
interface StepResult {
  name: string;
  status: StepStatus;
  detail: string;
}

const RESULTS: StepResult[] = [];
function record(name: string, status: StepStatus, detail: string): void {
  RESULTS.push({ name, status, detail });
  // eslint-disable-next-line no-console
  console.log(`${status.padEnd(7)} ${name} — ${detail}`);
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const FAKE_RESULT: AiGenerationResultDto = {
  text: 'standardized observation response',
  data: null,
  sources: null,
  summary: null,
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0,
  latencyMs: 1,
  jobId: 'fake-ai-job',
};

function structuredFor(promptName: string, vars: Record<string, string>): unknown {
  const kw = vars.primaryKeyword ?? 'seo services';
  switch (promptName) {
    case 'research':
      return { topic: vars.topic ?? kw, summary: 'Standardized research summary.', sources: [] };
    case 'clustering': {
      let keywords: string[] = [];
      if (vars.keywords) {
        try {
          const parsed = JSON.parse(vars.keywords);
          if (Array.isArray(parsed)) keywords = parsed.map(String);
        } catch {
          keywords = [];
        }
      }
      if (keywords.length === 0) keywords = ['seo services'];
      return { clusters: [{ name: 'SEO Services', description: 'Topical cluster', keywords }] };
    }
    case 'content-evidence-extraction':
      return { claims: [] };
    case 'content-intent-analysis':
      return {
        intent: 'INFORMATIONAL',
        confidence: 0.8,
        rationale: 'Matches informational queries.',
        pageType: 'BLOG_ARTICLE',
        audience: 'Decision makers',
        buyingStage: 'awareness',
        keyQuestions: [`What is ${kw}?`],
        relatedTopics: [],
      };
    case 'content-aeo-questions':
      return {
        directAnswer: `A short, quotable direct answer about ${kw}.`,
        questions: [],
        definitions: [],
        comparisons: [],
        processes: [],
        decisionCriteria: [],
        commercialQuestions: [],
      };
    case 'content-geo-entities':
      return {
        entities: [{ name: kw, type: 'Service', description: 'A service offering.' }],
        relationships: [],
        keyFacts: ['Standardized fact.'],
        attributionNeeds: [],
        originalInsights: [],
        machineReadableData: [],
      };
    case 'content-gap-analysis':
      return { gaps: [], strengths: ['Baseline coverage'], opportunities: [] };
    case 'content-brief':
      return {
        title: `Guide to ${kw}`,
        intent: 'INFORMATIONAL',
        pageType: 'BLOG_ARTICLE',
        targetAudience: 'Decision makers',
        primaryKeyword: kw,
        secondaryKeywords: ['seo agency', 'best seo services'],
        recommendedUrl: 'https://scenario.example.com/guide',
        seoTitle: `How to Choose the Best ${kw} in 2026`,
        metaDescription: `A practical, up-to-date guide to ${kw}. Covers what to look for, typical costs and common pitfalls to avoid.`,
        h1: `A Complete Guide to ${kw}`,
        outline: [
          { heading: 'What to look for', purpose: 'Criteria', points: ['a'] },
          { heading: 'Typical costs', purpose: 'Budget', points: ['b'] },
          { heading: 'How to choose', purpose: 'Decision', points: ['c'] },
        ],
        keyQuestions: [],
        entities: [],
        competitorSummary: '',
        existingPageAssessment: '',
        searchVolumeContext: null,
        notes: [],
      };
    case 'content-brief-gate':
      return { approved: true, score: 90, reasons: ['Complete, executable brief.'], blockers: [] };
    case 'content-outline':
      return {
        sections: [
          { heading: 'Introduction', headingLevel: 'h2', purpose: 'Hook', points: ['x'] },
          { heading: 'Key considerations', headingLevel: 'h2', purpose: 'Body', points: ['y'] },
        ],
        h1: `A Complete Guide to ${kw}`,
        estimatedWordCount: 600,
        coverage: [],
      };
    case 'content-draft':
      return {
        htmlContent: `<h1>A Complete Guide to ${kw}</h1><p>This page explains the essentials clearly.</p>`,
        wordCount: 12,
        sectionsCount: 1,
        usedSources: [],
        directAnswerProvided: true,
      };
    case 'content-language-editor':
      return {
        correctedHtml: `<h1>A Complete Guide to ${kw}</h1><p>This page explains the essentials clearly.</p>`,
        passed: true,
        notes: [],
      };
    case 'content-seo-validator':
    case 'content-aeo-validator':
    case 'content-geo-validator':
      return { metrics: [{ id: 'm1', label: 'Sample metric', score: 90, passed: true, details: 'ok' }], overallScore: 90, passed: true, recommendations: [] };
    case 'content-rankmath-validator':
      return {
        focusKeyword: kw,
        focusKeywords: [kw],
        seoTitle: `How to Choose the Best ${kw} in 2026`,
        metaDescription: 'meta',
        slug: 'guide',
        scoreTarget: 80,
        scoreActual: 85,
        recommendations: [],
        note: 'internal check',
      };
    case 'content-factual-validator':
      return { claims: [], recommendations: [] };
    case 'content-internal-links':
      return { links: [] };
    case 'content-final-qa':
      return { overallScore: 90, passed: true, mustFix: [], shouldFix: [], approvedForPublication: true };
    default:
      return {};
  }
}

class FakeAiService {
  generateStructured<T>(promptName: string, vars: Record<string, string>): Promise<{ data: T; result: AiGenerationResultDto }> {
    return Promise.resolve({ data: structuredFor(promptName, vars) as T, result: FAKE_RESULT });
  }

  generateText(): Promise<AiGenerationResultDto> {
    return Promise.resolve(FAKE_RESULT);
  }
}

const fakeGsc = {
  buildAuthorizeUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?fake=1',
  exchangeCode: async () => ({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 }),
  listSites: async () => [{ siteUrl: 'sc-domain:scenario.example.com', permissionLevel: 'full', type: 'DOMAIN' }],
  searchAnalytics: async () => ({ rows: [], totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 } }),
  refreshAccessToken: async () => ({ access_token: 'fake-access', expires_in: 3600 }),
};

const fakeWordPressClient = {
  createDraft: async (_creds: unknown, input: { title: string; content: string }) => ({
    id: 9001,
    link: 'https://scenario.example.com/draft',
    status: 'draft',
    title: input.title,
  }),
  updatePostStatus: async () => ({ id: 9001, link: 'https://scenario.example.com/published', status: 'publish' }),
  getPost: async () => ({ id: 9001, link: 'https://scenario.example.com/published', status: 'publish', title: 'Published' }),
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('Production readiness E2E scenario', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: ReturnType<typeof request>;
  let accessToken = '';
  let siteId = '';
  let issueId = '';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue(new FakeAiService() as unknown as AiService)
      .overrideProvider(GscClientService)
      .useValue(fakeGsc)
      .overrideProvider(WordPressClientService)
      .useValue(fakeWordPressClient as never)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
    await app.init();
    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);

    await setupActorAndSite();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setupActorAndSite(): Promise<void> {
    const users: Repository<User> = dataSource.getRepository(User);
    const roles: Repository<Role> = dataSource.getRepository(Role);
    const orgs: Repository<Organization> = dataSource.getRepository(Organization);

    const email = `scenario-${Date.now()}@example.com`;
    const password = 'Scenario!2026';
    const role = await roles.findOneBy({ key: 'SUPER_ADMIN' });
    if (!role) throw new Error('SUPER_ADMIN role missing — run migrations first');

    const org = await orgs.save(orgs.create({ name: `Scenario Org ${Date.now()}`, slug: `scenario-${Date.now()}` }));
    const user = await users.save(
      users.create({ email, passwordHash: await hash(password, 10), fullName: 'Scenario Admin', type: 'AGENCY', status: 'ACTIVE', organizationId: org.id, roles: [role] }),
    );

    const login = await http.post('/api/auth/login').send({ email, password });
    accessToken = login.body?.data?.accessToken;
    if (!accessToken) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);

    const domain = `scenario-${Date.now()}.example.com`;
    const siteRes = await http
      .post('/api/sites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationId: org.id, name: 'Scenario Client', domain, locale: 'en', language: 'English' });
    siteId = siteRes.body?.data?.id;
    if (!siteId) throw new Error(`Site create failed: ${JSON.stringify(siteRes.body)}`);

    // The site-create flow already grants the creator an OWNER membership.
    // Add a WORDPRESS secret so the publish flow can resolve credentials.
    const secrets = dataSource.getRepository(SiteSecret);
    const encryption = app.get(EncryptionService);
    const encrypted = encryption.encrypt(JSON.stringify({ url: `https://${domain}`, username: 'admin', password: 'publish-secret' }));
    await secrets.save(secrets.create({ siteId, kind: 'WORDPRESS', label: 'scenario', encryptedPayload: encrypted, meta: {} }));

    (globalThis as { __scenario?: { email: string; password: string } }).__scenario = { email, password };
  }

  const get = (path: string) => http.get(`/api${path}`).set('Authorization', `Bearer ${accessToken}`);
  const post = (path: string, body: unknown) => http.post(`/api${path}`).set('Authorization', `Bearer ${accessToken}`).send(body as Record<string, unknown>);
  const put = (path: string, body: unknown) => http.put(`/api${path}`).set('Authorization', `Bearer ${accessToken}`).send(body as Record<string, unknown>);

  it('runs the full client lifecycle scenario', async () => {
    const domain = `scenario-${Date.now()}.example.com`;
    const s = (path: string) => `/sites/${siteId}${path}`;

    // 1. Add Site (done in setup) — verify it exists
    const siteRes = await get('/sites');
    record('01 Add Site', siteRes.status === 200 && JSON.stringify(siteRes.body).includes(siteId) ? 'PASS' : 'FAIL', 'site created & listed');

    // 2. Connect WordPress (external connector stubbed at the data layer)
    const integrations = dataSource.getRepository(WordPressIntegration);
    await integrations.save(
      integrations.create({ siteId, status: 'CONNECTED', wpUrl: `https://${domain}`, wpVersion: '6.5', phpVersion: '8.2', rankMathDetected: true }),
    );
    record('02 Connect WordPress', 'PARTIAL', 'integration row created (real connector requires a live WP site)');

    // 3. Import Pages (simulated sync)
    const posts = dataSource.getRepository(WordPressPost);
    for (let i = 1; i <= 2; i += 1) {
      await posts.save(
        posts.create({ siteId, wpPostId: `${1000 + i}`, postType: 'page', url: `https://${domain}/page-${i}`, slug: `page-${i}`, status: 'publish', title: `Page ${i}`, contentHash: `hash-${i}`, modifiedAt: new Date(), meta: {}, rankMath: {} }),
      );
    }
    record('03 Import Pages', 'PARTIAL', '2 pages imported (simulated connector sync)');

    // 4. Crawl — ingest crawled content + link graph
    const crawlRes = await post(`${s('/links/crawl-pages')}`, {
      url: `https://${domain}/home`,
      title: 'Home',
      httpStatus: 200,
      text: 'This is the home page about seo services and keyword research.',
      headings: ['Home'],
      outLinks: [{ url: `https://${domain}/page-1`, anchor: 'seo services' }],
    });
    record('04 Crawl', crawlRes.status < 400 ? 'PASS' : 'FAIL', 'crawled page ingested (real crawl runs via n8n/crawler)');

    // 5. Initial Audit — deterministic link analysis
    const auditRes = await post(`${s('/links/analyses')}`, {});
    record('05 Initial Audit', auditRes.status < 400 && auditRes.body?.data?.analysis ? 'PASS' : 'FAIL', 'link analysis completed');

    // 6. Connect GSC — register tokens + select property (client stubbed)
    const tokensRes = await post(`${s('/gsc/tokens')}`, { accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresIn: 3600 });
    const propRes = await put(`${s('/gsc/selected-property')}`, { siteUrl: 'sc-domain:scenario.example.com', type: 'DOMAIN' });
    const gscOk = tokensRes.status < 400 && propRes.status < 400;
    record('06 Connect GSC', gscOk ? 'PASS' : 'FAIL', `tokens=${tokensRes.status}, property=${propRes.status} (client stubbed)`);

    // 7. Build Baseline — immutable snapshot
    const metrics = {
      crawlHealth: 80,
      technicalIssues: 3,
      onPageHealth: 60,
      contentHealth: 50,
      aeoReadiness: 40,
      geoReadiness: 35,
      gscMetrics: { clicks: 100, impressions: 5000, ctr: 0.02, avgPosition: 15 },
      keywordVisibility: 20,
      internalLinkHealth: 55,
    };
    const baselineRes = await post(`${s('/monitoring/snapshots')}`, { type: 'BASELINE', metrics });
    record('07 Build Baseline', baselineRes.status < 400 && baselineRes.body?.data?.isBaseline === true ? 'PASS' : 'FAIL', 'baseline snapshot saved');

    // 8-10. Keyword discovery / clustering / URL mapping
    const kwPipelineRes = await post(`${s('/keywords/pipeline')}`, { keywords: ['seo services', 'keyword research'] });
    const pipelineResult = kwPipelineRes.body?.data;
    record('08 Discover Keywords', kwPipelineRes.status < 400 && pipelineResult?.clusters?.length ? 'PASS' : 'FAIL', `status=${kwPipelineRes.status} keywords=${pipelineResult?.createdKeywords ?? 0}`);
    record('09 Cluster', pipelineResult?.clusters?.length ? 'PASS' : 'FAIL', `clusters=${pipelineResult?.clusters?.length ?? 0}`);
    const clusterId = pipelineResult?.clusters?.[0]?.id;
    const approveRes = await post(`${s(`/keywords/clusters/${clusterId}/approve`)}`, {});
    record('10 Map URLs', approveRes.status < 400 && approveRes.body?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL', `approved=${approveRes.body?.data?.status ?? 'n/a'}`);

    // 11-13. Brief / Content / QA — content intelligence pipeline (AI stubbed)
    const pipelineRes = await post(`${s('/content/pipeline')}`, { primaryKeyword: 'seo services', language: 'en' });
    const pipeline = pipelineRes.body?.data;
    const pipelineOk = pipelineRes.status < 400 && pipeline?.id;
    record('11 Create Brief', pipelineOk && pipeline?.brief?.title ? 'PASS' : 'FAIL', `pipeline=${pipelineRes.status} status=${pipeline?.status ?? 'n/a'}`);
    record(
      '12 Generate Content',
      pipelineOk && pipeline?.htmlContent ? 'PASS' : 'FAIL',
      `status=${pipeline?.status ?? 'n/a'} html=${typeof pipeline?.htmlContent} len=${String(pipeline?.htmlContent ?? '').length}`,
    );
    const qa = pipeline?.scores;
    record('13 QA', pipelineOk && qa?.seo && qa?.aeo && qa?.geo && qa?.factual ? 'PASS' : 'FAIL', 'internal SEO/AEO/GEO/factual scores present');

    // 14-17. WP draft / approve / publish / verify
    const packageId = pipeline?.id;
    const draftRes = await post(`${s(`/content/packages/${packageId}/publish`)}`, {});
    const publication = draftRes.body?.data;
    record('14 Create WP Draft', draftRes.status < 400 && publication?.status === 'DRAFT' && publication?.wpPostId ? 'PASS' : 'FAIL', `status=${publication?.status ?? draftRes.status} ${JSON.stringify(draftRes.body)}`);
    const pubId = publication?.id;
    const approvePubRes = await post(`${s(`/content/publications/${pubId}/approve`)}`, {});
    record('15 Approve', approvePubRes.body?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL', `status=${approvePubRes.body?.data?.status ?? 'n/a'}`);
    const publishPubRes = await post(`${s(`/content/publications/${pubId}/publish`)}`, {});
    record('16 Publish', publishPubRes.body?.data?.status === 'PUBLISHED' ? 'PASS' : 'FAIL', `status=${publishPubRes.body?.data?.status ?? 'n/a'}`);
    const verifyPubRes = await post(`${s(`/content/publications/${pubId}/verify`)}`, {});
    record('17 Verify', verifyPubRes.body?.data?.status === 'VERIFIED' ? 'PASS' : 'FAIL', `status=${verifyPubRes.body?.data?.status ?? 'n/a'}`);

    // 18. Track Performance — dashboard + GSC performance
    const perfRes = await get(`${s('/monitoring/dashboard')}`);
    record('18 Track Performance', perfRes.status === 200 ? 'PASS' : 'FAIL', 'progress dashboard available');

    // 19. Detect Issue — alert evaluation creates alert + issue + recommendation
    const alertRes = await post(`${s('/monitoring/alerts/evaluate')}`, { traffic: { clicks: 60, prevClicks: 100 } });
    const created = alertRes.body?.data?.[0];
    record('19 Detect Issue', alertRes.status < 400 && created?.issueId ? 'PASS' : 'FAIL', 'alert -> issue created');

    // 20. Create Recommendation — operations recommendation for a manual issue
    const issueRes = await post(`${s('/operations/issues')}`, { kind: 'MANUAL', severity: 'HIGH', title: 'Improve meta descriptions', description: 'Client-facing issue.' });
    issueId = issueRes.body?.data?.id;
    record('20a Create Issue', issueRes.status < 400 && issueId ? 'PASS' : 'FAIL', `status=${issueRes.status} ${JSON.stringify(issueRes.body)}`);
    const recRes = await post(`${s('/operations/recommendations')}`, {
      issueId,
      title: 'Rewrite meta descriptions',
      evidence: 'Multiple pages have thin meta descriptions.',
      impact: 70,
      confidence: 80,
      effort: 30,
      aiExplain: false,
    });
    record('20 Create Recommendation', recRes.status < 400 && recRes.body?.data?.priority ? 'PASS' : 'FAIL', `status=${recRes.status} ${JSON.stringify(recRes.body)}`);

    // 21. Complete Task — create + mark DONE
    const taskRes = await post(`${s('/operations/tasks')}`, { title: 'Rewrite meta descriptions', issueId, url: `https://${domain}/home`, internalNotes: 'internal', clientNotes: 'client-facing summary' });
    const taskId = taskRes.body?.data?.id;
    const doneRes = await put(`${s(`/operations/tasks/${taskId}`)}`, { status: 'DONE' });
    record('21 Complete Task', doneRes.status < 400 && doneRes.body?.data?.status === 'DONE' ? 'PASS' : 'FAIL', 'task completed');

    // 22. Generate Monthly Report — HTML saved permanently (PDF degrades gracefully)
    const reportRes = await post(`${s('/reporting/reports')}`, { type: 'MONTHLY' });
    record('22 Generate Monthly Report', reportRes.status < 400 && reportRes.body?.data?.id ? 'PASS' : 'FAIL', `status=${reportRes.body?.data?.status ?? 'n/a'}`);

    // -------------------------------------------------------------------
    // GATE: production readiness requires the FULL path to pass.
    // -------------------------------------------------------------------
    const blocked = RESULTS.filter((step) => step.status === 'BLOCKED');
    const failed = RESULTS.filter((step) => step.status === 'FAIL');
    // eslint-disable-next-line no-console
    console.table(RESULTS);
    const summary = {
      pass: RESULTS.filter((step) => step.status === 'PASS').length,
      partial: RESULTS.filter((step) => step.status === 'PARTIAL').length,
      blocked: blocked.map((step) => step.name),
      failed: failed.map((step) => step.name),
    };
    // eslint-disable-next-line no-console
    console.log(`SCENARIO SUMMARY: ${JSON.stringify(summary)}`);
    if (failed.length > 0 || blocked.length > 0) {
      const reasons = [
        ...failed.map((step) => `${step.name} FAILED: ${step.detail}`),
        ...blocked.map((step) => `${step.name} BLOCKED: ${step.detail}`),
      ];
      throw new Error(`Production readiness gate NOT passed.\n${reasons.map((reason) => `  - ${reason}`).join('\n')}`);
    }
    expect(true).toBe(true);
  });
});
