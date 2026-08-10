import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { deleteBlobKeysWithRetry } from "../src/lib/blob-cleanup";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `portal-${runId}@example.com`;
const password = "PortalE2E-2026!";
let courseId = "";
let currentPortalUrl = "";

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(password, 10),
      profile: { create: { name: "Coordinador Portal E2E" } },
    },
  });
  const course = await prisma.course.create({
    data: {
      userId: user.id,
      name: `Cálculo Portal ${runId}`,
      code: "CAL2",
      academicYear: 2026,
      members: {
        create: {
          fullName: "Carlos Eduardo Díaz García",
          shortName: "Carlos",
          carnet: "2026-01-1001",
          active: true,
        },
      },
    },
    include: { members: true },
  });
  courseId = course.id;
  const assignment = await prisma.assignment.create({
    data: {
      courseId: course.id,
      number: 4,
      weekNumber: 1,
      title: "Portal público E2E",
      topic: "Integrales",
      weekStart: new Date("2026-08-01T06:00:00Z"),
      weekEnd: new Date("2026-08-08T06:00:00Z"),
      dueAt: new Date(Date.now() + 86_400_000),
      instructions: "Mostrar procedimiento completo.",
      sections: {
        create: {
          name: "5.3",
          sortOrder: 0,
          exercises: {
            create: [
              { label: "2", sortOrder: 0 },
              { label: "8", sortOrder: 1 },
            ],
          },
        },
      },
    },
    include: { sections: { include: { exercises: true } } },
  });
  await prisma.exerciseAssignment.createMany({
    data: assignment.sections[0].exercises.map((exercise) => ({
      assignmentId: assignment.id,
      exerciseId: exercise.id,
      memberId: course.members[0].id,
      seed: "e2e",
    })),
  });
});

test.afterAll(async () => {
  const files = await prisma.submissionFile.findMany({
    where: { version: { submission: { assignment: { courseId } } } },
    select: { storageKey: true },
  });
  const builds = await prisma.pdfBuild.findMany({
    where: { assignment: { courseId }, storageKey: { not: null } },
    select: { storageKey: true },
  });
  await deleteBlobKeysWithRetry([
      ...files.flatMap((file) => file.storageKey ? [file.storageKey] : []),
      ...builds.flatMap((build) =>
        build.storageKey ? [build.storageKey] : [],
      ),
    ]);
  await prisma.assignment.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { id: courseId } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("portal público: identidad, entrega, corrección, reemplazo, aprobación y revocación", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  await page.getByText("Portal de entrega", { exact: true }).waitFor();
  await page.getByText("Portal activo").locator("input").check();
  await page.getByRole("button", { name: "Guardar y generar enlace" }).click();
  await expect(page.getByText("Portal guardado correctamente.")).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  const portalUrl = await page.getByLabel("Enlace público").inputValue();
  expect(portalUrl).toMatch(/\/entregar\/[A-Za-z0-9_-]{40,}/);
  await page.getByRole("button", { name: "Guardar y generar enlace" }).click();
  await expect(page.getByText("Portal guardado correctamente.")).toBeVisible();
  await expect(page.getByLabel("Enlace público")).toHaveValue(portalUrl);

  const student = await browser.newContext();
  const studentPage = await student.newPage();
  await studentPage.setViewportSize({ width: 390, height: 844 });
  await studentPage.goto(portalUrl);
  expect(await studentPage.content()).not.toContain("2026-01-1001");
  await expect(studentPage.getByLabel("Integrante")).toContainText(
    "Carlos Eduardo Díaz García",
  );
  await studentPage.getByLabel("Integrante").selectOption({ index: 1 });
  await studentPage.getByLabel(/Ingrese su carné/).fill("incorrecto");
  await studentPage.getByRole("button", { name: "Ver mi asignación" }).click();
  await expect(
    studentPage.getByText(/No fue posible verificar los datos/),
  ).toBeVisible();
  await studentPage.getByLabel(/Ingrese su carné/).fill("2026-01-1001");
  await studentPage.getByRole("button", { name: "Ver mi asignación" }).click();
  await expect(studentPage.getByText("Asignación confirmada")).toBeVisible();
  await expect(studentPage.getByText("2, 8")).toBeVisible();
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText("Entrega publica E2E", { x: 50, y: 700, font });
  const file = {
    name: "entrega-publica.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
  await studentPage.locator('input[type="file"]').setInputFiles(file);
  await studentPage.getByLabel(/Confirmo que el archivo/).check();
  await studentPage.getByRole("button", { name: "Enviar entrega" }).click();
  await expect(
    studentPage.getByText("Entrega recibida correctamente"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(studentPage.getByText(/CAL2-T4-CEDG/)).toBeVisible();

  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  await expect(
    page
      .locator(".portal-review")
      .getByText("Carlos Eduardo Díaz García", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Solicitar corrección" }).click();
  await page
    .getByLabel("Observaciones obligatorias")
    .fill("Corrija la página 1.");
  await page
    .getByRole("button", { name: "Enviar solicitud de corrección" })
    .click();
  await expect(
    page.getByText("Solicitud de corrección enviada."),
  ).toBeVisible();
  await student.close();

  const returning = await browser.newContext();
  const returnPage = await returning.newPage();
  await returnPage.goto(portalUrl);
  await returnPage.getByLabel("Integrante").selectOption({ index: 1 });
  await returnPage.getByLabel(/Ingrese su carné/).fill("2026-01-1001");
  await returnPage.getByRole("button", { name: "Ver mi asignación" }).click();
  await expect(returnPage.getByText("Corrija la página 1.")).toBeVisible();
  await returnPage
    .locator('input[type="file"]')
    .setInputFiles({ ...file, name: "entrega-corregida.pdf" });
  await returnPage.getByLabel(/Confirmo que el archivo/).check();
  await returnPage.getByRole("button", { name: "Enviar entrega" }).click();
  await expect(
    returnPage.getByText("Entrega recibida correctamente"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(returnPage.getByText("2", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Entrega aprobada correctamente.")).toBeVisible();
  await expect(
    page.locator(".portal-review").getByText("Aprobado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar rechazo" }),
  ).toBeDisabled();
  await page
    .getByLabel("Observaciones obligatorias")
    .fill("El archivo no corresponde a la asignación.");
  await page.getByRole("button", { name: "Confirmar rechazo" }).click();
  await expect(page.getByText("Entrega rechazada.")).toBeVisible();
  await expect(
    page.locator(".portal-review").getByText("Rechazado", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  await expect(
    page.locator(".portal-review").getByText("Rechazado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Entrega aprobada correctamente.")).toBeVisible();
  const stored = await prisma.submission.findFirstOrThrow({
    where: { assignment: { courseId } },
    include: { versions: { include: { files: true } } },
  });
  expect(stored.status).toBe("APPROVED");
  expect(stored.origin).toBe("PORTAL");
  expect(stored.versions).toHaveLength(2);
  expect(stored.versions.every((version) => version.assignmentSnapshot)).toBe(
    true,
  );
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "PDF final", exact: true })
    .click();
  await expect(page.getByText("entrega-corregida.pdf")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar y descargar" }).click();
  const finalPdf = await download;
  const stream = await finalPdf.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const finalBytes = Buffer.concat(chunks);
  expect(finalBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect((await PDFDocument.load(finalBytes)).getPageCount()).toBeGreaterThan(
    3,
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Entregas", exact: true })
    .click();
  const oldUrl = portalUrl;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Regenerar" }).click();
  await expect(page.getByLabel("Enlace público")).not.toHaveValue(oldUrl);
  currentPortalUrl = await page.getByLabel("Enlace público").inputValue();
  const revoked = await browser.newPage();
  await revoked.goto(oldUrl);
  await expect(revoked.getByText("Enlace inválido")).toBeVisible();
  await returning.close();
});

test("portal público: desactivado, cerrado, tardías e integrante excluido", async ({
  page,
}) => {
  const assignment = await prisma.assignment.findFirstOrThrow({
    where: { courseId },
    include: { submissionPortal: true, course: { include: { members: true } } },
  });
  const portal = assignment.submissionPortal!;
  const url = new URL(currentPortalUrl).pathname;
  await prisma.assignmentSubmissionPortal.update({
    where: { id: portal.id },
    data: { enabled: false },
  });
  await page.goto(url);
  await expect(page.getByText("Portal desactivado")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ver mi asignación" }),
  ).toBeDisabled();
  await prisma.assignmentSubmissionPortal.update({
    where: { id: portal.id },
    data: {
      enabled: true,
      closesAt: new Date(Date.now() - 60_000),
      allowLateSubmissions: false,
    },
  });
  await page.reload();
  await expect(page.getByText("Cerrada")).toBeVisible();
  await prisma.assignmentSubmissionPortal.update({
    where: { id: portal.id },
    data: { allowLateSubmissions: true },
  });
  await page.reload();
  await expect(
    page.getByText("Se aceptan entregas tardías", { exact: true }),
  ).toBeVisible();
  await prisma.assignmentExclusion.create({
    data: {
      assignmentId: assignment.id,
      memberId: assignment.course.members[0].id,
      reason: "E2E",
    },
  });
  await page.reload();
  await expect(page.getByLabel("Integrante").locator("option")).toHaveCount(1);
});
