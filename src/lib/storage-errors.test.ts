import { describe, expect, it, vi } from "vitest";
import {
  isStorageCapacityError,
  logStorageError,
  publicUploadError,
  STORAGE_MESSAGE,
} from "./storage-errors";

describe("errores de almacenamiento", () => {
  it("reconoce el error de cuota de Vercel Blob", () => {
    expect(isStorageCapacityError(new Error("Vercel Blob: Storage quota exceeded for Hobby plan"))).toBe(true);
  });

  it("nunca expone el mensaje interno al estudiante", () => {
    expect(publicUploadError(new Error("Storage quota exceeded"), "fallback")).toBe(STORAGE_MESSAGE);
    expect(publicUploadError(new Error("otro error interno"), "fallback")).toBe("fallback");
  });

  it("registra la causa técnica solo en el servidor", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logStorageError("public-upload", new Error("quota exceeded"));
    expect(logger).toHaveBeenCalledWith(
      "storage_capacity_error",
      expect.objectContaining({ context: "public-upload", message: "quota exceeded" }),
    );
    logger.mockRestore();
  });
});
