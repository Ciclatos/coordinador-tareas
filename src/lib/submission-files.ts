import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export const MAX_SUBMISSION_FILE_SIZE = 25 * 1024 * 1024;
export const ALLOWED_SUBMISSION_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SubmissionMimeType = (typeof ALLOWED_SUBMISSION_TYPES)[number];

export function detectMimeType(bytes: Uint8Array): SubmissionMimeType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
    return "application/pdf";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function inspectSubmissionStream(
  stream: ReadableStream<Uint8Array>,
) {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  const signature: number[] = [];
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SUBMISSION_FILE_SIZE) {
      await reader.cancel("Archivo demasiado grande");
      throw new Error("El archivo supera el límite de 25 MB.");
    }
    hash.update(value);
    chunks.push(value);
    for (const byte of value) {
      if (signature.length >= 16) break;
      signature.push(byte);
    }
  }
  const mimeType = detectMimeType(Uint8Array.from(signature));
  if (!mimeType) throw new Error("El contenido del archivo no es compatible.");
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  let pageCount: number | null = null;
  if (mimeType === "application/pdf") {
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
      pageCount = pdf.getPageCount();
      if (!pageCount) throw new Error("PDF vacío");
    } catch {
      throw new Error("El PDF está dañado, vacío o protegido con contraseña.");
    }
  } else {
    try {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error("Imagen sin dimensiones");
      pageCount = 1;
    } catch {
      throw new Error("La imagen está dañada o incompleta.");
    }
  }
  return { sha256: hash.digest("hex"), mimeType, size, pageCount };
}
