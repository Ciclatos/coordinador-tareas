import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { PUBLIC_SESSION_MAX_AGE_SECONDS } from "./submission-portal";
import {
  signPublicSubmissionToken,
  verifyPublicSubmissionToken,
  type PublicSubmissionSession,
} from "./public-submission-token";

export { verifyPublicSubmissionToken } from "./public-submission-token";

export const PUBLIC_SUBMISSION_COOKIE = "coordinador_public_submission";
export async function createPublicSubmissionSession(
  input: Omit<PublicSubmissionSession, "csrf">,
) {
  const csrf = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PUBLIC_SESSION_MAX_AGE_SECONDS * 1000,
  );
  const token = await signPublicSubmissionToken({ ...input, csrf }, expiresAt);
  (await cookies()).set(PUBLIC_SUBMISSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return { csrf, expiresAt };
}

export async function getPublicSubmissionSession() {
  return verifyPublicSubmissionToken(
    (await cookies()).get(PUBLIC_SUBMISSION_COOKIE)?.value,
  );
}

export async function clearPublicSubmissionSession() {
  (await cookies()).delete(PUBLIC_SUBMISSION_COOKIE);
}

export function validCsrf(
  session: PublicSubmissionSession | null,
  value: string | null | undefined,
) {
  return Boolean(session && value && session.csrf === value);
}
