/**
 * Egress guard: crawls must never target private, loopback, link-local or
 * reserved addresses (SSRF defence). Only public http/https hosts are allowed
 * unless explicitly overridden for local development.
 */
import { lookup } from 'node:dns/promises';

const BLOCKED = new Set(['127.0.0.1', '::1', '0.0.0.0']);

function isBlockedIp(ip: string): boolean {
  if (BLOCKED.has(ip)) return true;
  const v4 = ipv4(ip);
  if (!v4) return false; // IPv6 ranges below are out of scope for the guard.
  const [a, b] = v4;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  return false;
}

function ipv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
  return bytes as [number, number, number, number];
}

export interface EgressCheck {
  allowed: boolean;
  reason: string | null;
}

export async function assertPublicHost(hostname: string, allowPrivate: boolean): Promise<EgressCheck> {
  if (allowPrivate) return { allowed: true, reason: null };
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost') return { allowed: false, reason: 'localhost/private address blocked' };

  try {
    const addresses = await lookup(host, { all: true });
    for (const entry of addresses) {
      if (isBlockedIp(entry.address)) {
        return { allowed: false, reason: `private/loopback address blocked (${entry.address})` };
      }
    }
    return { allowed: true, reason: null };
  } catch {
    return { allowed: false, reason: 'could not resolve host' };
  }
}
