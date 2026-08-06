import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const DEFAULT_PORTAL_MIME_TYPES = ["application/pdf"] as const;
export const PUBLIC_SESSION_MAX_AGE_SECONDS = 30 * 60;
export const IDENTIFICATION_ERROR =
  "No fue posible verificar los datos. Revise la información e inténtelo nuevamente.";

function secretValue() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return secret;
}

export function generatePortalToken() {
  return randomBytes(32).toString("base64url");
}

export function createPortalCredentials() {
  const token = generatePortalToken();
  return { token, tokenHash: hashPortalToken(token), tokenCipher: encryptPortalToken(token) };
}

export function hashPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptPortalToken(token: string) {
  const key = createHash("sha256").update(secretValue()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((item) => item.toString("base64url"))
    .join(".");
}

export function decryptPortalToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Token cifrado inválido");
  const key = createHash("sha256").update(secretValue()).digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function publicMemberReference(portalId: string, memberId: string) {
  return createHmac("sha256", secretValue())
    .update(`${portalId}:${memberId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function normalizeCarnet(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("es-GT")
    .replace(/[\s-]+/g, "");
}

export function verifyCarnet(input: string, stored: string) {
  const left = createHash("sha256").update(normalizeCarnet(input)).digest();
  const right = createHash("sha256").update(normalizeCarnet(stored)).digest();
  return timingSafeEqual(left, right);
}

export type PortalState =
  | "UPCOMING"
  | "OPEN"
  | "DUE_SOON"
  | "CLOSED"
  | "LATE_ALLOWED"
  | "DISABLED";
export function portalState(
  input: {
    enabled: boolean;
    opensAt?: Date | string | null;
    closesAt?: Date | string | null;
    dueAt: Date | string;
    allowLateSubmissions: boolean;
    assignmentStatus?: string;
  },
  now = new Date(),
): PortalState {
  if (!input.enabled) return "DISABLED";
  if (input.assignmentStatus === "ARCHIVED") return "CLOSED";
  if (input.opensAt && now < new Date(input.opensAt)) return "UPCOMING";
  const closesAt = input.closesAt
    ? new Date(input.closesAt)
    : new Date(input.dueAt);
  if (now > closesAt)
    return input.allowLateSubmissions ? "LATE_ALLOWED" : "CLOSED";
  const dueAt = new Date(input.dueAt);
  if (now > dueAt)
    return input.allowLateSubmissions ? "LATE_ALLOWED" : "CLOSED";
  return dueAt.getTime() - now.getTime() <= 2 * 60 * 60 * 1000
    ? "DUE_SOON"
    : "OPEN";
}

export function rateLimitDelay(failedAttempts: number) {
  if (failedAttempts >= 10) return 60 * 60 * 1000;
  if (failedAttempts >= 7) return 15 * 60 * 1000;
  if (failedAttempts >= 5) return 5 * 60 * 1000;
  return 0;
}

export function hashClientAddress(value: string) {
  return createHmac("sha256", secretValue())
    .update(value || "unknown")
    .digest("hex");
}

export function createReceiptCode(
  courseCode: string | null | undefined,
  assignmentNumber: number,
  memberName: string,
) {
  const course =
    (courseCode || "CURSO")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6) || "CURSO";
  const initials =
    memberName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((item) => item[0])
      .join("")
      .toUpperCase()
      .slice(0, 5) || "EST";
  return `${course}-T${assignmentNumber}-${initials}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function allowedExtension(mimeType: string) {
  return (
    {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    } as Record<string, string>
  )[mimeType];
}
