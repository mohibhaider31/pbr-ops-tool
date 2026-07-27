// Atlassian OAuth 2.0 (3LO) helper.
// Builds the authorize URL, exchanges the code for tokens, refreshes tokens,
// and resolves the user's identity + accessible Jira cloud id.

const AUTH_BASE = "https://auth.atlassian.com";
const API_BASE = "https://api.atlassian.com";

const SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "offline_access",
];

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: env("ATLASSIAN_CLIENT_ID"),
    scope: SCOPES.join(" "),
    redirect_uri: env("ATLASSIAN_REDIRECT_URI"),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env("ATLASSIAN_CLIENT_ID"),
      client_secret: env("ATLASSIAN_CLIENT_SECRET"),
      code,
      redirect_uri: env("ATLASSIAN_REDIRECT_URI"),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env("ATLASSIAN_CLIENT_ID"),
      client_secret: env("ATLASSIAN_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    // Atlassian rotates refresh tokens; fall back to the old one if absent.
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

// Who is this token's user?
export async function fetchMe(accessToken: string): Promise<{
  accountId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`fetch /me failed: ${res.status}`);
  const d = await res.json();
  return {
    accountId: d.account_id,
    name: d.name || d.nickname || d.email || "Unknown",
    email: d.email ?? null,
    avatarUrl: d.picture ?? null,
  };
}

// Which Jira sites can this token reach? We pick the one matching the
// configured site (JIRA_SITE_HOST) so the app stays pinned to RAE's Jira.
export async function fetchCloudId(accessToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`accessible-resources failed: ${res.status}`);
  const sites: { id: string; url: string }[] = await res.json();
  if (sites.length === 0) throw new Error("No accessible Jira sites for this account");

  const host = process.env.JIRA_SITE_HOST; // e.g. logicielservices.atlassian.net
  if (host) {
    const match = sites.find((s) => s.url.includes(host));
    if (match) return match.id;
  }
  // Fallback to the first accessible site.
  return sites[0].id;
}
