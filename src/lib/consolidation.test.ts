import { describe, expect, it } from "vitest";
import { autoConsolidationDue, checkConsolidation } from "./consolidation";

const valid = () => ({
  status: "FINALIZED",
  contentUpdatedAt: new Date("2026-08-10T10:00:00Z"),
  pendingCount: 0,
  correctionCount: 0,
  incompleteUploadCount: 0,
  files: [
    { id: "current", storageKey: "sub/current.pdf", sizeBytes: 1200, isCurrent: true },
    { id: "old", storageKey: "sub/old.pdf", sizeBytes: 800, isCurrent: false },
  ],
  latestBuild: {
    id: "build",
    status: "READY",
    storageKey: "pdf/final.pdf",
    contentSnapshotAt: new Date("2026-08-10T10:00:00Z"),
    sourceIds: ["current"],
  },
});

describe("política de consolidación", () => {
  it("calcula archivos, historial y espacio recuperable", () => {
    const result = checkConsolidation(valid());
    expect(result).toMatchObject({ eligible: true, fileCount: 2, historicalFileCount: 1, reclaimableBytes: 2000 });
  });

  it("bloquea pendientes, correcciones y PDF desactualizado", () => {
    const input = valid();
    input.pendingCount = 1;
    input.correctionCount = 1;
    input.contentUpdatedAt = new Date("2026-08-10T11:00:00Z");
    const result = checkConsolidation(input);
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/pendientes.*corrección.*desactualizado/i);
  });

  it("bloquea si una entrega vigente no fue incluida", () => {
    const input = valid();
    input.latestBuild.sourceIds = [];
    expect(checkConsolidation(input).reasons).toContain("El PDF final no incluye todas las entregas vigentes.");
  });

  it("respeta nunca y los periodos de gracia", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(autoConsolidationDue("2026-08-10T12:00:00Z", null, now)).toBe(false);
    expect(autoConsolidationDue("2026-08-10T12:00:00Z", 7, now)).toBe(true);
    expect(autoConsolidationDue("2026-08-11T12:00:00Z", 7, now)).toBe(false);
  });
});
