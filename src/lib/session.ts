import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
export const SESSION_COOKIE = "coordinador_session";
const MAX_AGE = 60 * 60 * 24 * 7;
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(value);
}
export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000);
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
export async function verifySessionToken(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.userId === "string"
      ? { userId: payload.userId }
      : null;
  } catch {
    return null;
  }
}
export const getSession = cache(async () =>
  verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value),
);
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/ingresar");
  return session;
}
