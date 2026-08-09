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
  cropPercent?: number;
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
  imageQuality?: "high" | "balanced" | "compact";
};

const letter: [number, number] = [612, 792];
const letterLandscape: [number, number] = [792, 612];
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
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 48, width, height: 48, color: dark });
  page.drawRectangle({ x: 0, y: height - 48, width: 10, height: 48, color: green });
  drawText(page, title, 48, height - 24, 15, fonts.bold, { color: rgb(1, 1, 1) });
  drawText(page, subtitle, 48, height - 39, 8, fonts.regular, { color: rgb(0.84, 0.88, 0.85) });
}

function footer(page: PDFPage, pageNumber: number, systemName: string, fonts: Fonts) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 48, y: 38 }, end: { x: width - 48, y: 38 }, thickness: 0.6, color: border });
  drawText(page, systemName, 48, 23, 7.5, fonts.regular, { color: muted });
  drawText(page, String(pageNumber), width - 64, 23, 8, fonts.bold, { color: muted });
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

const imageProfiles = {
  high: { maxDimension: 2400, quality: 0.9 },
  balanced: { maxDimension: 1800, quality: 0.78 },
  compact: { maxDimension: 1200, quality: 0.62 },
} as const;

async function normalizeImage(
  bytes: Uint8Array,
  mimeType: string,
  profileName: keyof typeof imageProfiles,
  cropPercent = 0,
) {
  const bitmap = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: mimeType }),
    { imageOrientation: "from-image" },
  );
  const canvas = document.createElement("canvas");
  const profile = imageProfiles[profileName];
  const crop = Math.min(40, Math.max(0, cropPercent)) / 100;
  const sourceX = bitmap.width * crop;
  const sourceY = bitmap.height * crop;
  const sourceWidth = bitmap.width * (1 - crop * 2);
  const sourceHeight = bitmap.height * (1 - crop * 2);
  const scale = Math.min(1, profile.maxDimension / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo convertir la imagen WEBP.");
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("No se pudo convertir la imagen.")),
      "image/jpeg",
      profile.quality,
    ),
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
  const addAdminPage = (
    title: string,
    subtitle: string,
    size: [number, number] = letter,
  ) => {
    const page = doc.addPage(size);
    pageNumber += 1;
    header(page, title, subtitle, fonts);
    footer(page, pageNumber, data.systemName, fonts);
    return page;
  };

  const university = data.course.university || "Universidad Mariano Gálvez de Guatemala";

  // 1. Carátula institucional completa
  let page = doc.addPage(letter);
  pageNumber += 1;
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.985, 0.99, 0.986) });
  page.drawRectangle({ x: 0, y: 756, width: 612, height: 36, color: dark });
  page.drawRectangle({ x: 0, y: 756, width: 12, height: 36, color: green });
  try {
    let logoBytes = data.logoBytes;
    if (!logoBytes) {
      const logoResponse = await fetch("/assets/umg-logo.png");
      if (logoResponse.ok) logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
    }
    if (logoBytes) {
      const logo = await doc.embedPng(logoBytes);
      const scale = Math.min(88 / logo.width, 76 / logo.height);
      page.drawImage(logo, { x: 262, y: 656, width: logo.width * scale, height: logo.height * scale });
    }
  } catch {
    // El texto institucional sigue identificando la carátula si el activo no carga.
  }
  drawText(page, university.toUpperCase(), 56, 634, 14, fonts.bold, { maxWidth: 500 });
  drawText(page, (data.course.faculty || "Facultad").toUpperCase(), 56, 614, 9, fonts.bold, { color: green, maxWidth: 500 });
  drawText(page, `TAREA ${data.assignment.number} · SEMANA ${data.assignment.weekNumber}`, 56, 574, 11, fonts.bold, { color: green });
  const titleLines = wrap(data.assignment.title, fonts.bold, 24, 500).slice(0, 2);
  titleLines.forEach((line, index) => drawText(page, line, 56, 540 - index * 28, 24, fonts.bold));
  drawText(page, data.assignment.topic || "Reporte de trabajo y desempeño", 56, 482, 11, fonts.regular, { color: muted, maxWidth: 500 });
  const coverDetails = [
    ["Sede", data.course.campus || "No especificada"],
    ["Jornada", data.course.shift || "No especificada"],
    ["Carrera", data.course.degree || "No especificada"],
    ["Curso", data.course.name],
    ["Código", data.course.code || "No especificado"],
    ["Docente", data.course.teacher || "No especificado"],
    ["Fecha", formatDate(data.assignment.dueAt, true)],
    ["Semestre", data.course.semester || data.course.cycle || "No especificado"],
    ["Sección", data.course.section || "No especificada"],
  ];
  page.drawRectangle({ x: 48, y: 278, width: 516, height: 176, color: rgb(1, 1, 1), borderColor: border, borderWidth: 0.8 });
  coverDetails.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 60 + column * 252;
    const y = 430 - row * 34;
    drawText(page, label.toUpperCase(), x, y, 6.8, fonts.bold, { color: muted });
    drawText(page, value, x, y - 14, 9, fonts.regular, { maxWidth: 232 });
  });
  drawText(page, "INTEGRANTES DEL GRUPO", 56, 250, 8, fonts.bold, { color: muted });
  const memberColumns = 2;
  const memberColumnWidth = 500 / memberColumns;
  data.members.forEach((member, index) => {
    const column = index % memberColumns;
    const row = Math.floor(index / memberColumns);
    const x = 56 + column * memberColumnWidth;
    const y = 224 - row * 24;
    drawText(page, member.name, x, y, 7.5, fonts.bold, { maxWidth: memberColumnWidth - 12 });
    drawText(page, member.carnet, x, y - 10, 6.3, fonts.regular, { color: muted, maxWidth: memberColumnWidth - 12 });
  });
  drawText(page, `Grupo ${data.course.groupNumber || "-"} · ${formatDate(data.assignment.weekStart)} al ${formatDate(data.assignment.weekEnd)}`, 56, 62, 9, fonts.bold, { color: green });
  footer(page, pageNumber, data.systemName, fonts);

  // 2. Distribución de ejercicios, con bloques de secciones legibles.
  const sections = [...new Set(data.exercises.map((exercise) => exercise.section))];
  const sectionGroups = Array.from(
    { length: Math.max(1, Math.ceil(sections.length / 5)) },
    (_, index) => sections.slice(index * 5, index * 5 + 5),
  );
  for (const [groupIndex, sectionGroup] of sectionGroups.entries()) {
    const distributionRows = data.members.map((member) => {
      const bySection = sectionGroup.map((section) =>
        data.allocations
          .filter((allocation) => allocation.memberId === member.id)
          .map((allocation) => data.exercises.find((exercise) => exercise.id === allocation.exerciseId))
          .filter((exercise): exercise is Exercise => exercise?.section === section)
          .map((exercise) => exercise.label),
      );
      return {
        member,
        bySection,
        total: data.allocations.filter((allocation) => allocation.memberId === member.id).length,
      };
    });
    let rowIndex = 0;
    while (rowIndex < distributionRows.length || (!distributionRows.length && rowIndex === 0)) {
      page = addAdminPage(
        "DISTRIBUCIÓN DE EJERCICIOS",
        `${data.course.name} · Tarea ${data.assignment.number}${sectionGroups.length > 1 ? ` · Bloque ${groupIndex + 1} de ${sectionGroups.length}` : ""}`,
        letterLandscape,
      );
      const tableX = 34;
      const nameWidth = 172;
      const totalWidth = 48;
      const sectionWidth = (724 - nameWidth - totalWidth) / Math.max(1, sectionGroup.length);
      let tableY = 530;
      page.drawRectangle({ x: tableX, y: tableY - 34, width: 724, height: 34, color: green });
      drawText(page, "INTEGRANTE", tableX + 7, tableY - 21, 7.5, fonts.bold, { color: rgb(1, 1, 1) });
      sectionGroup.forEach((section, index) =>
        drawText(page, section, tableX + nameWidth + index * sectionWidth + 5, tableY - 21, 7.5, fonts.bold, { color: rgb(1, 1, 1), maxWidth: sectionWidth - 10 }),
      );
      drawText(page, "TOTAL", tableX + 724 - totalWidth + 6, tableY - 21, 7.2, fonts.bold, { color: rgb(1, 1, 1) });
      tableY -= 34;
      let drewRow = false;
      while (rowIndex < distributionRows.length) {
        const row = distributionRows[rowIndex];
        const nameLines = wrap(row.member.name, fonts.bold, 7.8, nameWidth - 14);
        const sectionLines = row.bySection.map((labels) =>
          wrap(labels.join(", ") || "-", fonts.regular, 7.5, sectionWidth - 12),
        );
        const lineCount = Math.max(2, nameLines.length + 1, ...sectionLines.map((lines) => lines.length));
        const rowHeight = Math.max(38, lineCount * 10 + 12);
        if (tableY - rowHeight < 54 && drewRow) break;
        page.drawRectangle({ x: tableX, y: tableY - rowHeight, width: 724, height: rowHeight, color: rowIndex % 2 ? rgb(0.965, 0.98, 0.97) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
        nameLines.forEach((line, index) => drawText(page, line, tableX + 7, tableY - 14 - index * 10, 7.8, fonts.bold));
        drawText(page, row.member.carnet, tableX + 7, tableY - rowHeight + 8, 6.5, fonts.regular, { color: muted });
        sectionLines.forEach((lines, sectionIndex) =>
          lines.forEach((line, lineIndex) => drawText(page, line, tableX + nameWidth + sectionIndex * sectionWidth + 6, tableY - 14 - lineIndex * 10, 7.5, fonts.regular)),
        );
        drawText(page, String(row.total), tableX + 724 - totalWidth + 16, tableY - 20, 9, fonts.bold, { color: green });
        tableY -= rowHeight;
        rowIndex += 1;
        drewRow = true;
      }
      if (!distributionRows.length) rowIndex += 1;
    }
  }

  // 3. Reporte de trabajo individual / desempeño.
  const reportLines = wrap(data.reportBody || "Sin reporte guardado.", fonts.regular, 10, 500);
  let reportIndex = 0;
  while (reportIndex < reportLines.length || reportIndex === 0) {
    page = addAdminPage("REPORTE DE TRABAJO Y DESEMPEÑO", `Semana ${data.assignment.weekNumber} · Tarea ${data.assignment.number}`);
    drawText(page, data.assignment.title, 56, 704, 14, fonts.bold, { maxWidth: 500 });
    drawText(page, data.assignment.topic || "Desempeño grupal", 56, 682, 9, fonts.regular, { color: green, maxWidth: 500 });
    let reportY = 646;
    while (reportIndex < reportLines.length && reportY >= 66) {
      drawText(page, reportLines[reportIndex], 56, reportY, 10, fonts.regular);
      reportY -= 16;
      reportIndex += 1;
    }
    if (!reportLines.length) reportIndex += 1;
  }

  // 4. Aspectos evaluables numéricos.
  const criteria = data.evaluations[0]?.scores ?? [];
  const criterionGroups = Array.from(
    { length: Math.max(1, Math.ceil(criteria.length / 4)) },
    (_, index) => criteria.slice(index * 4, index * 4 + 4),
  );
  for (const [criteriaIndex, criterionGroup] of criterionGroups.entries()) {
    const evaluationPageCount = Math.max(1, Math.ceil(data.members.length / 12));
    const evaluationPageSize = Math.max(
      1,
      Math.ceil(data.members.length / evaluationPageCount),
    );
    const memberGroups = Array.from(
      { length: evaluationPageCount },
      (_, index) =>
        data.members.slice(
          index * evaluationPageSize,
          index * evaluationPageSize + evaluationPageSize,
        ),
    );
    for (const [memberGroupIndex, memberGroup] of memberGroups.entries()) {
      page = addAdminPage("ASPECTOS EVALUABLES", `Puntuaciones numéricas${criterionGroups.length > 1 ? ` · Bloque ${criteriaIndex + 1} de ${criterionGroups.length}` : ""}${memberGroups.length > 1 ? ` · Integrantes ${memberGroupIndex + 1} de ${memberGroups.length}` : ""}`);
      const tableX = 44;
      const nameWidth = 190;
      const totalWidth = 54;
      const scoreWidth = (524 - nameWidth - totalWidth) / Math.max(1, criterionGroup.length);
      let tableY = 706;
      page.drawRectangle({ x: tableX, y: tableY - 42, width: 524, height: 42, color: green });
      drawText(page, "INTEGRANTE", tableX + 7, tableY - 25, 7.5, fonts.bold, { color: rgb(1, 1, 1) });
      criterionGroup.forEach((criterion, index) => {
        const lines = wrap(criterion.name, fonts.bold, 6.5, scoreWidth - 8).slice(0, 2);
        lines.forEach((line, lineIndex) => drawText(page, line, tableX + nameWidth + index * scoreWidth + 4, tableY - 14 - lineIndex * 8, 6.5, fonts.bold, { color: rgb(1, 1, 1) }));
        drawText(page, `/${criterion.maxScore}`, tableX + nameWidth + index * scoreWidth + 4, tableY - 36, 6.2, fonts.regular, { color: rgb(1, 1, 1) });
      });
      drawText(page, "TOTAL", tableX + 524 - totalWidth + 6, tableY - 25, 7, fonts.bold, { color: rgb(1, 1, 1) });
      tableY -= 42;
      memberGroup.forEach((member, index) => {
        const evaluation = data.evaluations.find((item) => item.memberId === member.id);
        const rowHeight = 44;
        page.drawRectangle({ x: tableX, y: tableY - rowHeight, width: 524, height: rowHeight, color: index % 2 ? rgb(0.965, 0.98, 0.97) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
        wrap(member.name, fonts.bold, 7.8, nameWidth - 14).slice(0, 2).forEach((line, lineIndex) => drawText(page, line, tableX + 7, tableY - 14 - lineIndex * 9, 7.8, fonts.bold));
        criterionGroup.forEach((criterion, criterionIndex) => {
          const score = evaluation?.scores.find((item) => item.name === criterion.name)?.score;
          drawText(page, score === undefined ? "-" : String(score), tableX + nameWidth + criterionIndex * scoreWidth + scoreWidth / 2 - 5, tableY - 25, 9, fonts.regular);
        });
        drawText(page, evaluation ? `${evaluation.total}` : "-", tableX + 524 - totalWidth + 12, tableY - 25, 9, fonts.bold, { color: green });
        tableY -= rowHeight;
      });
    }
  }

  // 5. Nota del coordinador.
  const summaryPageCount = Math.max(1, Math.ceil(data.members.length / 12));
  const summaryPageSize = Math.max(
    1,
    Math.ceil(data.members.length / summaryPageCount),
  );
  const summaryMemberGroups = Array.from(
    { length: summaryPageCount },
    (_, index) =>
      data.members.slice(
        index * summaryPageSize,
        index * summaryPageSize + summaryPageSize,
      ),
  );
  for (const [groupIndex, memberGroup] of summaryMemberGroups.entries()) {
    page = addAdminPage("NOTA DEL COORDINADOR", `Punteo final guardado para la tarea seleccionada${summaryMemberGroups.length > 1 ? ` · Página ${groupIndex + 1} de ${summaryMemberGroups.length}` : ""}`);
    let summaryY = 706;
    page.drawRectangle({ x: 50, y: summaryY - 34, width: 512, height: 34, color: green });
    [["PARTICIPANTE", 58], ["CARNÉ", 376], ["PUNTEO", 492]].forEach(([label, x]) => drawText(page, String(label), Number(x), summaryY - 21, 7.5, fonts.bold, { color: rgb(1, 1, 1) }));
    summaryY -= 34;
    memberGroup.forEach((member, index) => {
      const evaluation = data.evaluations.find((item) => item.memberId === member.id);
      const rowHeight = 44;
      page.drawRectangle({ x: 50, y: summaryY - rowHeight, width: 512, height: rowHeight, color: index % 2 ? rgb(0.965, 0.98, 0.97) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
      wrap(member.name, fonts.bold, 8.5, 304).slice(0, 2).forEach((line, lineIndex) => drawText(page, line, 58, summaryY - 16 - lineIndex * 10, 8.5, fonts.bold));
      drawText(page, member.carnet, 376, summaryY - 26, 8.5, fonts.regular, { maxWidth: 106 });
      drawText(page, evaluation ? `${evaluation.total}/100` : "-/100", 496, summaryY - 26, 10, fonts.bold, { color: green });
      summaryY -= rowHeight;
    });
  }

  // 6. Entregas de los integrantes
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
    const cropPercent = source instanceof File ? 0 : source.cropPercent ?? 0;
    const needsNormalization = file.mimeType === "image/webp" || file.mimeType === "image/jpeg" || cropPercent > 0;
    const imageBytes = needsNormalization
      ? await normalizeImage(file.bytes, file.mimeType, data.imageQuality ?? "balanced", cropPercent)
      : file.bytes;
    const image = needsNormalization
      ? await doc.embedJpg(imageBytes)
      : await doc.embedPng(imageBytes);
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
