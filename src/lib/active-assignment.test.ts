import { describe, expect, it } from "vitest";
import { isPdfBuildStale, resolveActiveAssignment } from "./active-assignment";

const assignments = [
  { id: "new", status: "DISTRIBUTED", value: 2 },
  { id: "old", status: "ARCHIVED", value: 1 },
];

describe("tarea activa", () => {
  it("prioriza la URL, luego la preferencia persistida", () => {
    expect(resolveActiveAssignment(assignments, "old", "new")?.id).toBe("old");
    expect(resolveActiveAssignment(assignments, null, "old")?.id).toBe("old");
  });

  it("no reutiliza una tarea inválida y elige una activa", () => {
    expect(resolveActiveAssignment(assignments, "missing", "missing")?.id).toBe("new");
  });
});

describe("vigencia del PDF", () => {
  it("marca desactualizado cuando el contenido cambió después del snapshot", () => {
    expect(isPdfBuildStale("2026-08-07T20:01:00.000Z", {
      createdAt: "2026-08-07T20:00:00.000Z",
      contentSnapshotAt: "2026-08-07T20:00:00.000Z",
    })).toBe(true);
  });

  it("conserva como vigente el snapshot recién regenerado", () => {
    expect(isPdfBuildStale("2026-08-07T20:01:00.000Z", {
      createdAt: "2026-08-07T20:02:00.000Z",
      contentSnapshotAt: "2026-08-07T20:01:00.000Z",
    })).toBe(false);
  });
});
