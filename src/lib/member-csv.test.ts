import { describe, expect, it } from "vitest";
import { parseMemberCsv } from "./member-csv";

describe("importación CSV de integrantes", () => {
  it("acepta encabezados en español, comas entre comillas y deriva nombre corto", () => {
    const members = parseMemberCsv('nombre,carnet,correo\n"Pérez, Ana",A-01,ana@example.com');
    expect(members).toEqual([
      { fullName: "Pérez, Ana", shortName: "Pérez", carnet: "A-01", email: "ana@example.com" },
    ]);
  });
  it("rechaza carné duplicado", () => {
    expect(() => parseMemberCsv("nombre,carnet\nAna,A-01\nAnita,a-01")).toThrow(/repetido/);
  });
  it("exige encabezados y filas", () => {
    expect(() => parseMemberCsv("nombre,carnet")).toThrow(/al menos/);
  });
});
