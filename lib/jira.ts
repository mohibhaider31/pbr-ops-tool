// Thin wrapper around the Jira Cloud REST API (v3).
// Two auth modes:
//  - Service (default): Basic auth with a personal API token, used for
//    background reads (backlog/pipeline) that shouldn't depend on any one
//    user being logged in. Hits the site directly (JIRA_BASE_URL).
//  - User (OAuth): Bearer token from a logged-in Atlassian session, used so
//    writes (comments, transitions) are attributed to the real person and
//    respect their own Jira permissions. Hits the OAuth gateway
//    (api.atlassian.com/ex/jira/{cloudId}).

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!; // e.g. https://logicielservices.atlassian.net
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY!; // e.g. RAE

// Optional per-request OAuth context. When provided, jiraFetch uses the
// user's bearer token against the cloud gateway instead of the service token.
export type JiraAuth = { accessToken: string; cloudId: string };

function serviceAuthHeader() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return `Basic ${token}`;
}

async function jiraFetch(path: string, init?: RequestInit, auth?: JiraAuth) {
  const base = auth
    ? `https://api.atlassian.com/ex/jira/${auth.cloudId}`
    : JIRA_BASE_URL;
  const authorization = auth ? `Bearer ${auth.accessToken}` : serviceAuthHeader();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status} ${path}: ${body}`);
  }
  // 204s (e.g. transitions) have no body
  if (res.status === 204) return null;
  return res.json();
}

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  storyPoints: number | null;
  labels: string[];
  assignee: string | null;
};

function mapIssue(raw: any): JiraIssue {
  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status?.name ?? "Unknown",
    issueType: raw.fields.issuetype?.name ?? "Story",
    // Story points field ID varies per Jira instance. Confirmed for this
    // instance (Logiciel Services RAE project) via issue ?expand=names:
    // customfield_10024 is "Story Points"; customfield_10016 is a separate,
    // unused "Story point estimate" field. Both were empty on the current
    // backlog since PBR/planning-poker estimation hasn't happened yet.
    storyPoints: raw.fields.customfield_10024 ?? null,
    labels: raw.fields.labels ?? [],
    assignee: raw.fields.assignee?.displayName ?? null,
  };
}

// Configurable so this doesn't need a code change per Jira workflow.
const BACKLOG_STATUS = process.env.JIRA_BACKLOG_STATUS || "Backlog";
const BACKLOG_FIELDS = ["summary", "status", "issuetype", "labels", "assignee", "customfield_10016"];

/**
 * Pull the current backlog for the configured project.
 * Note: Atlassian retired the legacy GET /rest/api/3/search endpoint;
 * this uses its replacement, POST /rest/api/3/search/jql, which is
 * cursor-paginated (nextPageToken/isLast) rather than offset-based.
 */
export async function fetchBacklog(): Promise<JiraIssue[]> {
  const jql = `project = ${JIRA_PROJECT_KEY} AND status = "${BACKLOG_STATUS}" ORDER BY created ASC`;
  const issues: any[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraFetch(`/rest/api/3/search/jql`, {
      method: "POST",
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: BACKLOG_FIELDS,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);

  return issues.map(mapIssue);
}

export async function fetchIssue(key: string): Promise<JiraIssue> {
  const data = await jiraFetch(`/rest/api/3/issue/${key}?fields=${BACKLOG_FIELDS.join(",")}`);
  return mapIssue(data);
}

/**
 * Add a comment on the Jira issue itself (in addition to our internal
 * Comment table) so questions/notes are visible to anyone reading Jira
 * directly, not just inside this tool.
 */
export async function addJiraComment(key: string, author: string, text: string, auth?: JiraAuth) {
  await jiraFetch(`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `[${author}] ${text}` }],
          },
        ],
      },
    }),
  }, auth);
}

/**
 * Transition an issue to a target status by name (e.g. "Ready for Dev").
 * Jira transitions are graph edges, not free-form status sets, so we look
 * up the available transition IDs first and match by the target name.
 */
export async function transitionIssue(key: string, targetStatusName: string, auth?: JiraAuth) {
  const data = await jiraFetch(`/rest/api/3/issue/${key}/transitions`, undefined, auth);
  const match = (data.transitions || []).find(
    (t: any) => t.to?.name?.toLowerCase() === targetStatusName.toLowerCase()
  );
  if (!match) {
    throw new Error(
      `No transition to "${targetStatusName}" found for ${key}. Available: ${(data.transitions || [])
        .map((t: any) => t.to?.name)
        .join(", ")}`
    );
  }
  await jiraFetch(`/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  }, auth);
}

/**
 * Walk an issue through a sequence of transitions, one status at a time.
 * Needed here because this Jira workflow has no direct edge from the
 * backlog status straight to the PBR target status - it has to pass
 * through several intermediate statuses in order (confirmed with the PO):
 * To Do -> Requirement Analysis -> Requirement Documentation ->
 * Pending PO Review -> Ready For Dev.
 */
export async function transitionThroughPath(key: string, path: string[], auth?: JiraAuth) {
  for (const targetStatus of path) {
    await transitionIssue(key, targetStatus, auth);
  }
}

// --- Pipeline: fetch active (non-terminal) stories for layer tracking ---
// Terminal statuses are excluded since a shipped/cancelled story has no
// pending layer work. Everything else is "active" and appears in the tracker.
const TERMINAL_STATUSES = (
  process.env.JIRA_TERMINAL_STATUSES || "Done,Canceled,Cancelled,Frozen,Released to OAT,Resolved"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function fetchActiveStories(): Promise<JiraIssue[]> {
  const notIn = TERMINAL_STATUSES.map((s) => `"${s}"`).join(", ");
  const jql = `project = ${JIRA_PROJECT_KEY} AND issuetype = Story AND status NOT IN (${notIn}) ORDER BY created ASC`;
  const issues: any[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraFetch(`/rest/api/3/search/jql`, {
      method: "POST",
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: BACKLOG_FIELDS,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);

  return issues.map(mapIssue);
}

// --- People: fetch assignable users on the project (for role management) ---
// Uses the user-assignable-users endpoint scoped to the project. Requires a
// user OAuth token (read:jira-user via read:me won't cover this; falls back
// to service token which can read project users).
export type JiraUser = { accountId: string; name: string; email: string | null; avatarUrl: string | null };

export async function fetchProjectMembers(auth?: JiraAuth): Promise<JiraUser[]> {
  // assignable users search for the project; paginate through results.
  const users: any[] = [];
  let startAt = 0;
  const maxResults = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await jiraFetch(
      `/rest/api/3/user/assignable/search?project=${JIRA_PROJECT_KEY}&startAt=${startAt}&maxResults=${maxResults}`,
      undefined,
      auth
    );
    const batch = Array.isArray(data) ? data : [];
    users.push(...batch);
    if (batch.length < maxResults) break;
    startAt += maxResults;
    if (startAt > 1000) break; // safety
  }
  return users
    .filter((u) => u.accountType === "atlassian") // real people, not apps
    .map((u) => ({
      accountId: u.accountId,
      name: u.displayName,
      email: u.emailAddress ?? null,
      avatarUrl: u.avatarUrls?.["48x48"] ?? null,
    }));
}

// --- Poker: write agreed story points back to Jira ---
// Writes the confirmed estimate to this instance's Story Points field
// (customfield_10024). Runs as the organizer's user token when provided.
export async function setStoryPoints(key: string, points: number, auth?: JiraAuth) {
  await jiraFetch(
    `/rest/api/3/issue/${key}`,
    {
      method: "PUT",
      body: JSON.stringify({ fields: { customfield_10024: points } }),
    },
    auth
  );
}

// --- Poker: fetch Ready-For-Dev stories to estimate ---
export async function fetchReadyForDevStories(auth?: JiraAuth): Promise<JiraIssue[]> {
  const status = process.env.JIRA_READY_FOR_DEV_STATUS || "Ready For Dev";
  const jql = `project = ${JIRA_PROJECT_KEY} AND issuetype = Story AND status = "${status}" ORDER BY updated DESC`;
  const issues: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const data = await jiraFetch(
      `/rest/api/3/search/jql`,
      {
        method: "POST",
        body: JSON.stringify({
          jql, maxResults: 100, fields: BACKLOG_FIELDS,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
      auth
    );
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);
  return issues.map(mapIssue);
}

// --- My Work: stories assigned to a user in Jira (native assignee) ---
export async function fetchMyJiraStories(accountId: string, auth?: JiraAuth): Promise<JiraIssue[]> {
  const jql = `project = ${JIRA_PROJECT_KEY} AND issuetype = Story AND assignee = "${accountId}" ORDER BY updated DESC`;
  const issues: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const data = await jiraFetch(
      `/rest/api/3/search/jql`,
      {
        method: "POST",
        body: JSON.stringify({
          jql, maxResults: 100, fields: BACKLOG_FIELDS,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
      auth
    );
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);
  return issues.map(mapIssue);
}
