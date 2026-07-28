// Resolves the current logged-in user's Person record (identity + global admin),
// creating it on first login. Seeds the bootstrap account as Admin. Product
// roles are per-board now (see lib/board.ts + BoardMembership), not here.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SEED_ADMIN_ACCOUNT_ID = process.env.SEED_ADMIN_ACCOUNT_ID || "";

export type Viewer = {
  personId: string;
  accountId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export async function getViewer(): Promise<Viewer | null> {
  const session = await getSession();
  if (!session) return null;

  let person = await prisma.person.findUnique({ where: { accountId: session.accountId } });

  if (!person && session.email) {
    const byEmail = await prisma.person.findUnique({ where: { email: session.email } });
    if (byEmail) {
      person = await prisma.person.update({
        where: { id: byEmail.id },
        data: { accountId: session.accountId, name: byEmail.name || session.name, avatarUrl: session.avatarUrl },
      });
    }
  }

  const isSeed = !!SEED_ADMIN_ACCOUNT_ID && session.accountId === SEED_ADMIN_ACCOUNT_ID;

  if (!person) {
    person = await prisma.person.create({
      data: {
        accountId: session.accountId,
        email: session.email,
        name: session.name,
        avatarUrl: session.avatarUrl,
        isAdmin: isSeed,
        source: "jira",
        firstLoginAt: new Date(),
      },
    });
    // Seed admin gets a PO membership on the default board so they can drive it.
    if (isSeed) {
      const def = await prisma.board.findFirst({ where: { isDefault: true } });
      if (def) {
        await prisma.boardMembership.upsert({
          where: { personId_boardId: { personId: person.id, boardId: def.id } },
          create: { personId: person.id, boardId: def.id, role: "PO" },
          update: { role: "PO" },
        });
      }
    }
  }

  if (!person.firstLoginAt) {
    person = await prisma.person.update({ where: { id: person.id }, data: { firstLoginAt: new Date() } });
  }

  return {
    personId: person.id,
    accountId: session.accountId,
    name: person.name,
    email: person.email,
    avatarUrl: person.avatarUrl,
    isAdmin: person.isAdmin,
  };
}
