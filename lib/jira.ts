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
    // Story points field ID varies per Jira instance. customfield_10016 is the
    // common default for Jira Cloud "Story Points" - confirm yours via
    // Jira > issue > ... > "Configure fields" or the field's API name, and
    // adjust here if different.
    storyPoints: raw.fields.customfield_10016 ?? null,
    labels: raw.fields.labels ?? [],
    assignee: raw.fields.assignee?.displayName ?? null,
  };
}

/**
 * Pull the current backlog for the configured project.
 * Adjust the JQL to match your actual backlog status name(s).
 */
export async function fetchBacklog(): Promise<JiraIssue[]> {
  const jql = `project = ${JIRA_PROJECT_KEY} AND status = "Backlog" ORDER BY created ASC`;
  const data = await jiraFetch(
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=200&fields=summary,status,issuetype,labels,assignee,customfield_10016`
  );
  return (data.issues || []).map(mapIssue);
}

export async function fetchIssue(key: string): Promise<JiraIssue> {
  const data = await jiraFetch(`/rest/api/3/issue/${key}?fields=summary,status,issuetype,labels,assignee,customfield_10016`);
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
