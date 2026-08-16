/**
 * Egress guard (SSRF defence). Crawls must never reach loopback, private,
 * link-local, CGNAT, multicast or reserved addresses — including the cloud
 * metadata endpoints (169.254.169.254). Every request target (initial host
 * AND each redirect destination) is resolved and validated before a request is
 * made, and re-resolved after the request to catch DNS rebinding. Only public
 * http/https hosts are allowed unless explicitly overridden via configuration.
 */
import { lookup } from 'node:dns/promises';

export interface EgressCheck {
  allowed: boolean;
  reason: string | null;
  /** The resolved public addresses, when allowed (used for rebinding checks). */
  addresses: string[];
}

/**
 * Classifies an IP address. Handles plain IPv4, plain IPv6 and IPv4-mapped
 * IPv6 (::ffff:x.x.x.x). Returns 'public' when the address is a globally
 * routable unicast address.
 */
export function isPublicAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6: decode and evaluate the embedded IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped) {
    return isPublicIpv4(mapped[1]!);
  }

  const v4 = ipv4(normalized);
  if (v4) return isPublicIpv4(normalized);

  // IPv6: is it a plain IPv6 literal?
  if (normalized.includes(':') && !normalized.includes('.')) {
    return isPublicIpv6(normalized);
  }

  // Anything else (hostnames reaching here) is not an address we can bless.
  return false;
}

function isPublicIpv4(ip: string): boolean {
  const [a, b, c] = ipv4(ip) ?? [0, 0, 0];
  if (a === undefined) return false;
  // 0.0.0.0/8 — "this network"
  if (a === 0) return false;
  // 10.0.0.0/8 — private
  if (a === 10) return false;
  // 100.64.0.0/10 — CGNAT (100.64.0.0 - 100.127.255.255)
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return false;
  // 127.0.0.0/8 — loopback
  if (a === 127) return false;
  // 169.254.0.0/16 — link-local (includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return false;
  // 172.16.0.0/12 — private
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false;
  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && c === 0) return false;
  // 192.0.2.0/24 — TEST-NET-1
  if (a === 192 && b === 0 && c === 2) return false;
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return false;
  // 198.18.0.0/15 — benchmarking
  if (a === 198 && b !== undefined && (b === 18 || b === 19)) return false;
  // 198.51.100.0/24 — TEST-NET-2
  if (a === 198 && b === 51 && c === 100) return false;
  // 203.0.113.0/24 — TEST-NET-3
  if (a === 203 && b === 0 && c === 113) return false;
  // 224.0.0.0/4 — multicast
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  // Unspecified, loopback, link-local, ULA and multicast are never public.
  if (ip === '::' || ip === '::1') return false;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return false; // fc00::/7 ULA
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return false; // fe80::/10 link-local
  if (ip.startsWith('ff')) return false; // ff00::/8 multicast
  if (ip.startsWith('2001:db8')) return false; // documentation
  if (ip.startsWith('64:ff9b:')) return false; // NAT64 well-known prefix
  // 2002::/16 6to4 embeds an IPv4 address — validate the embedded octets.
  if (ip.startsWith('2002:')) {
    const embedded = ip.split(':')[1];
    if (embedded && embedded.length === 4) {
      const a = Number.parseInt(embedded.slice(0, 2), 16);
      const b = Number.parseInt(embedded.slice(2, 4), 16);
      if (!isPublicIpv4(`${a}.${b}.0.0`)) return false;
    }
  }
  return true;
}

function ipv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
  return bytes as [number, number, number, number];
}

/**
 * Resolves a hostname and validates every returned address. Returns the public
 * addresses when safe to contact, or an EgressCheck marking it blocked.
 */
export async function resolvePublicAddresses(hostname: string, allowPrivate: boolean): Promise<EgressCheck> {
  if (allowPrivate) return { allowed: true, reason: null, addresses: [] };
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === 'localhost.localdomain') {
    return { allowed: false, reason: 'loopback hostname blocked', addresses: [] };
  }
  try {
    const entries = await lookup(host, { all: true });
    if (entries.length === 0) {
      return { allowed: false, reason: 'hostname did not resolve', addresses: [] };
    }
    const addresses = entries.map((entry) => entry.address);
    for (const address of addresses) {
      if (!isPublicAddress(address)) {
        return { allowed: false, reason: `private/loopback/reserved address blocked (${address})`, addresses: [] };
      }
    }
    return { allowed: true, reason: null, addresses };
  } catch {
    return { allowed: false, reason: 'could not resolve host', addresses: [] };
  }
}

/** Compatibility wrapper: single-shot host validation. */
export async function assertPublicHost(hostname: string, allowPrivate: boolean): Promise<EgressCheck> {
  return resolvePublicAddresses(hostname, allowPrivate);
}
