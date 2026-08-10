import { beforeEach, describe, expect, it, vi } from "vitest";

const { delMock } = vi.hoisted(() => ({ delMock: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: delMock }));

import { deleteBlobKeysWithRetry } from "./blob-cleanup";

describe("eliminación confiable de blobs", () => {
  beforeEach(() => delMock.mockReset());

  it("elimina claves únicas en una sola llamada", async () => {
    delMock.mockResolvedValue(undefined);
    await deleteBlobKeysWithRetry(["uno", "uno", "dos"]);
    expect(delMock).toHaveBeenCalledWith(["uno", "dos"]);
  });

  it("reintenta un fallo transitorio", async () => {
    delMock.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
    await deleteBlobKeysWithRetry(["uno"], 2);
    expect(delMock).toHaveBeenCalledTimes(2);
  });
});
