import { lookup } from 'dns/promises';

/**
 * SSRF-safe URL helpers shared across packages. Server-side fetches and
 * browser rendering (e.g. local Chromium for report PDFs) must only ever reach
 * public HTTP(S) hosts unless explicitly overridden for local development.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export interface SafeUrlOptions {
  /** Allow private/loopback addresses (local development only). */
  allowPrivate?: boolean;
}

/** True when an IP address is public (not private, loopback, link-local, multicast, etc.). */
export function isPublicAddress(address: string): boolean {
  // IPv4: private, loopback, link-local, CGNAT, benchmark, reserved, multicast, broadcast.
  if (!address.includes(':')) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4) {
      return false;
    }
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }
  // IPv6: loopback, link-local, unique-local, multicast, mapped IPv4 are non-public.
  const normalized = address.toLowerCase();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:')
  ) {
    return false;
  }
  return true;
}

/**
 * Validates that a URL is http(s) and resolves only to public addresses.
 * Returns the URL unchanged on success; throws UnsafeUrlError otherwise.
 * The DNS lookup defeats simple DNS-rebinding attempts.
 */
export async function assertPublicHttpUrl(value: string, options: SafeUrlOptions = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported protocol "${url.protocol}" (only http/https)`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URL must not embed credentials');
  }
  if (options.allowPrivate) {
    return value;
  }
  const hostname = url.hostname;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UnsafeUrlError(`Refusing non-public host "${hostname}"`);
  }
  let addresses: string[];
  try {
    addresses = (await lookup(hostname, { all: true })).map((entry) => entry.address);
  } catch {
    throw new UnsafeUrlError(`Unable to resolve host "${hostname}"`);
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Host "${hostname}" resolved to no addresses`);
  }
  const blocked = addresses.filter((address) => !isPublicAddress(address));
  if (blocked.length > 0) {
    throw new UnsafeUrlError(`Refusing non-public host "${hostname}" (resolves to ${blocked.join(', ')})`);
  }
  return value;
}

/** Best-effort guard that never throws: returns true when the value looks like a safe public image URL. */
export async function isSafePublicUrl(value: string, options: SafeUrlOptions = {}): Promise<boolean> {
  if (!value) return true;
  try {
    await assertPublicHttpUrl(value, options);
    return true;
  } catch {
    return false;
  }
}
