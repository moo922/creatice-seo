import { isPublicAddress, resolvePublicAddresses } from './ssrf';

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['172.217.14.206', true],
    ['127.0.0.1', false],
    ['127.0.0.2', false],
    ['10.0.0.1', false],
    ['10.255.255.255', false],
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['172.15.0.1', true],
    ['172.32.0.1', true],
    ['192.168.0.1', false],
    ['169.254.169.254', false],
    ['169.254.0.1', false],
    ['0.0.0.0', false],
    ['100.64.0.1', false],
    ['100.127.255.254', false],
    ['100.128.0.1', true],
    ['198.18.0.1', false],
    ['198.19.255.255', false],
    ['224.0.0.1', false],
    ['255.255.255.255', false],
    ['192.0.2.1', false],
    ['198.51.100.1', false],
    ['203.0.113.1', false],
  ])('%s is %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it('blocks loopback, link-local, ULA and multicast IPv6', () => {
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

  it('decodes IPv4-mapped IPv6 against the IPv4 blocklist', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:10.0.0.5')).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });
});

describe('resolvePublicAddresses', () => {
  it('blocks loopback and link-local hostnames', async () => {
    const loopback = await resolvePublicAddresses('localhost', false);
    expect(loopback.allowed).toBe(false);

    // Cloud metadata endpoint by IP (no DNS needed) must always be blocked.
    const metadata = await resolvePublicAddresses('169.254.169.254', false);
    expect(metadata.allowed).toBe(false);
  });

  it('allows a public hostname and returns its addresses', async () => {
    const check = await resolvePublicAddresses('example.com', false);
    expect(check.allowed).toBe(true);
    expect(check.addresses.length).toBeGreaterThan(0);
  });

  it('allows private hosts only through the explicit dev override', async () => {
    const check = await resolvePublicAddresses('127.0.0.1', true);
    expect(check.allowed).toBe(true);
  });
});
