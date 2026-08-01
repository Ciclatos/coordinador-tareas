import { describe, expect, it } from "vitest";
import { duplicateLabels, emptySection, generateSectionLabels, sectionFromStored } from "./section-config";

describe("configuración independiente por sección", () => {
  it("genera 6, 10 y 4 ejercicios sin compartir configuración", () => {
    const a = { ...emptySection("a", "5.3"), start: 5, end: 30, interval: 5 };
    const b = { ...emptySection("b", "5.4"), start: 5, end: 50, interval: 5 };
    const c = { ...emptySection("c", "5.5"), selection: "manual" as const, manualList: "5,10,15,20" };
    expect([generateSectionLabels(a).length, generateSectionLabels(b).length, generateSectionLabels(c).length]).toEqual([6, 10, 4]);
    expect(generateSectionLabels(a)).toContain("5");
    expect(generateSectionLabels(b)).toContain("5");
    expect(generateSectionLabels(c)).toContain("5");
  });

  it("aplica exclusiones e inclusiones únicamente a su sección", () => {
    const section = { ...emptySection("a"), selection: "range" as const, start: 1, end: 5, interval: 1, exclusions: "2,4", inclusions: "8a" };
    expect(generateSectionLabels(section)).toEqual(["1", "3", "5", "8a"]);
  });

  it("detecta duplicados manuales y conserva la configuración persistida", () => {
    expect(duplicateLabels("5, 10, 5, 15, 10")).toEqual(["5", "10"]);
    const restored = sectionFromStored({
      id: "a", name: "5.3", labels: ["5", "10"], notes: "Revisar", defaultWeight: 2,
      rule: { selection: "multiple", start: 5, end: 30, interval: 5, exclusions: "", inclusions: "35" },
    });
    expect(restored).toMatchObject({ name: "5.3", end: 30, interval: 5, defaultWeight: 2, notes: "Revisar" });
  });
});
