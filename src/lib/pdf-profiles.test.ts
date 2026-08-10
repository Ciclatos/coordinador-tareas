import { describe, expect, it } from "vitest";
import { estimatePdfBytes, pdfQualityProfiles, reductionPercent } from "./pdf-profiles";

describe("perfiles PDF", () => {
  it("ordena tamaños estimados alta, equilibrada y compacta", () => {
    const source = 50 * 1024 * 1024;
    const high = estimatePdfBytes(source, "high");
    const balanced = estimatePdfBytes(source, "balanced");
    const compact = estimatePdfBytes(source, "compact");
    expect(high).toBeGreaterThan(balanced);
    expect(balanced).toBeGreaterThan(compact);
    expect(pdfQualityProfiles.balanced.targetDpi).toBeGreaterThanOrEqual(150);
  });

  it("calcula reducción sin valores negativos", () => {
    expect(reductionPercent(1000, 620)).toBe(38);
    expect(reductionPercent(1000, 1200)).toBe(0);
  });
});
