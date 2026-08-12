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
});
