import { SiteAccessService } from '../common/guards/site-access.service';
import { SiteAccessGuard } from '../common/guards/site-access.guard';
import type { AuthPrincipal } from '../common/auth.types';
import { isPublicAddress } from '@creative-seo/crawler';
import { EncryptionService } from './encryption.service';

/**
 * GC10 — Security Acceptance Tests
 *
 * Unit tests for SSRF protection, encryption, secret masking, multi-tenancy
 * isolation, and the site-access guard — no NestJS app bootstrap required.
 *
 * Run: npm run test:unit -- --testPathPattern gc10-security
 */

const SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const WRONG_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function principal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    id: 'user-1',
    email: 'user@test.com',
    fullName: 'Test User',
    type: 'OWNER' as any,
    status: 'ACTIVE' as any,
    organizationId: 'org-1',
    roles: ['EDITOR'] as any,
    permissions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SSRF Protection
// ---------------------------------------------------------------------------

describe('GC10 — SSRF Protection', () => {
  it.each([
    ['127.0.0.1', false, 'loopback'],
    ['10.0.0.1', false, 'private 10/8'],
    ['10.255.255.255', false, 'private 10/8 max'],
    ['192.168.1.1', false, 'private 192.168/16'],
    ['172.16.0.1', false, 'private 172.16/12'],
    ['172.31.255.255', false, 'private 172.16/12 max'],
    ['169.254.169.254', false, 'cloud metadata endpoint'],
    ['169.254.0.1', false, 'link-local'],
    ['0.0.0.0', false, 'this network'],
    ['100.64.0.1', false, 'CGNAT'],
    ['198.18.0.1', false, 'benchmarking'],
    ['224.0.0.1', false, 'multicast'],
    ['255.255.255.255', false, 'broadcast'],
    ['192.0.2.1', false, 'TEST-NET-1'],
    ['198.51.100.1', false, 'TEST-NET-2'],
    ['203.0.113.1', false, 'TEST-NET-3'],
    ['8.8.8.8', true, 'Google DNS'],
    ['1.1.1.1', true, 'Cloudflare DNS'],
    ['172.15.0.1', true, 'just below 172.16'],
    ['172.32.0.1', true, 'just above 172.31'],
    ['100.128.0.1', true, 'above CGNAT range'],
  ])('%s -> %s (%s)', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it('blocks IPv6 loopback, link-local, ULA, multicast, documentation', () => {
    expect(isPublicAddress('::1')).toBe(false);
    expect(isPublicAddress('::')).toBe(false);
    expect(isPublicAddress('fe80::1')).toBe(false);
    expect(isPublicAddress('fc00::1')).toBe(false);
    expect(isPublicAddress('fd12:3456::1')).toBe(false);
    expect(isPublicAddress('ff02::1')).toBe(false);
    expect(isPublicAddress('2001:db8::1')).toBe(false);
  });

  it('allows global unicast IPv6', () => {
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true);
  });

  it('decodes IPv4-mapped IPv6 against the private blocklist', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:10.0.0.5')).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

describe('GC10 -- Encryption (AES-256-GCM)', () => {
  it('encrypts and decrypts correctly', () => {
    const svc = new EncryptionService({ env: { ENCRYPTION_KEY: SECRET_KEY } } as any);
    const plaintext = 'my-super-secret-api-key-12345';
    const encrypted = svc.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(svc.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const svc = new EncryptionService({ env: { ENCRYPTION_KEY: SECRET_KEY } } as any);
    const a = svc.encrypt('same-input');
    const b = svc.encrypt('same-input');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same-input');
    expect(svc.decrypt(b)).toBe('same-input');
  });

  it('rejects decryption with the wrong key', () => {
    const svc1 = new EncryptionService({ env: { ENCRYPTION_KEY: SECRET_KEY } } as any);
    const svc2 = new EncryptionService({ env: { ENCRYPTION_KEY: WRONG_KEY } } as any);
    const encrypted = svc1.encrypt('test');
    expect(() => svc2.decrypt(encrypted)).toThrow();
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const svc = new EncryptionService({ env: { ENCRYPTION_KEY: SECRET_KEY } } as any);
    const encrypted = svc.encrypt('original');
    const parts = encrypted.split(':');
    const last = parts[2]!;
    parts[2] = last.slice(0, -1) + (last.endsWith('a') ? 'b' : 'a');
    expect(() => svc.decrypt(parts.join(':'))).toThrow();
  });

  it('rejects malformed payload format', () => {
    const svc = new EncryptionService({ env: { ENCRYPTION_KEY: SECRET_KEY } } as any);
    expect(() => svc.decrypt('not-a-valid-payload')).toThrow();
    expect(() => svc.decrypt('only:two')).toThrow();
    expect(() => svc.decrypt('')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Secret Masking
// ---------------------------------------------------------------------------

describe('GC10 -- Secret Masking', () => {
  function maskValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) return '••••••••';
    if (value.length <= 6) return '••••••';
    return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  }

  it('masks long secrets showing first 2 and last 2 chars', () => {
    expect(maskValue('super-secret-password-123')).toBe('su••••23');
  });

  it('masks short secrets (<=6 chars) fully', () => {
    expect(maskValue('abc')).toBe('••••••');
    expect(maskValue('123456')).toBe('••••••');
  });

  it('masks empty and non-string values as fully redacted', () => {
    expect(maskValue('')).toBe('••••••••');
    expect(maskValue(null)).toBe('••••••••');
    expect(maskValue(undefined)).toBe('••••••••');
    expect(maskValue(42)).toBe('••••••••');
  });

  it('never reveals the original secret value', () => {
    const secret = 'mywordpressapp-password-xyz';
    const masked = maskValue(secret);
    expect(masked).not.toContain('wordpress');
    expect(masked).not.toContain(secret);
    expect(masked.startsWith('my')).toBe(true);
    expect(masked.endsWith('yz')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-tenancy: SiteAccessService
// ---------------------------------------------------------------------------

describe('GC10 -- SiteAccessService (multi-tenancy)', () => {
  function makeService(memberships: { siteId: string; userId: string }[]) {
    const repo = {
      count: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(memberships.filter(m => m.siteId === where.siteId && m.userId === where.userId).length),
      ),
      find: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(memberships.filter(m => m.userId === where.userId).map(m => ({ siteId: m.siteId }))),
      ),
    };
    return new SiteAccessService(repo as any);
  }

  it('allows SUPER_ADMIN to access any site', async () => {
    const svc = makeService([]);
    const user = principal({ roles: ['SUPER_ADMIN'] as any });
    await expect(svc.assertSiteAccess(user, 'any-site')).resolves.toBeUndefined();
  });

  it('allows ADMIN to access any site', async () => {
    const svc = makeService([]);
    const user = principal({ roles: ['ADMIN'] as any });
    await expect(svc.assertSiteAccess(user, 'any-site')).resolves.toBeUndefined();
  });

  it('allows a member to access their own site', async () => {
    const svc = makeService([{ siteId: 'site-A', userId: 'user-1' }]);
    const user = principal();
    await expect(svc.assertSiteAccess(user, 'site-A')).resolves.toBeUndefined();
  });

  it('rejects a non-member accessing a site', async () => {
    const svc = makeService([{ siteId: 'site-A', userId: 'other-user' }]);
    const user = principal();
    await expect(svc.assertSiteAccess(user, 'site-A')).rejects.toThrow('No access to site site-A');
  });

  it('rejects a non-member when no memberships exist', async () => {
    const svc = makeService([]);
    const user = principal();
    await expect(svc.assertSiteAccess(user, 'site-X')).rejects.toThrow();
  });

  it('isGlobal returns true for SUPER_ADMIN', () => {
    const svc = makeService([]);
    expect(svc.isGlobal(principal({ roles: ['SUPER_ADMIN'] as any }))).toBe(true);
  });

  it('isGlobal returns true for ADMIN', () => {
    const svc = makeService([]);
    expect(svc.isGlobal(principal({ roles: ['ADMIN'] as any }))).toBe(true);
  });

  it('isGlobal returns false for EDITOR', () => {
    const svc = makeService([]);
    expect(svc.isGlobal(principal({ roles: ['EDITOR'] as any }))).toBe(false);
  });

  it('isGlobal returns false for VIEWER', () => {
    const svc = makeService([]);
    expect(svc.isGlobal(principal({ roles: ['VIEWER'] as any }))).toBe(false);
  });

  it('isMember returns true when membership exists', async () => {
    const svc = makeService([{ siteId: 'site-A', userId: 'user-1' }]);
    expect(await svc.isMember('site-A', 'user-1')).toBe(true);
  });

  it('isMember returns false when no membership exists', async () => {
    const svc = makeService([]);
    expect(await svc.isMember('site-A', 'user-1')).toBe(false);
  });

  it('memberSiteIds returns all sites a user belongs to', async () => {
    const svc = makeService([
      { siteId: 'site-A', userId: 'user-1' },
      { siteId: 'site-B', userId: 'user-1' },
      { siteId: 'site-C', userId: 'other' },
    ]);
    const ids = await svc.memberSiteIds('user-1');
    expect(ids).toEqual(['site-A', 'site-B']);
  });

  it('memberSiteIds returns empty array for user with no memberships', async () => {
    const svc = makeService([]);
    const ids = await svc.memberSiteIds('user-1');
    expect(ids).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SiteAccessGuard
// ---------------------------------------------------------------------------

describe('GC10 -- SiteAccessGuard', () => {
  it('passes when no user on request (public route)', async () => {
    const mockSiteAccess = {} as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ params: {}, query: {}, body: {} }),
      }),
    } as any;
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('passes when no siteId in request', async () => {
    const mockSiteAccess = {
      assertSiteAccess: jest.fn(),
    } as unknown as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: principal(),
          params: {},
          query: {},
          body: {},
        }),
      }),
    } as any;
    expect(await guard.canActivate(context)).toBe(true);
    expect(mockSiteAccess.assertSiteAccess).not.toHaveBeenCalled();
  });

  it('delegates to SiteAccessService when siteId is present', async () => {
    const mockSiteAccess = {
      assertSiteAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: principal(),
          params: { siteId: 'site-123' },
          query: {},
          body: {},
        }),
      }),
    } as any;
    expect(await guard.canActivate(context)).toBe(true);
    expect(mockSiteAccess.assertSiteAccess).toHaveBeenCalledWith(principal(), 'site-123');
  });

  it('extracts siteId from query params', async () => {
    const mockSiteAccess = {
      assertSiteAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: principal(),
          params: {},
          query: { siteId: 'from-query' },
          body: {},
        }),
      }),
    } as any;
    expect(await guard.canActivate(context)).toBe(true);
    expect(mockSiteAccess.assertSiteAccess).toHaveBeenCalledWith(principal(), 'from-query');
  });

  it('extracts siteId from body', async () => {
    const mockSiteAccess = {
      assertSiteAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: principal(),
          params: {},
          query: {},
          body: { siteId: 'from-body' },
        }),
      }),
    } as any;
    expect(await guard.canActivate(context)).toBe(true);
    expect(mockSiteAccess.assertSiteAccess).toHaveBeenCalledWith(principal(), 'from-body');
  });

  it('propagates ForbiddenException from SiteAccessService', async () => {
    const mockSiteAccess = {
      assertSiteAccess: jest.fn().mockRejectedValue(new Error('No access')),
    } as unknown as SiteAccessService;
    const guard = new SiteAccessGuard(mockSiteAccess);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: principal(),
          params: { siteId: 'forbidden-site' },
          query: {},
          body: {},
        }),
      }),
    } as any;
    await expect(guard.canActivate(context)).rejects.toThrow('No access');
  });
});
