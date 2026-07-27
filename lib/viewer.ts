// Resolves the current logged-in user's Person record (role + admin), creating
// it on first login. Seeds the designated bootstrap account as Admin + PO.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { BoardRole } from "@/lib/permissions";

// The account that set up the tool: seeded as global Admin + PO on first login.
const SEED_ADMIN_ACCOUNT_ID = process.env.SEED_ADMIN_ACCOUNT_ID || "";

export type Viewer = {
  personId: string;
  accountId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: BoardRole;
  isAdmin: boolean;
};

export async function getViewer(): Promise<Viewer | null> {
  const session = await getSession();
  if (!session) return null;

  // Find existing person by accountId, or by email (manual adds that hadn't
  // logged in yet), else create with defaults.
  let person = await prisma.person.findUnique({ where: { accountId: session.accountId } });

  if (!person && session.email) {
    const byEmail = await prisma.person.findUnique({ where: { email: session.email } });
    if (byEmail) {
      // Link the manual/email record to this Atlassian account on first login.
      person = await prisma.person.update({
        where: { id: byEmail.id },
        data: {
          accountId: session.accountId,
          name: byEmail.name || session.name,
          avatarUrl: session.avatarUrl,
        },
      });
    }
  }

  if (!person) {
    const isSeed = SEED_ADMIN_ACCOUNT_ID && session.accountId === SEED_ADMIN_ACCOUNT_ID;
    person = await prisma.person.create({
      data: {
        accountId: session.accountId,
        email: session.email,
        name: session.name,
        avatarUrl: session.avatarUrl,
        role: isSeed ? "PO" : "DEVELOPER",
        isAdmin: !!isSeed,
        source: "jira",
        firstLoginAt: new Date(), // created during an authenticated request = first login
      },
    });
  }

  // Stamp first login for anyone resolved here who hasn't been marked yet
  // (e.g. a Jira-synced or manually-added person logging in for the first
  // time). This is the "has started using the tool" flag.
  if (!person.firstLoginAt) {
    person = await prisma.person.update({
      where: { id: person.id },
      data: { firstLoginAt: new Date() },
    });
  }

  return {
    personId: person.id,
    accountId: session.accountId,
    name: person.name,
    email: person.email,
    avatarUrl: person.avatarUrl,
    role: person.role as BoardRole,
    isAdmin: person.isAdmin,
  };
}
