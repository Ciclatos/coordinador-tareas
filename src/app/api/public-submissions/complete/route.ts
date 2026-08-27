import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPublicSubmissionSession,
  validCsrf,
} from "@/lib/public-submission-session";
import {
  finalizePublicSubmission,
  PublicSubmissionFinalizeError,
} from "@/lib/public-submission-finalizer";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  csrf: z.string(),
  idempotencyKey: z.string().uuid(),
  uploadId: z.string().uuid(),
  pathname: z.string().min(1).max(500),
  originalName: z.string().min(1).max(255),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  const session = await getPublicSubmissionSession();
  if (!session)
    return NextResponse.json(
      { error: "La sesión expiró. Confirme su identidad nuevamente." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validCsrf(session, parsed.data.csrf))
    return NextResponse.json(
      { error: "Confirmación inválida." },
      { status: 400 },
    );
  try {
    const result = await finalizePublicSubmission({
      portalId: session.portalId,
      assignmentId: session.assignmentId,
      memberId: session.memberId,
      tokenVersion: session.tokenVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      uploadId: parsed.data.uploadId,
      pathname: parsed.data.pathname,
      originalName: parsed.data.originalName,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PublicSubmissionFinalizeError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("[public-submission-complete] Error inesperado", error);
    return NextResponse.json(
      { error: "No se pudo registrar la entrega. Inténtelo nuevamente." },
      { status: 500 },
    );
  }
}
