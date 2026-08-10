import { describe, expect, it } from "vitest";
import { isPastStorageGrace, storageLevel, supersededBuilds } from "./storage-policy";

describe("política de almacenamiento", () => {
  it("protege cargas recientes durante 24 horas", () => {
    const now = new Date("2026-08-10T12:00:00Z").getTime();
    expect(isPastStorageGrace("2026-08-09T13:00:00Z", now)).toBe(false);
    expect(isPastStorageGrace("2026-08-09T12:00:00Z", now)).toBe(true);
  });

  it("conserva las tres compilaciones más recientes", () => {
    const builds = [1, 4, 2, 3].map((version) => ({ version }));
    expect(supersededBuilds(builds, 3).map((item) => item.version)).toEqual([1]);
  });

  it("aplica umbrales visuales de 75 y 90 por ciento", () => {
    expect(storageLevel(74.9)).toBe("normal");
    expect(storageLevel(75)).toBe("warning");
    expect(storageLevel(90)).toBe("critical");
  });
});
