export type ConfigureAuthInput = {
  projectRef: string;
  accessToken: string;
  siteUrl: string;
  publicSiteUrl?: string;
  includeLocalDevRedirects?: boolean;
};

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function buildRedirectUrls(siteUrl: string, publicSiteUrl?: string, includeLocal = true): string[] {
  const urls = new Set<string>([
    `${siteUrl}/auth/callback`,
    `${siteUrl}/auth/reset-password`,
    `${siteUrl}/**`,
  ]);

  if (publicSiteUrl) {
    const pub = normalizeUrl(publicSiteUrl);
    urls.add(`${pub}/auth/callback`);
    urls.add(`${pub}/**`);
  }

  if (includeLocal) {
    // Puerto por defecto de `pnpm dev` (VITE_PORT, ver vite.config.ts) — ajusta si tu cliente lo cambia.
    for (const host of ['localhost', '127.0.0.1']) {
      urls.add(`http://${host}:7070/auth/callback`);
      urls.add(`http://${host}:7070/auth/reset-password`);
      urls.add(`http://${host}:7070/**`);
    }
  }

  return Array.from(urls);
}

export async function configureAuthUrls(input: ConfigureAuthInput): Promise<void> {
  const siteUrl = normalizeUrl(input.siteUrl);
  const redirectUrls = buildRedirectUrls(siteUrl, input.publicSiteUrl, input.includeLocalDevRedirects !== false);

  const endpoint = `https://api.supabase.com/v1/projects/${input.projectRef}/config/auth`;
  const body = {
    site_url: siteUrl,
    uri_allow_list: redirectUrls.join('\n'),
  };

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Management API auth config falló (${response.status}): ${text}`);
  }
}
