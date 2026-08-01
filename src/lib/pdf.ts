import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Allocation, Exercise, Member } from "./domain";

export type StoredPdfSource = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  rotation?: 0 | 90 | 180 | 270;
  selectedPages?: number[];
  pageCount?: number | null;
};

export type AssignmentPdfData = {
  systemName: string;
  logoBytes?: Uint8Array;
  course: {
    name: string;
    code?: string | null;
    teacher?: string | null;
    degree?: string | null;
    faculty?: string | null;
    university?: string | null;
    campus?: string | null;
    shift?: string | null;
    cycle?: string | null;
    semester?: string | null;
    section?: string | null;
    groupNumber?: string | null;
  };
  assignment: {
    number: number;
    weekNumber: number;
    title: string;
    topic?: string | null;
    weekStart: string;
    weekEnd: string;
    dueAt: string;
  };
  members: Member[];
  exercises: Exercise[];
  allocations: Allocation[];
  evaluations: Array<{
    memberId: string;
    total: number;
    scores: Array<{ name: string; score: number; maxScore: number }>;
  }>;
  reportBody: string;
  files: File[];
  storedFiles?: StoredPdfSource[];
};

const letter: [number, number] = [612, 792];
const green = rgb(0.35, 0.62, 0.16);
const dark = rgb(0.08, 0.11, 0.1);
const muted = rgb(0.38, 0.42, 0.4);
const border = rgb(0.82, 0.85, 0.83);

type Fonts = { regular: PDFFont; bold: PDFFont };

function drawText(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  options: { color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
) {
  page.drawText(value, {
    x,
    y,
    size,
    font,
    color: options.color ?? dark,
    maxWidth: options.maxWidth,
  });
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of value.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function header(page: PDFPage, title: string, subtitle: string, fonts: Fonts) {
  page.drawRectangle({ x: 0, y: 748, width: 612, height: 44, color: dark });
  drawText(page, title, 48, 768, 15, fonts.bold, { color: rgb(1, 1, 1) });
  drawText(page, subtitle, 48, 753, 8, fonts.regular, { color: rgb(0.84, 0.88, 0.85) });
}

function footer(page: PDFPage, pageNumber: number, systemName: string, fonts: Fonts) {
  page.drawLine({ start: { x: 48, y: 38 }, end: { x: 564, y: 38 }, thickness: 0.6, color: border });
  drawText(page, systemName, 48, 23, 7.5, fonts.regular, { color: muted });
  drawText(page, String(pageNumber), 548, 23, 8, fonts.bold, { color: muted });
}

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "short",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Guatemala",
  }).format(new Date(value));
}

async function sourceBytes(source: File | StoredPdfSource) {
  if (source instanceof File)
    return { bytes: new Uint8Array(await source.arrayBuffer()), mimeType: source.type, name: source.name };
  const response = await fetch(source.url, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo leer ${source.name}.`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: source.mimeType, name: source.name };
}

async function normalizeImage(bytes: Uint8Array, mimeType: string) {
  const bitmap = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: mimeType }),
    { imageOrientation: "from-image" },
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo convertir la imagen WEBP.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("No se pudo convertir la imagen."))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createAssignmentPdf(data: AssignmentPdfData) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.course.name} - Tarea ${data.assignment.number}`);
  doc.setAuthor(data.systemName);
  doc.setSubject("Reporte de desempeño semanal y desarrollo de ejercicios");
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const copiedPageIndexes = new Set<number>();
  let pageNumber = 0;
  const addAdminPage = (title: string, subtitle: string) => {
    const page = doc.addPage(letter);
    pageNumber += 1;
    header(page, title, subtitle, fonts);
    footer(page, pageNumber, data.systemName, fonts);
    return page;
  };

  // 1. Portada del reporte
  let page = addAdminPage("REPORTE DE DESEMPEÑO SEMANAL", `Semana ${data.assignment.weekNumber}`);
  const university = data.course.university || "Universidad Mariano Gálvez de Guatemala";
  drawText(page, university.toUpperCase(), 56, 690, 17, fonts.bold, { maxWidth: 500 });
  drawText(page, (data.course.faculty || "Facultad").toUpperCase(), 56, 663, 10, fonts.bold, { color: green });
  const details = [
    ["Curso", data.course.name],
    ["Código", data.course.code || "No especificado"],
    ["Docente", data.course.teacher || "No especificado"],
    ["Carrera", data.course.degree || "No especificada"],
    ["Sede y jornada", [data.course.campus, data.course.shift].filter(Boolean).join(" - ") || "No especificadas"],
    ["Semestre y sección", [data.course.semester, data.course.section].filter(Boolean).join(" - ") || "No especificados"],
  ];
  details.forEach(([label, value], index) => {
    const y = 610 - index * 43;
    drawText(page, label.toUpperCase(), 56, y, 7.5, fonts.bold, { color: muted });
    drawText(page, value, 56, y - 18, 11, fonts.regular, { maxWidth: 500 });
  });
  drawText(page, "INTEGRANTES", 56, 330, 8, fonts.bold, { color: muted });
  data.members.forEach((member, index) => {
    const column = index >= Math.ceil(data.members.length / 2) ? 1 : 0;
    const row = column ? index - Math.ceil(data.members.length / 2) : index;
    drawText(page, member.name, 56 + column * 260, 304 - row * 26, 9, fonts.regular, { maxWidth: 210 });
    drawText(page, member.carnet, 56 + column * 260, 293 - row * 26, 7.5, fonts.bold, { color: muted });
  });
  drawText(page, `${formatDate(data.assignment.weekStart)} al ${formatDate(data.assignment.weekEnd)}`, 56, 74, 10, fonts.bold, { color: green });

  // 2. Desempeño grupal
  page = addAdminPage("DESEMPEÑO GRUPAL", `Tarea ${data.assignment.number} - ${data.assignment.title}`);
  drawText(page, `Semana #${data.assignment.weekNumber} de trabajo`, 56, 706, 11, fonts.bold);
  let y = 674;
  for (const line of wrap(data.reportBody, fonts.regular, 10, 500)) {
    drawText(page, line, 56, y, 10, fonts.regular);
    y -= 16;
  }
  y -= 18;
  drawText(page, "SECCIONES Y EJERCICIOS", 56, y, 8, fonts.bold, { color: muted });
  y -= 23;
  const sections = [...new Set(data.exercises.map((exercise) => exercise.section))];
  for (const section of sections) {
    const labels = data.exercises.filter((exercise) => exercise.section === section).map((exercise) => exercise.label);
    drawText(page, `${section}: ${labels.join(", ")}`, 56, y, 9, fonts.regular, { maxWidth: 500 });
    y -= 18;
  }

  // 3. Tabla detallada
  page = addAdminPage("EVALUACIÓN DETALLADA", "Criterios configurados y puntuaciones por integrante");
  const criteria = data.evaluations[0]?.scores ?? [
    { name: "Puntualidad", maxScore: 20, score: 0 },
    { name: "Presentación", maxScore: 20, score: 0 },
    { name: "Trabajo en equipo", maxScore: 20, score: 0 },
    { name: "Comunicación", maxScore: 20, score: 0 },
    { name: "Ejercicios completos", maxScore: 20, score: 0 },
  ];
  const columns = [190, ...criteria.map(() => 62), 48];
  const tableX = 32;
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  let tableY = 708;
  page.drawRectangle({ x: tableX, y: tableY - 38, width: tableWidth, height: 38, color: green });
  let x = tableX;
  drawText(page, "Integrante", x + 6, tableY - 22, 8, fonts.bold, { color: rgb(1, 1, 1) });
  x += columns[0];
  criteria.forEach((criterion, index) => {
    const short = criterion.name.length > 12 ? `${criterion.name.slice(0, 11)}.` : criterion.name;
    drawText(page, short, x + 3, tableY - 16, 6.5, fonts.bold, { color: rgb(1, 1, 1), maxWidth: columns[index + 1] - 6 });
    drawText(page, `/${criterion.maxScore}`, x + 3, tableY - 28, 6.5, fonts.regular, { color: rgb(1, 1, 1) });
    x += columns[index + 1];
  });
  drawText(page, "Total", x + 5, tableY - 22, 7, fonts.bold, { color: rgb(1, 1, 1) });
  tableY -= 38;
  data.members.forEach((member, rowIndex) => {
    const evaluation = data.evaluations.find((item) => item.memberId === member.id);
    const rowY = tableY - rowIndex * 40;
    page.drawRectangle({ x: tableX, y: rowY - 40, width: tableWidth, height: 40, color: rowIndex % 2 ? rgb(0.97, 0.98, 0.97) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
    drawText(page, member.name, tableX + 6, rowY - 17, 8, fonts.bold, { maxWidth: 176 });
    drawText(page, member.carnet, tableX + 6, rowY - 30, 7, fonts.regular, { color: muted });
    let scoreX = tableX + columns[0];
    criteria.forEach((_, criterionIndex) => {
      drawText(page, String(evaluation?.scores[criterionIndex]?.score ?? "-"), scoreX + 22, rowY - 24, 9, fonts.regular);
      scoreX += columns[criterionIndex + 1];
    });
    drawText(page, String(evaluation?.total ?? "-"), scoreX + 10, rowY - 24, 10, fonts.bold, { color: green });
  });

  // 4. Tabla resumen
  page = addAdminPage("RESUMEN DE NOTAS", "Puntuación total por integrante");
  tableY = 700;
  page.drawRectangle({ x: 56, y: tableY - 32, width: 500, height: 32, color: green });
  ["Integrante", "Carné", "Nota / 100"].forEach((label, index) =>
    drawText(page, label, [64, 330, 482][index], tableY - 20, 8, fonts.bold, { color: rgb(1, 1, 1) }),
  );
  data.members.forEach((member, index) => {
    const rowY = tableY - 32 - index * 42;
    const evaluation = data.evaluations.find((item) => item.memberId === member.id);
    page.drawRectangle({ x: 56, y: rowY - 42, width: 500, height: 42, color: index % 2 ? rgb(0.97, 0.98, 0.97) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
    drawText(page, member.name, 64, rowY - 25, 9, fonts.regular, { maxWidth: 250 });
    drawText(page, member.carnet, 330, rowY - 25, 9, fonts.regular);
    drawText(page, String(evaluation?.total ?? "-"), 500, rowY - 25, 11, fonts.bold, { color: green });
  });

  // 5. Carátula oficial recreada
  page = addAdminPage("CARÁTULA OFICIAL", `Grupo ${data.course.groupNumber || "-"}`);
  try {
    let logoBytes = data.logoBytes;
    if (!logoBytes) {
      const logoResponse = await fetch("/assets/umg-logo.png");
      if (logoResponse.ok) logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
    }
    if (logoBytes) {
      const logo = await doc.embedPng(logoBytes);
      const scale = Math.min(120 / logo.width, 100 / logo.height);
      page.drawImage(logo, { x: 246, y: 548, width: logo.width * scale, height: logo.height * scale });
    }
  } catch {
    // El texto institucional sigue identificando la carátula si el activo no carga.
  }
  drawText(page, "MATEMÁTICA", 198, 690, 25, fonts.bold, { color: green });
  drawText(page, university.toUpperCase(), 120, 520, 15, fonts.bold, { maxWidth: 390 });
  const coverLines = [
    `Curso: ${data.course.name}`,
    `Código: ${data.course.code || "-"}`,
    `Docente: ${data.course.teacher || "-"}`,
    `Semestre: ${data.course.semester || "-"}    Sección: ${data.course.section || "-"}`,
    `TAREA No. ${data.assignment.number}`,
    `Tema: ${data.assignment.topic || data.assignment.title}`,
    `Fecha de entrega: ${formatDate(data.assignment.dueAt, true)}`,
  ];
  coverLines.forEach((line, index) => drawText(page, line, 104, 480 - index * 30, index === 4 ? 14 : 10, index === 4 ? fonts.bold : fonts.regular, { maxWidth: 410 }));
  const grading = [
    ["Carátula", "5"], ["Fecha de entrega", "5"], ["Presentación", "10"],
    ["Ejercicios completos", "40"], ["Ejercicios al azar (3)", "40"], ["Total", "100"],
  ];
  drawText(page, "CRITERIO", 150, 270, 7, fonts.bold, { color: muted });
  drawText(page, "MÁX.", 390, 270, 7, fonts.bold, { color: muted });
  drawText(page, "NOTA", 438, 270, 7, fonts.bold, { color: muted });
  grading.forEach(([label, max], index) => {
    const rowY = 240 - index * 25;
    page.drawRectangle({ x: 142, y: rowY, width: 328, height: 25, borderColor: border, borderWidth: 0.6 });
    page.drawLine({ start: { x: 430, y: rowY }, end: { x: 430, y: rowY + 25 }, thickness: 0.6, color: border });
    drawText(page, label, 150, rowY + 8, 8, index === 5 ? fonts.bold : fonts.regular);
    drawText(page, max, 390, rowY + 8, 8, fonts.bold);
    drawText(page, "", 445, rowY + 8, 8, fonts.regular);
  });

  // 6. Hoja de integrantes
  page = addAdminPage("INTEGRANTES DEL GRUPO", `${data.course.name} - Grupo ${data.course.groupNumber || "-"}`);
  data.members.forEach((member, index) => {
    const rowY = 690 - index * 62;
    page.drawCircle({ x: 65, y: rowY + 1, size: 4, color: green });
    drawText(page, member.name, 82, rowY, 11, fonts.bold, { maxWidth: 330 });
    drawText(page, `CARNÉ: ${member.carnet}`, 82, rowY - 19, 8.5, fonts.regular, { color: muted });
  });

  // 7. Desarrollo de ejercicios
  const sources: Array<File | StoredPdfSource> = [...(data.storedFiles ?? []), ...data.files];
  for (const source of sources) {
    const file = await sourceBytes(source);
    if (file.mimeType === "application/pdf") {
      const sourceDoc = await PDFDocument.load(file.bytes, { ignoreEncryption: false });
      const available = sourceDoc.getPageIndices();
      const requested = source instanceof File ? undefined : source.selectedPages;
      const indexes = requested?.length
        ? requested.filter((index) => available.includes(index))
        : available;
      if (!indexes.length) throw new Error(`${file.name} no tiene páginas seleccionadas válidas.`);
      const copied = await doc.copyPages(sourceDoc, indexes);
      for (const copiedPage of copied) {
        if (!(source instanceof File) && source.rotation)
          copiedPage.setRotation(
            degrees((copiedPage.getRotation().angle + source.rotation) % 360),
          );
        doc.addPage(copiedPage);
        pageNumber += 1;
        copiedPageIndexes.add(doc.getPageCount() - 1);
      }
      continue;
    }
    const needsNormalization = file.mimeType === "image/webp" || file.mimeType === "image/jpeg";
    const imageBytes = needsNormalization
      ? await normalizeImage(file.bytes, file.mimeType)
      : file.bytes;
    const image = await doc.embedPng(imageBytes);
    page = doc.addPage(letter);
    pageNumber += 1;
    const scale = Math.min(540 / image.width, 700 / image.height);
    page.drawImage(image, {
      x: (letter[0] - image.width * scale) / 2,
      y: 52 + (700 - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    });
    footer(page, pageNumber, file.name, fonts);
    if (!(source instanceof File) && source.rotation)
      page.setRotation(degrees(source.rotation));
  }

  // Numera también las páginas PDF incorporadas sin alterar su contenido principal.
  doc.getPages().forEach((currentPage, index) => {
    if (copiedPageIndexes.has(index))
      drawText(currentPage, String(index + 1), 548, 20, 7, fonts.bold, { color: muted });
  });
  return doc.save();
}
