import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPublicSubmissionSession } from "@/lib/public-submission-session";
import {
  eligibleMembers,
  findPublicPortal,
  memberDeliveryDetails,
} from "@/lib/public-portal-data";
import {
  hashClientAddress,
  IDENTIFICATION_ERROR,
  portalState,
  publicMemberReference,
  rateLimitDelay,
  verifyCarnet,
} from "@/lib/submission-portal";

export const runtime = "nodejs";
const schema = z.object({
  token: z.string().min(40).max(100),
  memberReference: z.string().length(32),
  carnet: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: IDENTIFICATION_ERROR }, { status: 400 });
  const portal = await findPublicPortal(parsed.data.token);
  if (!portal)
    return NextResponse.json(
      { error: "El enlace no es válido o fue revocado." },
      { status: 404 },
    );
  const state = portalState({
    enabled: portal.enabled,
    opensAt: portal.opensAt,
    closesAt: portal.closesAt,
    dueAt: portal.assignment.dueAt,
    allowLateSubmissions: portal.allowLateSubmissions,
    assignmentStatus: portal.assignment.status,
  });
  if (!["OPEN", "DUE_SOON", "LATE_ALLOWED"].includes(state))
    return NextResponse.json(
      {
        error:
          state === "UPCOMING"
            ? "El portal aún no está abierto."
            : state === "DISABLED"
              ? "El portal está desactivado."
              : "El portal está cerrado.",
      },
      { status: 403 },
    );
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ipHash = hashClientAddress(forwarded);
  const member = eligibleMembers(portal).find(
    (item) =>
      publicMemberReference(portal.id, item.id) === parsed.data.memberReference,
  );
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const failures = await prisma.submissionAuditEvent.findMany({
    where: {
      portalId: portal.id,
      eventType: "IDENTIFICATION_FAILED",
      createdAt: { gte: since },
      OR: [{ ipHash }, ...(member ? [{ memberId: member.id }] : [])],
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const delay = rateLimitDelay(failures.length);
  if (
    delay &&
    failures[0] &&
    Date.now() - failures[0].createdAt.getTime() < delay
  ) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos. Espere unos minutos e inténtelo nuevamente.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil(
              (delay - (Date.now() - failures[0].createdAt.getTime())) / 1000,
            ),
          ),
        },
      },
    );
  }
  const verified = member
    ? verifyCarnet(parsed.data.carnet, member.carnet)
    : verifyCarnet(parsed.data.carnet, "invalid-placeholder-value");
  if (!member || !verified) {
    await prisma.submissionAuditEvent.create({
      data: {
        assignmentId: portal.assignmentId,
        portalId: portal.id,
        memberId: member?.id,
        eventType: "IDENTIFICATION_FAILED",
        ipHash,
        userAgent: request.headers.get("user-agent")?.slice(0, 180),
      },
    });
    return NextResponse.json({ error: IDENTIFICATION_ERROR }, { status: 401 });
  }
  const session = await createPublicSubmissionSession({
    portalId: portal.id,
    assignmentId: portal.assignmentId,
    memberId: member.id,
    tokenVersion: portal.tokenVersion,
  });
  await prisma.submissionAuditEvent.create({
    data: {
      assignmentId: portal.assignmentId,
      portalId: portal.id,
      memberId: member.id,
      eventType: "IDENTIFICATION_SUCCEEDED",
      ipHash,
      userAgent: request.headers.get("user-agent")?.slice(0, 180),
    },
  });
  return NextResponse.json(
    {
      ok: true,
      csrf: session.csrf,
      expiresAt: session.expiresAt.toISOString(),
      details: memberDeliveryDetails(portal, member.id),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
