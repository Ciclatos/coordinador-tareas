import { SignJWT, jwtVerify } from "jose";

export type PublicSubmissionSession = {
  portalId: string;
  assignmentId: string;
  memberId: string;
  tokenVersion: number;
  csrf: string;
};

function key() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(value);
}

export async function signPublicSubmissionToken(
  input: PublicSubmissionSession,
  expiresAt: Date,
) {
  return new SignJWT({ ...input, scope: "public-submission" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());
}

export async function verifyPublicSubmissionToken(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    if (
      payload.scope !== "public-submission" ||
      typeof payload.portalId !== "string" ||
      typeof payload.assignmentId !== "string" ||
      typeof payload.memberId !== "string" ||
      typeof payload.tokenVersion !== "number" ||
      typeof payload.csrf !== "string"
    )
      return null;
    return {
      portalId: payload.portalId,
      assignmentId: payload.assignmentId,
      memberId: payload.memberId,
      tokenVersion: payload.tokenVersion,
      csrf: payload.csrf,
    };
  } catch {
    return null;
  }
}
