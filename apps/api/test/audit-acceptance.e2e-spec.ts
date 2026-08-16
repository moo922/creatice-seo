/* eslint-disable no-console */
/**
 * AUDIT ACCEPTANCE TEST
 *
 * Runs the full audit lifecycle against a REAL local HTTPS fixture website
 * (not manually inserted records):
 *
 *   Create site → Crawl → Persist crawl run/pages/links → Audit →
 *   Persist audit results → Create issues → (fix fixture) → Re-crawl →
 *   Re-audit → Verify issue resolution → Compare audits
 *
 * Requires: a real PostgreSQL database (migrations applied), the fixture
 * served over self-signed TLS (trusted via NODE_TLS_REJECT_UNAUTHORIZED=0,
 * dev-only) and the private-host crawl override (CRAWLER_ALLOW_PRIVATE_HOSTS).
 *
 * Run:  npm run test:e2e --workspace=@creative-seo/api
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'true';

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { Organization, Role, User } from '@creative-seo/database';
import { AppModule } from '../src/app.module';
import { createFixtureServer, type FixtureServer } from './fixtures/fixture-server';

type StepStatus = 'PASS' | 'FAIL';
interface StepResult {
  name: string;
  status: StepStatus;
  detail: string;
}

const RESULTS: StepResult[] = [];
function record(name: string, status: StepStatus, detail: string): void {
  RESULTS.push({ name, status, detail });
  console.log(`${status.padEnd(5)} ${name} — ${detail}`);
}

describe('Audit acceptance against a real local fixture website', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: ReturnType<typeof request>;
  let fixture: FixtureServer;
  let accessToken = '';
  let siteId = '';
  let domain = '';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
    await app.init();
    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);
    fixture = await createFixtureServer();
    domain = `127.0.0.1:${fixture.port}`;
    await setupActorAndSite();
  });

  afterAll(async () => {
    await fixture?.close();
    await app?.close();
  });

  async function setupActorAndSite(): Promise<void> {
    const users: Repository<User> = dataSource.getRepository(User);
    const roles: Repository<Role> = dataSource.getRepository(Role);
    const orgs: Repository<Organization> = dataSource.getRepository(Organization);

    const email = `audit-${Date.now()}@example.com`;
    const password = 'Audit!2026';
    const role = await roles.findOneBy({ key: 'SUPER_ADMIN' });
    if (!role) throw new Error('SUPER_ADMIN role missing — run migrations first');
    const org = await orgs.save(orgs.create({ name: `Audit Org ${Date.now()}`, slug: `audit-${Date.now()}` }));
    await users.save(users.create({ email, passwordHash: await hash(password, 10), fullName: 'Audit Admin', type: 'AGENCY', status: 'ACTIVE', organizationId: org.id, roles: [role] }));

    const login = await http.post('/api/auth/login').send({ email, password });
    accessToken = login.body?.data?.accessToken;
    if (!accessToken) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);

    const siteRes = await http
      .post('/api/sites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationId: org.id, name: 'Audit Fixture Client', domain, locale: 'en', language: 'English' });
    siteId = siteRes.body?.data?.id;
    if (!siteId) throw new Error(`Site create failed: ${JSON.stringify(siteRes.body)}`);
  }

  const get = (path: string) => http.get(`/api${path}`).set('Authorization', `Bearer ${accessToken}`);
  const post = (path: string, body: unknown) => http.post(`/api${path}`).set('Authorization', `Bearer ${accessToken}`).send(body as Record<string, unknown>);

  async function issues(): Promise<Array<{ ruleKey: string | null; status: string }>> {
    const res = await get(`/sites/${siteId}/operations/issues`);
    return (res.body?.data ?? []).map((issue: { data: { audit?: { ruleKey?: string } }; status: string }) => ({
      ruleKey: issue.data?.audit?.ruleKey ?? null,
      status: issue.status,
    }));
  }

  it('runs the full crawl → audit → fix → re-audit → resolve → compare flow', async () => {
    // 1. Crawl the live fixture site
    const crawlRes = await post(`/sites/${siteId}/links/crawls`, { maxPages: 60 });
    const crawl = crawlRes.body?.data;
    record('Crawl site', crawlRes.status < 400 && crawl?.run?.status === 'COMPLETED' && crawl.pages.length > 0 ? 'PASS' : 'FAIL', `run=${crawl?.run?.status} pages=${crawl?.pages?.length}`);

    // 2. Audit (persist issues)
    const auditRes = await post(`/sites/${siteId}/audit`, { persist: true });
    const audit = auditRes.body?.data;
    record('Audit + create issues', auditRes.status < 400 && audit?.auditRun?.status === 'COMPLETED' && audit.issuesCreated > 0 ? 'PASS' : 'FAIL', `results=${audit?.results?.length} issues=${audit?.issuesCreated}`);

    // 3. Deterministic audit rules fired
    const afterAudit = await issues();
    const keyed = new Set(afterAudit.map((issue) => issue.ruleKey));
    const expectedRules = ['MISSING_TITLE', 'HTTP_4XX', 'HTTP_5XX', 'ORPHAN_PAGE', 'ROBOTS_BLOCKED_PAGE', 'CANONICAL_CONFLICT', 'SCHEMA_PARSE_ERROR', 'DUPLICATE_TITLE'];
    const missing = expectedRules.filter((ruleKey) => !keyed.has(ruleKey));
    record('Audit findings -> issues', missing.length === 0 ? 'PASS' : 'FAIL', missing.length === 0 ? 'expected rules present' : `missing rules: ${missing.join(', ')}`);

    // 4. Capture first history entry + scores
    const history1 = (await get(`/sites/${siteId}/audit/history`)).body?.data ?? [];
    const first = history1[0];
    record('Audit history #1', history1.length >= 1 ? 'PASS' : 'FAIL', `score=${first?.scores?.seoHealth} pages=${first?.pagesCrawled}`);

    // 5. Fix the fixture (on-page issues) and re-crawl
    fixture.setFixed(true);
    const recrawlRes = await post(`/sites/${siteId}/links/crawls`, { maxPages: 60 });
    record('Re-crawl (fixed fixture)', recrawlRes.status < 400 ? 'PASS' : 'FAIL', `pages=${recrawlRes.body?.data?.pages?.length}`);

    // 6. Re-audit
    const reauditRes = await post(`/sites/${siteId}/audit`, { persist: true });
    const reaudit = reauditRes.body?.data;
    record('Re-audit', reauditRes.status < 400 && reaudit?.auditRun?.status === 'COMPLETED' ? 'PASS' : 'FAIL', `issuesUpdated=${reaudit?.issuesUpdated} movedToVerification=${reaudit?.issuesMovedToVerification}`);

    // 7. Verify issue resolution: fixed rules moved to VERIFYING, persistent ones stay open
    const afterFix = await issues();
    const statusByRule = (ruleKey: string) => afterFix.filter((issue) => issue.ruleKey === ruleKey).map((issue) => issue.status);
    const titleMoved = statusByRule('MISSING_TITLE').includes('VERIFYING');
    const dupMoved = statusByRule('DUPLICATE_TITLE').includes('VERIFYING');
    const schemaMoved = statusByRule('SCHEMA_PARSE_ERROR').includes('VERIFYING');
    const brokenMoved = statusByRule('BROKEN_INTERNAL_LINK').includes('VERIFYING');
    const fixedResolved = titleMoved && dupMoved && schemaMoved && brokenMoved;
    record('Issue resolution (fixed rules -> verification)', fixedResolved ? 'PASS' : 'FAIL', `MISSING_TITLE=${statusByRule('MISSING_TITLE').join('/')} DUPLICATE_TITLE=${statusByRule('DUPLICATE_TITLE').join('/')} SCHEMA=${statusByRule('SCHEMA_PARSE_ERROR').join('/')} BROKEN=${statusByRule('BROKEN_INTERNAL_LINK').join('/')}`);

    const server5xxOpen = statusByRule('HTTP_5XX').some((status) => status !== 'VERIFYING' && status !== 'RESOLVED');
    const orphanOpen = statusByRule('ORPHAN_PAGE').some((status) => status !== 'VERIFYING' && status !== 'RESOLVED');
    record('Persistent issues stay open', server5xxOpen && orphanOpen ? 'PASS' : 'FAIL', `HTTP_5XX=${statusByRule('HTTP_5XX').join('/')} ORPHAN=${statusByRule('ORPHAN_PAGE').join('/')}`);

    // 8. Compare audits: history has 2+ entries and on-page health improved
    const history2 = (await get(`/sites/${siteId}/audit/history`)).body?.data ?? [];
    const second = history2[0];
    const improved = second?.scores?.onPageHealth !== null && first?.scores?.onPageHealth !== null && (second?.scores?.onPageHealth ?? 0) >= (first?.scores?.onPageHealth ?? 0);
    record('Compare audits (history + improved on-page health)', history2.length >= 2 && improved ? 'PASS' : 'FAIL', `runs=${history2.length} onPage ${first?.scores?.onPageHealth} -> ${second?.scores?.onPageHealth}`);

    // 9. Audit UI data available (summary + page inspection + run detail)
    const summaryRes = await get(`/sites/${siteId}/audit/summary`);
    const inspectionRes = await get(`/sites/${siteId}/audit/pages?url=${encodeURIComponent(`${fixture.origin}/`)}`);
    const summary = summaryRes.body?.data;
    const inspection = inspectionRes.body?.data;
    record('Audit UI endpoints', summaryRes.status === 200 && summary?.scores && inspectionRes.status === 200 && inspection?.current ? 'PASS' : 'FAIL', `summary scores=${summary?.scores?.seoHealth} page status=${inspection?.current?.httpStatus}`);

    // GATE
    const failed = RESULTS.filter((step) => step.status === 'FAIL');
    console.table(RESULTS);
    if (failed.length > 0) {
      throw new Error(`Audit acceptance gate NOT passed.\n${failed.map((step) => `  - ${step.name}: ${step.detail}`).join('\n')}`);
    }
    expect(true).toBe(true);
  });
});
