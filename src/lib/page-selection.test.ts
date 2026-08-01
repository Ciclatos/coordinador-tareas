import { describe, expect, it } from "vitest";
import { formatPageSelection, parsePageSelection } from "./page-selection";

describe("selección de páginas", () => {
  it("convierte rangos a índices sin duplicados", () => {
    expect(parsePageSelection("1-3, 3, 5", 5)).toEqual([0, 1, 2, 4]);
  });
  it("usa vacío para representar todas las páginas", () => {
    expect(parsePageSelection("  ")).toBeUndefined();
  });
  it("rechaza páginas inexistentes y rangos invertidos", () => {
    expect(() => parsePageSelection("4", 3)).toThrow(/no existe/);
    expect(() => parsePageSelection("5-2")).toThrow(/inválido/);
  });
  it("formatea índices para edición humana", () => {
    expect(formatPageSelection([0, 2])).toBe("1, 3");
  });
});
