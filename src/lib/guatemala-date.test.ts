import { describe, expect, it } from "vitest";
import { formatGuatemalaDateTimeLocal, parseGuatemalaDateTimeLocal } from "./guatemala-date";

describe("fecha límite en Guatemala", () => {
  it("interpreta las 21:00 de Guatemala como las 03:00 UTC del día siguiente", () => {
    expect(parseGuatemalaDateTimeLocal("2026-08-10T21:00").toISOString())
      .toBe("2026-08-11T03:00:00.000Z");
  });

  it("mantiene la hora local al editar una fecha persistida", () => {
    expect(formatGuatemalaDateTimeLocal("2026-08-11T03:00:00.000Z"))
      .toBe("2026-08-10T21:00");
  });

  it("rechaza entradas ambiguas sin fecha y hora completas", () => {
    expect(parseGuatemalaDateTimeLocal("2026-08-10").toString()).toBe("Invalid Date");
  });
});
