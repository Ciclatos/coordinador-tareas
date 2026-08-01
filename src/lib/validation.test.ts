import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./validation";

describe("validación de autenticación", () => {
  it("rechaza contraseñas débiles y correos inválidos", () => {
    expect(
      registerSchema.safeParse({
        name: "Ana Pérez",
        email: "incorrecto",
        password: "corta",
      }).success,
    ).toBe(false);
  });
  it("normaliza el correo y acepta una contraseña segura", () => {
    const result = registerSchema.parse({
      name: "Ana Pérez",
      email: " ANA@EXAMPLE.COM ",
      password: "Segura2026!",
    });
    expect(result.email).toBe("ana@example.com");
  });
  it("no exige reglas de complejidad al verificar una contraseña existente", () => {
    expect(
      loginSchema.safeParse({ email: "ana@example.com", password: "x" })
        .success,
    ).toBe(true);
  });
});
