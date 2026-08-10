import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { deleteBlobKeysWithRetry } from "../src/lib/blob-cleanup";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `e2e-${runId}@example.com`;

test.afterAll(async () => {
  const stored = await prisma.course.findMany({
    where: { user: { email } },
    select: {
      assignments: { select: {
        pdfBuilds: { select: { storageKey: true } },
        submissions: { select: { versions: { select: { files: { select: { storageKey: true } } } } } },
      } },
    },
  });
  const storageKeys = stored.flatMap((course) => course.assignments.flatMap((assignment) => [
    ...assignment.pdfBuilds.flatMap((build) => build.storageKey ? [build.storageKey] : []),
    ...assignment.submissions.flatMap((submission) => submission.versions.flatMap((version) => version.files.flatMap((file) => file.storageKey ? [file.storageKey] : []))),
  ]));
  await deleteBlobKeysWithRetry(storageKeys);
  await prisma.$transaction([
    prisma.assignment.deleteMany({
      where: { course: { user: { email } } },
    }),
    prisma.course.deleteMany({ where: { user: { email } } }),
    prisma.user.deleteMany({ where: { email } }),
  ]);
  await prisma.$disconnect();
});

test("protege la aplicación, registra una cuenta y persiste el CRUD base", async ({ page }) => {
  test.setTimeout(720_000);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar$/);

  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill("Usuario E2E");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("PruebaE2E-2026!");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(page.getByText("Bienvenido a Coordinador de Tareas")).toBeVisible();
  await page.getByRole("button", { name: "Omitir tutorial" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Usuario" })).toBeVisible();
  await page.getByRole("button", { name: "Configuración", exact: true }).click();
  await page.getByRole("button", { name: "Consultar uso" }).click();
  await expect(page.getByText(/MB \/ 1\.00 GB/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Entregas vigentes", { exact: true })).toBeVisible();
  await expect(page.getByText(/0 referencias sin blob/)).toBeVisible();
  const e2eUser = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userTutorialProgress.createMany({
    skipDuplicates: true,
    data: [
      "courses",
      "members",
      "assignments",
      "distribution",
      "submission_portal",
      "submissions",
      "evaluations",
      "report",
      "pdf_builder",
    ].map((tutorialKey) => ({
      userId: e2eUser.id,
      tutorialKey,
      status: "SKIPPED" as const,
      tutorialVersion: 1,
      startedAt: new Date(),
      skippedAt: new Date(),
    })),
  });

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

  await page.getByRole("button", { name: "Tareas", exact: true }).click();
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Curso").selectOption({ label: `Curso E2E ${runId}` });
  await page.getByLabel("Número de tarea").fill("1");
  await page.getByLabel("Número de semana").fill("1");
  await page.getByLabel("Título").fill("Distribución E2E");
  await page.getByLabel("Tema").fill("Prueba automatizada");
  await page.getByLabel("Inicio de semana").fill("2026-08-01");
  await page.getByLabel("Final de semana").fill("2026-08-07");
  await page.getByLabel("Fecha y hora límite").fill("2027-08-08T21:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Tarea creada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Distribución E2E/ })).toBeVisible();
  await expect(page.locator(".task-row")).toContainText(/9:00\s*p\.\s*m\./i);
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByLabel("Fecha y hora límite")).toHaveValue("2027-08-08T21:00");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Distribución", exact: true })
    .click();
  let cards = page.locator(".section-card");
  await cards.nth(0).getByLabel("Nombre o número de sección").fill("5.3");
  await cards.nth(0).getByLabel("Hasta").fill("30");
  await cards.nth(0).getByRole("button", { name: "Regenerar ejercicios" }).click();
  await expect(cards.nth(0).getByText("30 ejercicio(s)")).toBeVisible();

  await page.getByRole("button", { name: "Agregar sección" }).click();
  cards = page.locator(".section-card");
  await cards.nth(1).getByLabel("Nombre o número de sección").fill("5.4");
  await cards.nth(1).getByLabel("Hasta").fill("50");
  await cards.nth(1).getByRole("button", { name: "Regenerar ejercicios" }).click();
  await expect(cards.nth(1).getByText("50 ejercicio(s)")).toBeVisible();

  await page.getByRole("button", { name: "Agregar sección" }).click();
  cards = page.locator(".section-card");
  await cards.nth(2).getByLabel("Nombre o número de sección").fill("5.5");
  await cards.nth(2).getByLabel("Tipo de selección").selectOption("manual");
  await cards.nth(2).getByRole("textbox", { name: "Lista manual", exact: true }).fill("5, 10, 15, 20");
  await cards.nth(2).getByRole("button", { name: "Regenerar ejercicios" }).click();
  await expect(cards.nth(2).getByText("4 ejercicio(s)")).toBeVisible();
  await expect(page.getByText("84 ejercicios en total")).toBeVisible();

  await page.getByRole("button", { name: "Redistribuir" }).click();
  await expect(page.getByText(/84 ejercicios distribuidos sin duplicados/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar distribución" }).click();
  await expect(page.getByText("Distribución guardada y reproducible.")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Distribución", exact: true }).click();
  cards = page.locator(".section-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByText("30 ejercicio(s)")).toBeVisible();
  await expect(cards.nth(1).getByText("50 ejercicio(s)")).toBeVisible();
  await expect(cards.nth(2).getByText("4 ejercicio(s)")).toBeVisible();
  await expect(page.getByText("84 ejercicios en total")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "5.3" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "5.4" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "5.5" })).toBeVisible();
  const whatsapp = page.locator(".whatsapp-panel textarea");
  await expect(whatsapp).toHaveValue(/📘 Curso E2E/);
  await expect(whatsapp).toHaveValue(/• 5.3:/);
  await expect(whatsapp).toHaveValue(/• 5.4:/);
  await expect(whatsapp).toHaveValue(/• 5.5:/);
  await expect(whatsapp).toHaveValue(/• Total: 84 ejercicios/);

  await cards.nth(1).getByLabel("Hasta").fill("45");
  await cards.nth(1).getByRole("button", { name: "Regenerar ejercicios" }).click();
  await expect(cards.nth(1).getByText("45 ejercicio(s)")).toBeVisible();
  await expect(cards.nth(0).getByText("30 ejercicio(s)")).toBeVisible();
  await expect(cards.nth(2).getByText("4 ejercicio(s)")).toBeVisible();
  await cards.nth(1).getByLabel("Hasta").fill("50");
  await cards.nth(1).getByRole("button", { name: "Regenerar ejercicios" }).click();
  await page.getByRole("button", { name: "Guardar distribución" }).click();
  await expect(page.getByText("Distribución guardada y reproducible.")).toBeVisible({ timeout: 30_000 });

  const imagePanel = page.locator(".image-export-panel");
  await expect(imagePanel.getByLabel("Formato")).toHaveValue("summary");
  await expect(imagePanel.getByLabel("Tamaño")).toHaveValue("whatsapp");
  await expect(imagePanel.locator("select").nth(2)).toHaveValue("full");
  const preview = imagePanel.locator(".image-preview img");
  await expect(preview).toBeVisible();
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toMatch(/tarea-1-distribucion\.png$/);
  const stream = await png.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const pngBuffer = Buffer.concat(chunks);
  expect(pngBuffer.subarray(1, 4).toString()).toBe("PNG");
  const metadata = await sharp(pngBuffer).metadata();
  expect(metadata.width).toBeGreaterThanOrEqual(900);
  expect(metadata.height).toBeGreaterThanOrEqual(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  await expect(page.locator(".image-export-panel")).toHaveCSS("grid-column-start", "auto");
  await page.setViewportSize({ width: 1280, height: 900 });

  await imagePanel.getByLabel("Formato").selectOption("cards");
  await expect(imagePanel.getByText("Imagen actualizada automáticamente ✓")).toBeVisible();
  const zipDownload = page.waitForEvent("download");
  await imagePanel.getByRole("button", { name: "Descargar tarjetas en ZIP" }).click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toMatch(/tarea-1-tarjetas\.zip$/);
  const zipStream = await zip.createReadStream();
  const zipChunks: Buffer[] = [];
  for await (const chunk of zipStream) zipChunks.push(Buffer.from(chunk));
  expect(Buffer.concat(zipChunks).subarray(0, 2).toString()).toBe("PK");

  await page.evaluate(() => Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined }));
  const clipboardFallback = page.waitForEvent("download");
  await imagePanel.getByRole("button", { name: "Copiar imagen" }).click();
  await clipboardFallback;
  await expect(page.getByText(/se descargó el PNG como alternativa/i)).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
  });
  const shareFallback = page.waitForEvent("download");
  await imagePanel.getByRole("button", { name: "Compartir", exact: true }).click();
  await shareFallback;

  await page.getByRole("navigation").getByRole("button", { name: "Entregas", exact: true }).click();
  const fixtureFiles = await Promise.all([1, 2].map(async (number) => {
    const fixture = await PDFDocument.create();
    const page = fixture.addPage([612, 792]);
    // Suficiente para comprobar recompressión sin convertir el E2E en una
    // prueba de estrés de red contra Blob.
    const width = 1400;
    const height = 1400;
    const noise = randomBytes(width * height * 3);
    const png = await sharp(noise, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const image = await fixture.embedPng(png);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    return {
      name: `entrega-e2e-${number}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(await fixture.save()),
    };
  }));
  await page.locator('input[type="file"]').setInputFiles(fixtureFiles);
  await page.getByRole("button", { name: "Guardar entrega privada" }).click();
  await expect(page.getByText(/Entrega guardada como versión 1/)).toBeVisible({ timeout: 120_000 });

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Evaluación", exact: true })
    .click();
  await page.getByRole("button", { name: "Aplicar 20 a todos" }).click();
  await page.getByLabel("Comentario de Ana Integrante E2E").fill("Se observó procedimiento incompleto y presentación poco legible.");
  await expect(page.locator(".save-status")).toHaveText("Guardando…", { timeout: 30_000 });
  await expect(page.locator(".save-status")).toHaveText("Guardado ✓", { timeout: 30_000 });
  await expect(page.getByRole("cell", { name: "100" })).toBeVisible();

  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Evaluación", exact: true })
    .click();
  await expect(page.getByRole("cell", { name: "100" })).toBeVisible();
  await expect(page.getByLabel("Comentario de Ana Integrante E2E")).toHaveValue(/procedimiento incompleto/);

  await page.getByRole("navigation").getByRole("button", { name: "PDF final", exact: true }).click();
  await page.getByRole("button", { name: "Generar desde datos actuales" }).click();
  await expect(page.getByLabel("Texto del reporte semanal")).toHaveValue(/Observaciones del coordinador[\s\S]*procedimientos[\s\S]*legibilidad/i);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar y descargar" }).click();
  const finalPdf = await download;
  const finalStream = await finalPdf.createReadStream();
  const finalChunks: Buffer[] = [];
  for await (const chunk of finalStream) finalChunks.push(Buffer.from(chunk));
  const finalBytes = Buffer.concat(finalChunks);
  expect(finalBytes.subarray(0, 5).toString()).toBe("%PDF-");
  // El fixture contiene escaneos deliberadamente grandes: el perfil
  // equilibrado debe mantener un PDF sustancial, pero ya no superar 25 MiB.
  expect(finalBytes.byteLength).toBeGreaterThan(256 * 1024);
  expect(finalBytes.byteLength).toBeLessThan(25 * 1024 * 1024);
  await expect(page.getByText(/PDF final generado y guardado como versión 1/)).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "PDF final", exact: true }).click();
  await expect(page.getByText("Versión 1", { exact: true })).toBeVisible();
  const staleWarning = page.getByText("PDF desactualizado.", { exact: true });
  if (await staleWarning.isVisible()) {
    const refreshedDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Generar nueva versión" }).click();
    await refreshedDownload;
    await expect(page.getByText(/PDF final generado y guardado como versión 2/)).toBeVisible({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Comprobar requisitos" }).click();
  await expect(page.getByText(/2 archivos individuales/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar tarea" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalizar tarea" }).click();
  await expect(page.getByText(/Tarea finalizada\. Los archivos aún se conservan/)).toBeVisible();
  await page.locator(".consolidation-panel input").fill("LIBERAR TAREA 1");
  await page.getByRole("button", { name: "Liberar almacenamiento" }).click();
  await expect(page.getByText(/Tarea consolidada/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Generar y descargar" })).toBeDisabled();
  const consolidated = await prisma.assignment.findFirstOrThrow({
    where: { course: { user: { email } }, number: 1 },
    select: {
      status: true,
      consolidatedBytes: true,
      submissions: { select: { versions: { select: { files: { select: { storageKey: true, binaryDeletedAt: true, sha256: true, pageCount: true } } } } } },
      pdfBuilds: { where: { status: "READY" }, select: { storageKey: true } },
    },
  });
  expect(consolidated.status).toBe("CONSOLIDATED");
  expect(consolidated.consolidatedBytes).toBeGreaterThan(0);
  expect(consolidated.submissions.flatMap((submission) => submission.versions.flatMap((version) => version.files)).every((file) => !file.storageKey && file.binaryDeletedAt && file.sha256 && file.pageCount)).toBe(true);
  expect(consolidated.pdfBuilds.some((build) => build.storageKey)).toBe(true);
});
