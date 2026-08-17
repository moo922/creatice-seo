import type { AppConfig } from '../../config/app-config';
import {
  WordPressClientError,
  WordPressClientService,
  type WordPressCredentials,
} from './wordpress-client.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));
import { lookup } from 'node:dns/promises';

const CREDS: WordPressCredentials = {
  url: 'https://example.com/wp',
  username: 'app-user',
  password: 'app-pass',
};

function makeClient(overrides: Partial<{ timeout: number; allowPrivate: boolean }> = {}): WordPressClientService {
  const config = {
    env: {
      WP_REQUEST_TIMEOUT_MS: overrides.timeout ?? 1000,
      WP_ALLOW_PRIVATE_ADDRESSES: overrides.allowPrivate ?? false,
    },
  } as unknown as AppConfig;
  return new WordPressClientService(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockFetch = jest.fn();

describe('WordPressClientService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (lookup as jest.Mock).mockReset();
    (lookup as jest.Mock).mockResolvedValue([{ address: '93.184.216.34' }]);
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('calls the connector path with Basic auth and parses JSON', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, connector: { name: 'svc', version: '1.0.0' } }));

    const body = await makeClient().health(CREDS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/wp-json/search-visibility-connector/v1/health');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('app-user:app-pass').toString('base64')}`);
    expect(init.headers.Accept).toBe('application/json');
    expect(body).toEqual({ ok: true, connector: { name: 'svc', version: '1.0.0' } });
  });

  it('builds pagination + status params for listPosts', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, per_page: 100, total_pages: 1 }));

    await makeClient().listPosts(CREDS, { postType: 'post', status: 'draft', page: 2, perPage: 50 });

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/posts?post_type=post&status=draft&page=2&per_page=50');
  });

  it('throws WordPressClientError with the connector message on non-2xx', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' }, 403),
    );

    await expect(makeClient().rankMath(CREDS)).rejects.toThrow(
      new WordPressClientError('Sorry, you are not allowed to do that.', 403),
    );
  });

  it('rejects private address space (SSRF guard) unless explicitly allowed', async () => {
    (lookup as jest.Mock).mockResolvedValue([{ address: '127.0.0.1' }]);

    await expect(makeClient().health(CREDS)).rejects.toThrow(/Refusing to connect to non-public WordPress host/);

    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    const allowed = makeClient({ allowPrivate: true });
    await expect(allowed.health(CREDS)).resolves.toEqual({ ok: true });
  });

  it('wraps network failures as WordPressClientError with null status', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(makeClient().health(CREDS)).rejects.toMatchObject({
      name: 'WordPressClientError',
      status: null,
      message: expect.stringContaining('WordPress request failed'),
    });
  });

  it('rejects non-http(s) URLs', async () => {
    await expect(makeClient().health({ ...CREDS, url: 'ftp://example.com' })).rejects.toThrow(
      'WordPress URL must use http(s).',
    );
  });

  it('calls GET /seo/{id} with Basic auth and parses the response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 42,
      rank_math: { available: true, title: 'Test', description: 'Desc', canonical: '', robots: [], focus_keywords: 'kw', schema: null },
    }));

    const result = await makeClient().getSeoMetadata(CREDS, 42);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/seo/42');
    expect(result.rank_math.title).toBe('Test');
  });

  it('calls PUT /seo/{id} with the payload and returns the write result', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      updated: ['title', 'description'],
      post_id: 42,
      seo: { available: true, title: 'New', description: 'New', canonical: '', robots: [], focus_keywords: 'kw', schema: null },
    }));

    const result = await makeClient().writeSeoMetadata(CREDS, 42, { title: 'New', description: 'New' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/seo/42');
    expect(init.method).toBe('PUT');
    expect(result.updated).toEqual(['title', 'description']);
  });

  it('calls PUT /content/{id} with content and returns hash', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 42, content: '<p>hi</p>', content_hash: 'abc123',
    }));

    const result = await makeClient().writeContent(CREDS, 42, '<p>hi</p>');

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/content/42');
    expect(init.method).toBe('PUT');
    expect(result.content_hash).toBe('abc123');
  });

  it('calls PATCH /posts/{id} with update payload', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 42, link: 'https://example.com/new', status: 'draft', title: 'Updated', content_hash: 'xyz',
    }));

    const result = await makeClient().updatePost(CREDS, 42, { title: 'Updated', slug: 'new' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/posts/42');
    expect(init.method).toBe('PATCH');
    expect(result.title).toBe('Updated');
  });

  it('calls GET /content/{id}/internal-links and returns links', async () => {
    mockFetch.mockResolvedValue(jsonResponse([
      { url: 'https://example.com/page1', anchor_text: 'Page 1' },
    ]));

    const result = await makeClient().getInternalLinks(CREDS, 42);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/content/42/internal-links');
    expect(result).toHaveLength(1);
  });

  it('calls GET /content/{id} and returns content hash', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 42, content: '<p>Hello</p>', content_hash: 'sha1hash',
    }));

    const result = await makeClient().getContent(CREDS, 42);

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/content/42');
    expect(result.content_hash).toBe('sha1hash');
  });
});
