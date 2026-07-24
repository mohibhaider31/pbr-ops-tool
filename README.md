# PBR Ops Tool — Phase 1: Backlog & PBR Workflow

This is the first of three modules toward the full product-ops tool:

1. **Backlog & PBR workflow** ← this build
2. Pipeline tracker (Engine → Middleware → FE handoff visibility)
3. Planning poker

## What it does

- Pulls your live Jira backlog (`status = "Backlog"` in `JIRA_PROJECT_KEY`)
- Lets you reorder priority (▲▼), assign one or more reviewers per story
- Reviewers mark their own review done; comments/questions are stored here
  *and* optionally mirrored onto the Jira issue as a comment
- "Mark PBR Done" transitions the Jira issue to `JIRA_READY_FOR_DEV_STATUS`
  (default "Ready for Dev") via the Jira transitions API

Jira remains the system of record for the issue itself — this app only
stores the metadata Jira has no field for (priority order within PBR,
review assignments, done/comment state).

## Local setup

```bash
npm install
cp .env.example .env       # fill in DATABASE_URL and Jira credentials
npx prisma migrate dev --name init
npm run dev
```

### Getting a Jira API token
id.atlassian.com → Manage profile → Security → API tokens → Create.
Use your Atlassian account email + this token for `JIRA_EMAIL` /
`JIRA_API_TOKEN` — same style of credential as the Atlassian MCP setup,
just used directly against the REST API here.

### Story points field
Jira Cloud's default Story Points field ID is `customfield_10016`, but
this varies per instance. If points show as blank, check your field's
actual ID (Jira admin → issue fields, or inspect the raw issue via
`/rest/api/3/issue/{key}?expand=names`) and update it in `lib/jira.ts`.

## Deploying to Vercel

1. Push this repo to GitHub
2. Import into Vercel (vercel.com/new)
3. Add a Postgres database — easiest is Vercel's own Storage tab
   (Postgres, powered by Neon) or a Neon project directly; either way
   Vercel will inject `DATABASE_URL` for you if added via the Storage tab
4. Add the remaining env vars from `.env.example` in Project Settings → Environment Variables
5. **Before the first deploy**, generate the initial migration locally
   against a real (even a temporary/dev) Postgres instance and commit it:
   ```bash
   npx prisma migrate dev --name init
   git add prisma/migrations
   git commit -m "Add initial migration"
   git push
   ```
   Prisma needs the migration *files* checked into the repo — it can't
   generate them from nothing at build time, only apply ones that
   already exist.
6. Deploy. The build script (`prisma generate && prisma migrate deploy
   && next build`) now applies any pending migrations automatically on
   every build, so every future push to `main` handles its own schema
   changes — no manual step needed after this point.

**Heads up on Preview deployments:** if you use the same `DATABASE_URL`
for Preview and Production environments in Vercel, every PR/preview
build will also run `prisma migrate deploy` against that same database.
`migrate deploy` only applies migrations that haven't run yet, so this
is safe in practice, but if you want previews fully isolated, add a
separate (cheaper/free-tier) Neon database and point Preview's
`DATABASE_URL` at that one instead.

## What's deliberately not built yet

- **Auth** — comments/assignments currently just take free-text
  name/email. Before rolling out to your team, wire in something like
  NextAuth with Atlassian OAuth or Microsoft (you already use M365) so
  "author" is a real logged-in identity, not typed text.
- **Drag-and-drop reorder** — using ▲▼ buttons for now to avoid pulling
  in a DnD library before the workflow itself is validated. Easy to
  swap in `@dnd-kit/core` later without touching the API routes.
- **Notifications** — no email/Slack ping when someone's assigned a
  story. Worth adding once the core loop is working.

## Next: Phase 2 (Pipeline Tracker)

Since Engine → MW → FE handoffs aren't tracked with any consistent
Jira convention today, the next module needs one of two approaches
before we build it:

- **Labels on a single ticket** (`layer:engine-done`, `layer:mw-pending`,
  etc.) — no Jira admin access needed, but status lives in labels which
  is a bit fragile to enforce.
- **Linked child issues under a parent epic**, one per layer, each with
  its own real Jira status — more setup, but gives each layer proper
  sprint/assignee/status tracking instead of overloading one ticket.

Worth deciding this before Phase 2 starts, since the whole tracker's
data model hangs off of it.
