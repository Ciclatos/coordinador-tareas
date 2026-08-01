import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("protección de rutas", () => {
  it("redirige a ingreso cuando no existe cookie de sesión", () => {
    const response = proxy(
      new NextRequest("https://coordinador-tareas.vercel.app/app"),
    );
    expect(response.headers.get("location")).toBe(
      "https://coordinador-tareas.vercel.app/ingresar",
    );
  });
  it("permite continuar cuando existe una cookie; la página valida luego la firma", () => {
    const request = new NextRequest(
      "https://coordinador-tareas.vercel.app/app",
      { headers: { cookie: "coordinador_session=token" } },
    );
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });
});
