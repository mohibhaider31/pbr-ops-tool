export type Assignee = {
  id: string;
  name: string;
  email: string;
  accountId?: string | null; // stable Atlassian identity; null on legacy rows
  markedDone: boolean;
};

export type Comment = {
  id: string;
  author: string;
  text: string;
  isQuestion: boolean;
  createdAt: string;
};

export type StoryStage = "BACKLOG" | "ASSIGNED" | "IN_REVIEW" | "PBR_DONE";

export type JiraFields = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  storyPoints: number | null;
  labels: string[];
  assignee: string | null;
};

export type Story = {
  id: string;
  jiraKey: string;
  priorityOrder: number;
  stage: StoryStage;
  assignees: Assignee[];
  comments: Comment[];
  jira: JiraFields;
};
