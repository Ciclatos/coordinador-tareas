import { describe, expect, it } from "vitest";
import { detectMimeType } from "@/lib/submission-files";
import { sanitizeFileName, submissionPath } from "@/lib/submission-path";

describe("archivos de entregas", () => {
  it("detecta firmas reales y no confía en la extensión", () => {
    expect(detectMimeType(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      "application/pdf",
    );
    expect(detectMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(detectMimeType(new TextEncoder().encode("archivo.pdf"))).toBeNull();
  });

  it("reconoce PNG y WEBP", () => {
    expect(
      detectMimeType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(detectMimeType(new TextEncoder().encode("RIFF0000WEBP"))).toBe(
      "image/webp",
    );
  });

  it("sanea nombres y construye rutas aisladas por tarea y carga", () => {
    expect(sanitizeFileName("  solución #5 áé.pdf ")).toBe("solucion-5-ae.pdf");
    expect(submissionPath("tarea1", "carga1", "../hoja?.png")).toBe(
      "submissions/tarea1/carga1/hoja-.png",
    );
  });
});
