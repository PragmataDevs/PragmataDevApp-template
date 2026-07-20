/**
 * SSRF guard for Edge Functions that fetch user-controlled URLs.
 *
 * Threat model: an authenticated member supplies (directly in the request body,
 * or via a persisted analysis row) a URL that the function then fetches
 * server-side — target/competitor sites for HTC/KWD/EMA/ILR analyses and the
 * Google Business Profile URL for resolve-google-place. Without a guard, that
 * URL can point at cloud metadata (169.254.169.254), loopback, or other
 * internal hosts, or an external site can *redirect* to one of those.
 *
 * Defenses (layered):
 *   1. Protocol allowlist — only http/https.
 *   2. Literal-IP block — reject private / loopback / link-local / CGNAT /
 *      reserved ranges, IPv4 and IPv6 (incl. IPv4-mapped IPv6).
 *   3. DNS validation — resolve the hostname and reject if any resolved address
 *      is private (anti-DNS-rebind). Best-effort: if the runtime doesn't expose
 *      Deno.resolveDns, we fall back to the literal-IP + per-hop checks.
 *   4. Per-hop redirect validation — safeFetch follows redirects MANUALLY and
 *      re-validates every hop, so a public site cannot bounce us to an internal
 *      address (the highest-impact vector).
 *
 * Usage:
 *   import { safeFetch, assertPublicUrl, SsrfError } from '../_shared/ssrf.ts';
 *   const res = await safeFetch(url, { headers, signal });   // drop-in for fetch
 *   // or, when you drive the request yourself:
 *   await assertPublicUrl(url);
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const DEFAULT_MAX_REDIRECTS = 5;

/** Parse a dotted-quad IPv4 string into its 4 octets, or null if not IPv4. */
function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map((o) => Number(o));
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return octets;
}

/** True if an IPv4 address falls in a private / loopback / reserved range. */
function isPrivateIpv4(host: string): boolean {
  const o = parseIpv4(host);
  if (!o) return false;
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 192 && b === 0) return true; // 192.0.0/24 & 192.0.2/24 reserved/test
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved
  return false;
}

/** Parse an IPv6 string into 8 uint16 groups, expanding `::` and any embedded
 *  IPv4 tail (decimal a.b.c.d). Returns null if not a valid IPv6 literal. */
function parseIpv6(raw: string): number[] | null {
  let host = raw.toLowerCase();
  const pct = host.indexOf('%'); // strip zone id (fe80::1%eth0)
  if (pct !== -1) host = host.slice(0, pct);

  // Convert a trailing dotted-quad (::ffff:1.2.3.4) into two hex groups.
  const v4 = host.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const o = parseIpv4(v4[2]);
    if (!o) return null;
    host = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }

  if (!host.includes(':')) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;

  const nums = groups.map((g) => (g === '' ? NaN : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** True if an IPv6 address (no brackets) is loopback / private / link-local, or
 *  maps/embeds a private IPv4. */
function isPrivateIpv6(raw: string): boolean {
  const g = parseIpv6(raw);
  if (!g) return false;

  if (g.every((x) => x === 0)) return true; // :: unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): validate the IPv4.
  const firstFiveZero = g.slice(0, 5).every((x) => x === 0);
  if (firstFiveZero && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${(g[6] >> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >> 8) & 0xff}.${g[7] & 0xff}`;
    if (v4 !== '0.0.0.0') return isPrivateIpv4(v4);
  }

  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** Normalize a URL hostname: strip IPv6 brackets, lowercase. */
function normalizeHost(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h;
}

function isLiteralIp(host: string): boolean {
  return parseIpv4(host) !== null || host.includes(':');
}

function isBlockedHost(host: string): boolean {
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (parseIpv4(host)) return isPrivateIpv4(host);
  if (host.includes(':')) return isPrivateIpv6(host);
  return false;
}

/**
 * Validate that a URL is safe to fetch: http/https, not pointing at a private
 * address literally or via DNS. Throws SsrfError otherwise.
 *
 * @param opts.allowHost optional predicate; when provided, the (lowercased,
 *   de-bracketed) hostname must satisfy it — used to pin fetches to an allowlist
 *   (e.g. Google Maps hosts) on top of the private-range checks.
 */
export async function assertPublicUrl(
  rawUrl: string,
  opts: { allowHost?: (host: string) => boolean } = {},
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Blocked non-http(s) URL scheme: ${parsed.protocol}`);
  }

  const host = normalizeHost(parsed.hostname);

  if (opts.allowHost && !opts.allowHost(host)) {
    throw new SsrfError(`Host not in allowlist: ${host}`);
  }

  if (isBlockedHost(host)) {
    throw new SsrfError(`Blocked private/loopback host: ${host}`);
  }

  // If it's already a literal IP we've validated it above; no DNS to check.
  if (isLiteralIp(host)) return;

  // Anti-DNS-rebind: resolve and reject if ANY resolved address is private.
  // Best-effort — some runtimes don't expose Deno.resolveDns.
  const resolver = (globalThis as { Deno?: { resolveDns?: unknown } }).Deno?.resolveDns;
  if (typeof resolver !== 'function') return;

  const addresses: string[] = [];
  for (const kind of ['A', 'AAAA'] as const) {
    try {
      const ips = await (resolver as (h: string, t: string) => Promise<string[]>)(host, kind);
      addresses.push(...ips);
    } catch {
      // NXDOMAIN for one family, or resolver unsupported — ignore this family.
    }
  }
  if (addresses.length === 0) return; // couldn't resolve; per-hop + literal checks still apply
  for (const ip of addresses) {
    if (isBlockedHost(normalizeHost(ip))) {
      throw new SsrfError(`Host ${host} resolves to a private address (${ip})`);
    }
  }
}

/**
 * fetch() replacement that validates the target and follows redirects manually,
 * re-validating every hop. Drop-in for `fetch(url, init)` — do NOT pass
 * `redirect` in init; this always uses manual redirect handling.
 */
export async function safeFetch(
  input: string,
  init: RequestInit & { maxRedirects?: number; allowHost?: (host: string) => boolean } = {},
): Promise<Response> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, allowHost, ...rest } = init;
  let current = input;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(current, { allowHost });

    const res = await fetch(current, { ...rest, redirect: 'manual' });

    // `manual` surfaces cross-origin redirects as opaqueredirect (status 0) or
    // as a real 3xx with a Location header, depending on the runtime.
    const isRedirect = (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect';
    if (!isRedirect) return res;

    const location = res.headers.get('location');
    if (!location) return res; // redirect with no target — hand it back as-is
    if (hop === maxRedirects) {
      throw new SsrfError(`Too many redirects (>${maxRedirects}) from ${input}`);
    }
    // Resolve relative redirects against the current URL, then re-validate.
    current = new URL(location, current).toString();
  }

  throw new SsrfError(`Too many redirects (>${maxRedirects}) from ${input}`);
}
