/**
 * Deterministic HTML fixture site for crawler + audit + acceptance tests.
 *
 * The router serves a small coherent site that exercises every audit rule
 * category: on-page issues, duplicate content, canonical conflicts, schema
 * errors, broken/orphan links, redirects (chain + loop), noindex, robots
 * blocks, HTTP errors and sitemap coverage. Toggling `fixed` simulates fixing
 * the on-page issues so re-audits move those findings to verification while
 * the persistent technical failures stay open.
 */

export interface FixtureOptions {
  fixed: boolean;
  origin: string;
}

export interface FixtureResponse {
  status: number;
  contentType: string;
  body: string;
  /** Redirect target for 3xx responses. */
  location?: string;
}

const page = (title: string, body = '', extra: { robots?: string; canonical?: string; jsonld?: string; h1?: string; lang?: string } = {}): string => `<!DOCTYPE html>
<html lang="${extra.lang ?? 'en'}">
<head>
<title>${title}</title>
<meta name="description" content="Description for ${title}.">
${extra.robots ? `<meta name="robots" content="${extra.robots}">` : ''}
${extra.canonical ? `<link rel="canonical" href="${extra.canonical}">` : ''}
${extra.jsonld ? `<script type="application/ld+json">${extra.jsonld}</script>` : ''}
</head>
<body>
${extra.h1 ? `<h1>${extra.h1}</h1>` : ''}
<p>Fixture body content about seo services and keyword research.</p>
${body}
</body>
</html>`;

/** A page without a <title> element. */
const pageNoTitle = (body = '', extra: { h1?: string } = {}): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta name="description" content="Fixture page without a title.">
</head>
<body>
${extra.h1 ? `<h1>${extra.h1}</h1>` : ''}
<p>Fixture body content about seo services and keyword research.</p>
${body}
</body>
</html>`;

const link = (href: string, text: string): string => `<a href="${href}">${text}</a>`;

/** Routes a fixture request path to a response. */
export function fixtureResponse(path: string, options: FixtureOptions): FixtureResponse {
  const { fixed, origin } = options;
  const redirect = (to: string): FixtureResponse => ({ status: 302, contentType: 'text/html', body: '', location: to });

  switch (path) {
    case '/':
      return {
        status: 200,
        contentType: 'text/html',
        body: page('Fixture Home', [
          link('/', 'Home'),
          link('/about', 'About'),
          link('/services', 'Services'),
          link('/missing-title', 'Missing title'),
          link('/duplicate-title', 'Duplicate title'),
          link('/missing-alt', 'Missing alt'),
          link('/broken-link', 'Broken link'),
          link('/redirect', 'Redirect'),
          link('/redirect-chain', 'Redirect chain'),
          link('/noindex', 'Noindex'),
          link('/canonical-conflict', 'Canonical conflict'),
          link('/invalid-jsonld', 'Invalid JSON-LD'),
          // After the fix these are no longer linked, so the broken-link rule
          // resolves while the 5xx/redirect-loop rules persist via the sitemap.
          ...(fixed ? [] : [link('/redirect-loop', 'Redirect loop'), link('/server-error', 'Server error')]),
        ].join('\n'), { h1: 'Fixture Home' }),
      };
    case '/about':
      return { status: 200, contentType: 'text/html', body: page('About Fixture', link('/', 'Home'), { h1: 'About' }) };
    case '/services':
      return { status: 200, contentType: 'text/html', body: page('Services Fixture', link('/', 'Home'), { h1: 'Services' }) };
    case '/missing-title':
      return {
        status: 200,
        contentType: 'text/html',
        body: fixed ? page('Fixed Title Page', link('/', 'Home'), { h1: 'Missing title' }) : pageNoTitle(link('/', 'Home'), { h1: 'Missing title' }),
      };
    case '/duplicate-title':
      return { status: 200, contentType: 'text/html', body: page('Duplicate Title Page', link('/', 'Home') + link('/duplicate-title-2', 'Duplicate 2'), { h1: 'Duplicate title' }) };
    case '/duplicate-title-2':
      return {
        status: 200,
        contentType: 'text/html',
        body: fixed
          ? page('Duplicate Title Page 2', link('/', 'Home'), { h1: 'Duplicate title 2' })
          : page('Duplicate Title Page', link('/', 'Home'), { h1: 'Duplicate title 2' }),
      };
    case '/missing-alt':
      return {
        status: 200,
        contentType: 'text/html',
        body: fixed
          ? page('Missing Alt Fixture', `<img src="/img.png" alt="An example image">${link('/', 'Home')}`, { h1: 'Missing alt' })
          : page('Missing Alt Fixture', `<img src="/img.png">${link('/', 'Home')}`, { h1: 'Missing alt' }),
      };
    case '/broken-link':
      return {
        status: 200,
        contentType: 'text/html',
        body: fixed ? page('Broken Link Fixture', link('/', 'Home'), { h1: 'Broken link' }) : page('Broken Link Fixture', link('/', 'Home') + link('/missing-page', 'Missing page'), { h1: 'Broken link' }),
      };
    case '/missing-page':
      return { status: 404, contentType: 'text/html', body: 'Not found' };
    case '/server-error':
      return { status: 500, contentType: 'text/html', body: 'Server error' };
    case '/redirect':
      return redirect('/redirect-target');
    case '/redirect-target':
      return { status: 200, contentType: 'text/html', body: page('Redirect Target', link('/', 'Home'), { h1: 'Redirect target' }) };
    case '/redirect-chain':
      return redirect('/redirect-chain-2');
    case '/redirect-chain-2':
      return redirect('/redirect-chain-3');
    case '/redirect-chain-3':
      return redirect('/redirect-chain-4');
    case '/redirect-chain-4':
      return { status: 200, contentType: 'text/html', body: page('Redirect Chain End', link('/', 'Home'), { h1: 'Redirect chain end' }) };
    case '/redirect-loop':
      return redirect('/redirect-loop');
    case '/noindex':
      return { status: 200, contentType: 'text/html', body: page('Noindex Page', link('/', 'Home'), { robots: 'noindex', h1: 'Noindex page' }) };
    case '/canonical-conflict':
      return {
        status: 200,
        contentType: 'text/html',
        body: page('Canonical Conflict', link('/', 'Home') + link('/canonical-conflict-2', 'Conflict 2'), { canonical: `${origin}/canonical-conflict-2`, h1: 'Canonical conflict' }),
      };
    case '/canonical-conflict-2':
      return {
        status: 200,
        contentType: 'text/html',
        body: page('Canonical Conflict 2', link('/', 'Home'), {
          canonical: fixed ? `${origin}/canonical-conflict-2` : `${origin}/canonical-conflict`,
          h1: 'Canonical conflict 2',
        }),
      };
    case '/invalid-jsonld':
      return {
        status: 200,
        contentType: 'text/html',
        body: fixed
          ? page('Invalid JSON-LD', link('/', 'Home'), { jsonld: '{"@type":"Organization","name":"Fixture"}', h1: 'Invalid JSON-LD' })
          : page('Invalid JSON-LD', link('/', 'Home'), { jsonld: '{invalid json', h1: 'Invalid JSON-LD' }),
      };
    case '/orphan':
      return { status: 200, contentType: 'text/html', body: page('Orphan Fixture', '', { h1: 'Orphan' }) };
    case '/blocked-page':
      return { status: 200, contentType: 'text/html', body: page('Blocked Page', link('/', 'Home'), { h1: 'Blocked page' }) };
    case '/robots.txt':
      return {
        status: 200,
        contentType: 'text/plain',
        body: `User-agent: *\nDisallow: /blocked\nDisallow: /private\nSitemap: ${origin}/sitemap.xml\n`,
      };
    case '/sitemap.xml':
      return {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${['/', '/about', '/services', '/orphan', '/missing-title', '/duplicate-title', '/blocked-page', '/server-error', '/missing-page', '/redirect-loop', '/redirect-chain', '/canonical-conflict']
    .map((url) => `<url><loc>${origin}${url}</loc></url>`)
    .join('\n  ')}
</urlset>`,
      };
    case '/img.png':
      return { status: 200, contentType: 'image/png', body: 'PNG' };
    default:
      return { status: 404, contentType: 'text/html', body: 'Not found' };
  }
}
