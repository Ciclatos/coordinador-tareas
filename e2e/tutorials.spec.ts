import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `tutorial-${runId}@example.com`;
const password = "TutorialE2E-2026!";

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("onboarding general, contextual, persistencia, ayuda, reinicio y valores de sección", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill("Coordinador Tutorial E2E");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(
    page.getByText("Bienvenido a Coordinador de Tareas"),
  ).toBeVisible();
  await expect(page.getByText(/Paso 1 de 10/)).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(/Paso 2 de 10/)).toBeVisible();
  await page.getByRole("button", { name: "Omitir tutorial" }).click();
  await expect(
    page.getByText("Bienvenido a Coordinador de Tareas"),
  ).toBeHidden();
  await expect
    .poll(async () => {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { tutorialProgress: true },
      });
      return user?.tutorialProgress.find(
        (item) => item.tutorialKey === "general",
      )?.status;
    })
    .toBe("SKIPPED");
  await page.reload();
  await expect(
    page.getByText("Bienvenido a Coordinador de Tareas"),
  ).toBeHidden();

  await page.getByRole("button", { name: "Cursos" }).click();
  await expect(page.getByText("Tus cursos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect(page.locator(".driver-popover")).toBeHidden();
  await expect
    .poll(async () => {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { tutorialProgress: true },
      });
      return user?.tutorialProgress.find(
        (item) => item.tutorialKey === "courses",
      )?.status;
    })
    .toBe("COMPLETED");
  await page.reload();
  await page.getByRole("button", { name: "Cursos" }).click();
  await expect(page.getByText("Tus cursos", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Ayuda y tutoriales" }).click();
  const coursesRow = page
    .locator(".tutorial-list article")
    .filter({ hasText: "Cursos" });
  await expect(coursesRow.getByText("Completado")).toBeVisible();
  await coursesRow.getByRole("button", { name: "Volver a ver" }).click();
  await expect(page.getByText("Tus cursos", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Tus cursos", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Resumen" }).click();
  await expect(page.getByText("Organiza tu próximo trabajo grupal")).toBeVisible();
  await page.getByRole("button", { name: "Ayuda y tutoriales" }).click();
  const resetCoursesRow = page
    .locator(".tutorial-list article")
    .filter({ hasText: "Cursos" });
  await resetCoursesRow
    .getByRole("button", { name: "Reiniciar Cursos" })
    .click();
  await expect(resetCoursesRow.getByText("No visto")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ayuda" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Cursos" }).click();
  await expect(page.getByText("Tus cursos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Omitir tutorial" }).click();

  await page.getByLabel("Cerrar sesión").click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(
    page.getByText("Bienvenido a Coordinador de Tareas"),
  ).toBeHidden();

  await page.getByRole("button", { name: "Distribución", exact: true }).click();
  await expect(page.getByText("Configurar secciones")).toBeVisible();
  await page.getByRole("button", { name: "Omitir tutorial" }).click();
  const section = page.locator(".section-card").first();
  await expect(section.getByLabel("Tipo de selección")).toHaveValue("range");
  await expect(section.getByLabel("Desde")).toHaveValue("1");
  await expect(section.getByLabel("Hasta")).toHaveValue("");
  await expect(
    section.getByRole("button", { name: "Regenerar ejercicios" }),
  ).toBeDisabled();
  await section.getByLabel("Hasta").fill("10");
  await expect(
    section.getByRole("button", { name: "Regenerar ejercicios" }),
  ).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Ayuda y tutoriales" }).click();
  await expect(
    page.getByRole("dialog", { name: "Ayuda y tutoriales" }),
  ).toBeVisible();
  const box = await page.locator(".help-center").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box?.height).toBeLessThanOrEqual(844);
});
