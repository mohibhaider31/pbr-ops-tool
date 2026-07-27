// Thin wrapper around the Jira Cloud REST API (v3).
// Auth: Basic, using your Atlassian account email + an API token
// (create one at id.atlassian.com/manage-profile/security/api-tokens).
// This is the same style of credential your Atlassian MCP setup uses,
// just issued directly against the REST API instead of via MCP.

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!; // e.g. https://logicielservices.atlassian.net
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY!; // e.g. RAE

function authHeader() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return `Basic ${token}`;
}

async function jiraFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${JIRA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
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
export async function addJiraComment(key: string, author: string, text: string) {
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
  });
}

/**
 * Transition an issue to a target status by name (e.g. "Ready for Dev").
 * Jira transitions are graph edges, not free-form status sets, so we look
 * up the available transition IDs first and match by the target name.
 */
export async function transitionIssue(key: string, targetStatusName: string) {
  const data = await jiraFetch(`/rest/api/3/issue/${key}/transitions`);
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
  });
}

/**
 * Walk an issue through a sequence of transitions, one status at a time.
 * Needed here because this Jira workflow has no direct edge from the
 * backlog status straight to the PBR target status - it has to pass
 * through several intermediate statuses in order (confirmed with the PO):
 * To Do -> Requirement Analysis -> Requirement Documentation ->
 * Pending PO Review -> Ready For Dev.
 */
export async function transitionThroughPath(key: string, path: string[]) {
  for (const targetStatus of path) {
    await transitionIssue(key, targetStatus);
  }
}
