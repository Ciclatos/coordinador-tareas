import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `e2e-${runId}@example.com`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("protege la aplicación, registra una cuenta y persiste el CRUD base", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar$/);

  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill("Usuario E2E");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("PruebaE2E-2026!");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Hola, Usuario" })).toBeVisible();

  await page.getByRole("button", { name: "Cursos" }).click();
  await page.getByRole("button", { name: "Nuevo curso" }).click();
  await page.getByLabel("Nombre del curso").fill(`Curso E2E ${runId}`);
  await page.getByLabel("Código").fill("E2E-101");
  await page.getByLabel("Docente").fill("Docente de prueba");
  await page.getByLabel("Sección").fill("A");
  await page.getByLabel("Número de grupo").fill("1");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Curso creado correctamente.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `Curso E2E ${runId}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Integrantes", exact: true }).click();
  await page.getByRole("button", { name: "Agregar integrante" }).click();
  await page.getByLabel("Curso").selectOption({ label: `Curso E2E ${runId}` });
  await page.getByLabel("Nombre completo").fill("Ana Integrante E2E");
  await page.getByLabel("Nombre corto").fill("Ana");
  await page.getByLabel("Carné").fill(`E2E-${runId}`);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Integrante agregado.")).toBeVisible();
  await expect(page.getByText("Ana Integrante E2E")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Integrantes", exact: true }).click();
  await expect(page.getByText("Ana Integrante E2E")).toBeVisible();
});
