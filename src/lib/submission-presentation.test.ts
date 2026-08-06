import { describe, expect, it } from "vitest";
import {
  submissionOriginLabel,
  submissionStatusLabel,
  submissionVersionLabel,
} from "./submission-presentation";

describe("presentación de entregas", () => {
  it.each([
    ["PENDING", "Pendiente"],
    ["SUBMITTED", "Entregado"],
    ["REVIEWING", "En revisión"],
    ["NEEDS_CORRECTION", "Requiere corrección"],
    ["APPROVED", "Aprobado"],
    ["REJECTED", "Rechazado"],
  ])("traduce %s", (status, label) =>
    expect(submissionStatusLabel(status)).toBe(label),
  );
  it("presenta tardía, origen y singular de versión", () => {
    expect(submissionStatusLabel("SUBMITTED", true)).toBe("Tardío");
    expect(submissionOriginLabel("PORTAL")).toBe("Entregado desde el portal");
    expect(submissionVersionLabel(1)).toBe("1 versión");
    expect(submissionVersionLabel(2)).toBe("2 versiones");
  });
});
