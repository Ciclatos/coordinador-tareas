import { describe, expect, it, vi } from "vitest";
import { isRetryableNetworkError, withNetworkRetry } from "./network-retry";

describe("reintentos de red", () => {
  it("reintenta timeouts y termina al recuperarse", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("fetch failed: ETIMEDOUT")).mockResolvedValue("ok");
    await expect(withNetworkRetry(operation, 2)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("no reintenta errores funcionales ni de cuota", async () => {
    expect(isRetryableNetworkError(new Error("Storage quota exceeded"))).toBe(false);
    const operation = vi.fn().mockRejectedValue(new Error("Tipo no permitido"));
    await expect(withNetworkRetry(operation)).rejects.toThrow("Tipo no permitido");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
