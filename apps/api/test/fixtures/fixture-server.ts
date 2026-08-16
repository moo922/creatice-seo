import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import type { Server } from 'node:http';
import { fixtureResponse } from '@creative-seo/crawler';

/**
 * A real local HTTPS fixture website. Serves the deterministic fixture HTML
 * (crawler/src/fixtures.ts) over a self-signed cert bound to 127.0.0.1 so the
 * crawler can exercise it end-to-end during the acceptance test. The `fixed`
 * toggle simulates fixing on-page issues.
 */
export interface FixtureServer {
  origin: string;
  port: number;
  setFixed(fixed: boolean): void;
  close(): Promise<void>;
}

export async function createFixtureServer(): Promise<FixtureServer> {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-cert-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-days', '2', '-nodes',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { stdio: 'ignore' });

  let fixed = false;
  let origin = 'https://127.0.0.1:0';

  const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
    const url = new URL(req.url ?? '/', origin);
    const response = fixtureResponse(url.pathname, { fixed, origin });
    const headers: Record<string, string> = { 'content-type': response.contentType };
    if (response.location) headers.location = response.location;
    res.writeHead(response.status, headers);
    res.end(response.body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  origin = `https://127.0.0.1:${address.port}`;

  return {
    origin,
    port: address.port,
    setFixed: (value: boolean) => {
      fixed = value;
    },
    close: () => new Promise<void>((resolve) => (server as Server).close(() => resolve())),
  };
}
