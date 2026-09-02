export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateSecret, encryptSecret, otpauthUri } from "@/lib/totp";

// Begin enrolment: generate a secret and return the QR to scan.
//
// The secret is stored (encrypted) but 2FA is NOT enabled until the user proves
// they can produce a code — otherwise a failed setup would lock them out.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.authType !== "local")
    return NextResponse.json(
      { error: "Atlassian accounts use Atlassian's own two-step verification" },
      { status: 400 }
    );

  const person = await prisma.person.findUnique({ where: { accountId: session.accountId } });
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (person.totpEnabledAt)
    return NextResponse.json({ error: "Two-factor is already on for this account" }, { status: 409 });

  const secret = generateSecret();
  await prisma.person.update({
    where: { id: person.id },
    data: { totpSecret: encryptSecret(secret) },
  });

  const uri = otpauthUri(secret, person.email ?? person.name);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return NextResponse.json({
    // Shown so it can be typed in if the QR can't be scanned.
    secret,
    uri,
    qr,
  });
}
