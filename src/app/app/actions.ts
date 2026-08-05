"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { reportText } from "@/lib/domain";
import { parseMemberCsv } from "@/lib/member-csv";
import { parseGuatemalaDateTimeLocal } from "@/lib/guatemala-date";

export type FormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string[]> }
  | undefined;
const courseSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del curso").max(120),
  code: z.string().trim().max(30).optional(),
  teacher: z.string().trim().max(120).optional(),
  degree: z.string().trim().max(160).optional(),
  faculty: z.string().trim().max(160).optional(),
  university: z.string().trim().max(160).optional(),
  campus: z.string().trim().max(120).optional(),
  shift: z.string().trim().max(80).optional(),
  cycle: z.string().trim().max(30).optional(),
  semester: z.string().trim().max(30).optional(),
  section: z.string().trim().max(30).optional(),
  groupNumber: z.string().trim().max(30).optional(),
  academicYear: z.coerce.number().int().min(2020).max(2100),
});
const memberSchema = z.object({
  courseId: z.string().cuid(),
  fullName: z.string().trim().min(3).max(150),
  shortName: z.string().trim().min(2).max(50),
  carnet: z.string().trim().min(3).max(40),
  email: z.union([z.literal(""), z.email()]).optional(),
  phone: z.string().trim().max(30).optional(),
});
const assignmentSchema = z.object({
  courseId: z.string().cuid(),
  number: z.coerce.number().int().positive(),
  weekNumber: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(160),
  topic: z.string().trim().max(200).optional(),
  instructions: z.string().trim().max(5000).optional(),
  coordinatorNotes: z.string().trim().max(5000).optional(),
  weekStart: z.coerce.date(),
  weekEnd: z.coerce.date(),
  dueAt: z.preprocess(parseGuatemalaDateTimeLocal, z.date()),
});
const distributionSchema = z.object({
  assignmentId: z.string().cuid(),
  seed: z.string().min(1).max(100),
  mode: z.enum(["independent", "global", "hybrid", "manual"]).default("hybrid"),
  excludedMemberIds: z.array(z.string().cuid()).max(100).default([]),
  sections: z.array(z.object({
    localId: z.string().min(1).max(160),
    name: z.string().trim().min(1).max(80),
    selection: z.enum(["range", "odd", "even", "multiple", "manual"]),
    start: z.number().int().min(0).max(100000),
    end: z.number().int().min(0).max(100000),
    interval: z.number().int().min(1).max(100000),
    manualList: z.string().max(10000),
    exclusions: z.string().max(5000),
    inclusions: z.string().max(5000),
    labels: z.array(z.string().trim().min(1).max(80)).min(1).max(1000),
    defaultWeight: z.number().positive().max(100),
    notes: z.string().trim().max(2000),
  })).min(1).max(50),
  exercises: z
    .array(
      z.object({
        localId: z.string().min(1).max(160),
        sectionId: z.string().min(1).max(160),
        section: z.string().min(1).max(80),
        label: z.string().min(1).max(80),
        weight: z.number().positive().max(100),
      }),
    )
    .min(1)
    .max(1000),
  allocations: z.array(
    z.object({
      exerciseId: z.string(),
      memberId: z.string().cuid(),
      locked: z.boolean().optional(),
    }),
  ),
});
const evaluationSchema = z.object({
  assignmentId: z.string().cuid(),
  evaluations: z
    .array(
      z
        .object({
          memberId: z.string().cuid(),
          scores: z.array(z.number().min(0).max(100)).min(1).max(10),
          reasons: z.array(z.string().trim().max(300)).min(1).max(10).optional(),
          comments: z.string().trim().max(1000).optional(),
        })
        .superRefine((item, context) => {
          if (item.reasons && item.reasons.length !== item.scores.length)
            context.addIssue({ code: "custom", path: ["reasons"], message: "Los motivos no coinciden con los criterios." });
        }),
    )
    .min(1)
    .max(100),
});
const defaultCriteria = [
  "Puntualidad",
  "Presentación PDF",
  "Trabajo en equipo",
  "Comunicación",
  "Ejercicios completos",
];
const evaluationTemplateSchema = z.object({
  courseId: z.string().cuid(),
  name: z.string().trim().min(2).max(100),
  criteria: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    maxScore: z.number().positive().max(100),
  })).min(1).max(10),
});
const reportSchema = z.object({
  assignmentId: z.string().cuid(),
  body: z.string().trim().min(50).max(10000).optional(),
});
const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  systemName: z.string().trim().min(2).max(80),
  university: z.string().trim().max(160).optional(),
  faculty: z.string().trim().max(160).optional(),
  campus: z.string().trim().max(120).optional(),
  shift: z.string().trim().max(80).optional(),
  degree: z.string().trim().max(160).optional(),
  timezone: z.string().trim().min(3).max(80).default("America/Guatemala"),
});
const pdfConfigurationSchema = z.object({
  assignmentId: z.string().cuid(),
  imageQuality: z.enum(["high", "balanced", "compact"]).default("balanced"),
  files: z.array(
    z.object({
      fileId: z.string().cuid(),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      selectedPages: z.array(z.number().int().min(0).max(999)).min(1).max(1000).optional(),
      cropPercent: z.number().min(0).max(40).optional(),
    }),
  ).max(200),
});

async function ownsCourse(userId: string, courseId: string) {
  return Boolean(
    await prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { id: true },
    }),
  );
}
export async function createCourse(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  await prisma.course.create({
    data: {
      userId,
      ...parsed.data,
      code: parsed.data.code || null,
      teacher: parsed.data.teacher || null,
      section: parsed.data.section || null,
      groupNumber: parsed.data.groupNumber || null,
      degree: parsed.data.degree || null,
      faculty: parsed.data.faculty || null,
      university: parsed.data.university || null,
      campus: parsed.data.campus || null,
      shift: parsed.data.shift || null,
      cycle: parsed.data.cycle || null,
      semester: parsed.data.semester || null,
    },
  });
  revalidatePath("/app");
  return { ok: true, message: "Curso creado correctamente." };
}
export async function createMember(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!(await ownsCourse(userId, parsed.data.courseId)))
    return { message: "No tienes acceso a este curso." };
  const count = await prisma.courseMember.count({
    where: { courseId: parsed.data.courseId },
  });
  try {
    await prisma.courseMember.create({
      data: {
        ...parsed.data,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        sortOrder: count,
      },
    });
  } catch {
    return { message: "El carné ya existe en este curso." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Integrante agregado." };
}
export async function createAssignment(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!(await ownsCourse(userId, parsed.data.courseId)))
    return { message: "No tienes acceso a este curso." };
  if (parsed.data.weekEnd < parsed.data.weekStart)
    return { message: "La fecha final debe ser posterior a la inicial." };
  try {
    await prisma.assignment.create({
      data: { ...parsed.data, topic: parsed.data.topic || null, instructions: parsed.data.instructions || null, coordinatorNotes: parsed.data.coordinatorNotes || null },
    });
  } catch {
    return { message: "Ya existe una tarea con ese número en el curso." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Tarea creada." };
}

export async function updateCourse(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(formData.get("id"));
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success)
    return {
      message: "Revisa los datos del curso.",
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  const result = await prisma.course.updateMany({
    where: { id: id.data, userId },
    data: {
      ...parsed.data,
      code: parsed.data.code || null,
      teacher: parsed.data.teacher || null,
      section: parsed.data.section || null,
      groupNumber: parsed.data.groupNumber || null,
      degree: parsed.data.degree || null,
      faculty: parsed.data.faculty || null,
      university: parsed.data.university || null,
      campus: parsed.data.campus || null,
      shift: parsed.data.shift || null,
      cycle: parsed.data.cycle || null,
      semester: parsed.data.semester || null,
    },
  });
  if (!result.count) return { message: "No tienes acceso a este curso." };
  revalidatePath("/app");
  return { ok: true, message: "Curso actualizado." };
}

export async function updateMember(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(formData.get("id"));
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success)
    return {
      message: "Revisa los datos del integrante.",
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  if (!(await ownsCourse(userId, parsed.data.courseId)))
    return { message: "No tienes acceso a este curso." };
  try {
    const result = await prisma.courseMember.updateMany({
      where: { id: id.data, courseId: parsed.data.courseId, course: { userId } },
      data: {
        fullName: parsed.data.fullName,
        shortName: parsed.data.shortName,
        carnet: parsed.data.carnet,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
      },
    });
    if (!result.count) return { message: "No tienes acceso a este integrante." };
  } catch {
    return { message: "El carné ya existe en este curso." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Integrante actualizado." };
}

export async function updateAssignment(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(formData.get("id"));
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success)
    return {
      message: "Revisa los datos de la tarea.",
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  if (!(await ownsCourse(userId, parsed.data.courseId)))
    return { message: "No tienes acceso a este curso." };
  if (parsed.data.weekEnd < parsed.data.weekStart)
    return { message: "La fecha final debe ser posterior a la inicial." };
  try {
    const result = await prisma.assignment.updateMany({
      where: { id: id.data, courseId: parsed.data.courseId, course: { userId } },
      data: { ...parsed.data, topic: parsed.data.topic || null, instructions: parsed.data.instructions || null, coordinatorNotes: parsed.data.coordinatorNotes || null },
    });
    if (!result.count) return { message: "No tienes acceso a esta tarea." };
  } catch {
    return { message: "Ya existe una tarea con ese número en el curso." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Tarea actualizada." };
}

export async function setCourseActive(courseId: string, active: boolean) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(courseId);
  if (!id.success) return { ok: false, message: "Curso inválido." };
  const result = await prisma.course.updateMany({
    where: { id: id.data, userId },
    data: { active },
  });
  if (!result.count) return { ok: false, message: "No tienes acceso a este curso." };
  revalidatePath("/app");
  return { ok: true, message: active ? "Curso reactivado." : "Curso archivado." };
}

export async function resetCourseWorkloadBalance(courseId: string) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(courseId);
  if (!id.success || !(await ownsCourse(userId, id.data)))
    return { ok: false, message: "No tienes acceso a este curso." };
  await prisma.courseMember.updateMany({
    where: { courseId: id.data },
    data: { workloadBalance: 0 },
  });
  revalidatePath("/app");
  return { ok: true, message: "Saldo del semestre reiniciado; el historial se conservó." };
}

export async function setMemberActive(memberId: string, active: boolean) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(memberId);
  if (!id.success) return { ok: false, message: "Integrante inválido." };
  const result = await prisma.courseMember.updateMany({
    where: { id: id.data, course: { userId } },
    data: { active },
  });
  if (!result.count)
    return { ok: false, message: "No tienes acceso a este integrante." };
  revalidatePath("/app");
  return { ok: true, message: active ? "Integrante reactivado." : "Integrante desactivado." };
}

export async function setAssignmentArchived(assignmentId: string, archived: boolean) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(assignmentId);
  if (!id.success) return { ok: false, message: "Tarea inválida." };
  const assignment = await prisma.assignment.findFirst({
    where: { id: id.data, course: { userId } },
    select: { id: true, status: true },
  });
  if (!assignment) return { ok: false, message: "No tienes acceso a esta tarea." };
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: archived ? "ARCHIVED" : "DRAFT" },
  });
  revalidatePath("/app");
  return { ok: true, message: archived ? "Tarea archivada." : "Tarea restaurada como borrador." };
}

export async function moveMember(memberId: string, direction: -1 | 1) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(memberId);
  if (!id.success || ![-1, 1].includes(direction))
    return { ok: false, message: "Movimiento inválido." };
  const member = await prisma.courseMember.findFirst({
    where: { id: id.data, course: { userId } },
    select: { id: true, courseId: true, sortOrder: true },
  });
  if (!member) return { ok: false, message: "No tienes acceso a este integrante." };
  const neighbor = await prisma.courseMember.findFirst({
    where: {
      courseId: member.courseId,
      active: true,
      sortOrder: direction < 0 ? { lt: member.sortOrder } : { gt: member.sortOrder },
    },
    orderBy: { sortOrder: direction < 0 ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbor) return { ok: true, message: "El integrante ya está en ese extremo." };
  await prisma.$transaction([
    prisma.courseMember.update({ where: { id: member.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.courseMember.update({ where: { id: neighbor.id }, data: { sortOrder: member.sortOrder } }),
  ]);
  revalidatePath("/app");
  return { ok: true, message: "Orden actualizado." };
}

export async function importMembersCsv(courseId: string, csv: string) {
  const { userId } = await requireSession();
  const id = z.string().cuid().safeParse(courseId);
  if (!id.success || !(await ownsCourse(userId, courseId)))
    return { ok: false, message: "No tienes acceso a este curso." };
  let members;
  try {
    members = parseMemberCsv(csv);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "CSV inválido." };
  }
  const existing = await prisma.courseMember.findMany({
    where: { courseId },
    select: { id: true, carnet: true, sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const byCarnet = new Map(existing.map((member) => [member.carnet.toLocaleLowerCase("es"), member]));
  let created = 0;
  let updated = 0;
  let nextOrder = (existing[0]?.sortOrder ?? -1) + 1;
  await prisma.$transaction(
    members.map((member) => {
      const match = byCarnet.get(member.carnet.toLocaleLowerCase("es"));
      if (match) {
        updated++;
        return prisma.courseMember.update({
          where: { id: match.id },
          data: { ...member, active: true },
        });
      }
      created++;
      return prisma.courseMember.create({
        data: { ...member, courseId, sortOrder: nextOrder++ },
      });
    }),
  );
  revalidatePath("/app");
  return { ok: true, message: `Importación lista: ${created} creados y ${updated} actualizados.` };
}

export async function copyMembers(sourceCourseId: string, targetCourseId: string) {
  const { userId } = await requireSession();
  const ids = z.object({ sourceCourseId: z.string().cuid(), targetCourseId: z.string().cuid() }).safeParse({
    sourceCourseId,
    targetCourseId,
  });
  if (!ids.success || sourceCourseId === targetCourseId)
    return { ok: false, message: "Selecciona dos cursos distintos." };
  const owned = await prisma.course.count({
    where: { id: { in: [sourceCourseId, targetCourseId] }, userId },
  });
  if (owned !== 2) return { ok: false, message: "No tienes acceso a uno de los cursos." };
  const [source, target] = await Promise.all([
    prisma.courseMember.findMany({ where: { courseId: sourceCourseId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.courseMember.findMany({ where: { courseId: targetCourseId }, select: { carnet: true, sortOrder: true }, orderBy: { sortOrder: "desc" } }),
  ]);
  const existing = new Set(target.map((member) => member.carnet.toLocaleLowerCase("es")));
  const additions = source.filter((member) => !existing.has(member.carnet.toLocaleLowerCase("es")));
  let nextOrder = (target[0]?.sortOrder ?? -1) + 1;
  if (additions.length)
    await prisma.courseMember.createMany({
      data: additions.map(({ fullName, shortName, carnet, email, phone }) => ({
        courseId: targetCourseId,
        fullName,
        shortName,
        carnet,
        email,
        phone,
        sortOrder: nextOrder++,
      })),
    });
  revalidatePath("/app");
  return {
    ok: true,
    message: `${additions.length} integrantes copiados; ${source.length - additions.length} ya existían.`,
  };
}

export async function saveDistribution(
  input: z.infer<typeof distributionSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireSession();
  const parsed = distributionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "La distribución contiene datos inválidos." };
  const assignment = await prisma.assignment.findFirst({
    where: { id: parsed.data.assignmentId, course: { userId } },
    select: { id: true, courseId: true },
  });
  if (!assignment)
    return { ok: false, message: "No tienes acceso a esta tarea." };
  const memberIds = [
    ...new Set(parsed.data.allocations.map((item) => item.memberId)),
  ];
  const activeMembers = await prisma.courseMember.findMany({
    where: {
      courseId: assignment.courseId,
      active: true,
    },
    select: { id: true },
  });
  const activeMemberIds = new Set(activeMembers.map((member) => member.id));
  const excluded = new Set(parsed.data.excludedMemberIds);
  if (
    excluded.size !== parsed.data.excludedMemberIds.length ||
    [...excluded].some((id) => !activeMemberIds.has(id)) ||
    memberIds.some((id) => !activeMemberIds.has(id) || excluded.has(id))
  )
    return {
      ok: false,
      message: "Hay integrantes inválidos o excluidos dentro de la distribución.",
    };
  const exerciseIds = new Set(
    parsed.data.exercises.map((item) => item.localId),
  );
  const sectionIds = new Set(parsed.data.sections.map((section) => section.localId));
  if (
    sectionIds.size !== parsed.data.sections.length ||
    new Set(parsed.data.sections.map((section) => section.name.toLocaleLowerCase("es"))).size !== parsed.data.sections.length ||
    parsed.data.sections.some((section) => new Set(section.labels).size !== section.labels.length) ||
    parsed.data.exercises.some((exercise) => !sectionIds.has(exercise.sectionId)) ||
    parsed.data.sections.some((section) => {
      const actual = parsed.data.exercises.filter((exercise) => exercise.sectionId === section.localId);
      return actual.length !== section.labels.length ||
        actual.some((exercise) => !section.labels.includes(exercise.label) || exercise.section !== section.name);
    })
  )
    return { ok: false, message: "La configuración de secciones no coincide con los ejercicios generados." };
  if (
    parsed.data.allocations.length !== exerciseIds.size ||
    new Set(parsed.data.allocations.map((item) => item.exerciseId)).size !==
      exerciseIds.size ||
    parsed.data.allocations.some((item) => !exerciseIds.has(item.exerciseId))
  )
    return {
      ok: false,
      message: "Existen ejercicios duplicados o sin asignar.",
    };
  try {
    await prisma.$transaction(async (tx) => {
    await tx.exerciseAssignment.deleteMany({
      where: { assignmentId: assignment.id },
    });
    const submissionLinks = await tx.submissionFile.findMany({
      where: { exercise: { section: { assignmentId: assignment.id } } },
      select: { id: true, exercise: { select: { label: true, section: { select: { name: true } } } } },
    });
    if (submissionLinks.length)
      await tx.submissionFile.updateMany({
        where: { id: { in: submissionLinks.map((file) => file.id) } },
        data: { exerciseId: null },
      });
    await tx.assignmentSection.deleteMany({
      where: { assignmentId: assignment.id },
    });
    const exerciseMap = new Map<string, string>();
    const logicalExerciseMap = new Map<string, string>();
    for (const [sectionOrder, sectionInput] of parsed.data.sections.entries()) {
      const items = parsed.data.exercises.filter((item) => item.sectionId === sectionInput.localId);
      const section = await tx.assignmentSection.create({
        data: {
          assignmentId: assignment.id,
          name: sectionInput.name,
          sortOrder: sectionOrder,
          notes: sectionInput.notes || null,
          defaultWeight: sectionInput.defaultWeight,
          rule: {
            version: 2,
            mode: parsed.data.mode,
            seed: parsed.data.seed,
            selection: sectionInput.selection,
            start: sectionInput.start,
            end: sectionInput.end,
            interval: sectionInput.interval,
            manualList: sectionInput.manualList,
            exclusions: sectionInput.exclusions,
            inclusions: sectionInput.inclusions,
          },
        },
      });
      for (const [sortOrder, item] of items.entries()) {
        const exercise = await tx.exercise.create({
          data: {
            sectionId: section.id,
            label: item.label,
            weight: item.weight,
            sortOrder,
          },
        });
        exerciseMap.set(item.localId, exercise.id);
        logicalExerciseMap.set(`${sectionInput.name}\u0000${item.label}`, exercise.id);
      }
    }
    for (const file of submissionLinks) {
      const replacement = file.exercise
        ? logicalExerciseMap.get(`${file.exercise.section.name}\u0000${file.exercise.label}`)
        : undefined;
      if (replacement)
        await tx.submissionFile.update({ where: { id: file.id }, data: { exerciseId: replacement } });
    }
    await tx.exerciseAssignment.createMany({
      data: parsed.data.allocations.map((item) => ({
        assignmentId: assignment.id,
        exerciseId: exerciseMap.get(item.exerciseId)!,
        memberId: item.memberId,
        locked: item.locked ?? false,
        seed: parsed.data.seed,
      })),
    });
    await tx.assignmentExclusion.deleteMany({ where: { assignmentId: assignment.id } });
    if (excluded.size)
      await tx.assignmentExclusion.createMany({
        data: [...excluded].map((memberId) => ({ assignmentId: assignment.id, memberId })),
      });
    const eligibleIds = activeMembers.map((member) => member.id).filter((id) => !excluded.has(id));
    const baseCount = eligibleIds.length
      ? Math.floor(parsed.data.exercises.length / eligibleIds.length)
      : 0;
    for (const member of activeMembers) {
      const assigned = parsed.data.allocations.filter((item) => item.memberId === member.id);
      const assignedExercises = assigned
        .map((item) => parsed.data.exercises.find((exercise) => exercise.localId === item.exerciseId))
        .filter((exercise): exercise is (typeof parsed.data.exercises)[number] => Boolean(exercise));
      await tx.groupWorkloadSnapshot.upsert({
        where: { assignmentId_memberId: { assignmentId: assignment.id, memberId: member.id } },
        create: {
          assignmentId: assignment.id,
          memberId: member.id,
          exerciseCount: assignedExercises.length,
          totalWeight: assignedExercises.reduce((sum, exercise) => sum + exercise.weight, 0),
          extraCount: Math.max(0, assignedExercises.length - baseCount),
          lateCount: 0,
          sections: [...new Set(assignedExercises.map((exercise) => exercise.section))],
        },
        update: {
          exerciseCount: assignedExercises.length,
          totalWeight: assignedExercises.reduce((sum, exercise) => sum + exercise.weight, 0),
          extraCount: Math.max(0, assignedExercises.length - baseCount),
          sections: [...new Set(assignedExercises.map((exercise) => exercise.section))],
        },
      });
    }
    for (const member of activeMembers) {
      const aggregate = await tx.groupWorkloadSnapshot.aggregate({
        where: { memberId: member.id },
        _sum: { totalWeight: true },
      });
      await tx.courseMember.update({
        where: { id: member.id },
        data: { workloadBalance: aggregate._sum.totalWeight ?? 0 },
      });
    }
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: "DISTRIBUTED" },
    });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo guardar la distribución.",
    };
  }
  revalidatePath("/app");
  return { ok: true, message: "Distribución guardada y reproducible." };
}

export async function savePdfConfiguration(
  input: z.infer<typeof pdfConfigurationSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireSession();
  const parsed = pdfConfigurationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La configuración del PDF es inválida." };
  if (new Set(parsed.data.files.map((file) => file.fileId)).size !== parsed.data.files.length)
    return { ok: false, message: "Hay archivos repetidos en la configuración." };
  const assignment = await prisma.assignment.findFirst({
    where: { id: parsed.data.assignmentId, course: { userId } },
    select: {
      id: true,
      submissions: {
        select: {
          versions: {
            select: { files: { select: { id: true, pageCount: true, mimeType: true } } },
          },
        },
      },
    },
  });
  if (!assignment) return { ok: false, message: "No tienes acceso a esta tarea." };
  const storedFiles = assignment.submissions.flatMap((submission) =>
    submission.versions.flatMap((version) => version.files),
  );
  const allowed = new Set(
    storedFiles.map((file) => file.id),
  );
  if (parsed.data.files.some((file) => !allowed.has(file.fileId)))
    return { ok: false, message: "La configuración contiene un archivo ajeno a la tarea." };
  for (const file of parsed.data.files) {
    const stored = storedFiles.find((item) => item.id === file.fileId)!;
    if (stored.mimeType !== "application/pdf" && file.selectedPages?.length)
      return { ok: false, message: "Solo los archivos PDF admiten selección de páginas." };
    if (
      file.selectedPages &&
      (new Set(file.selectedPages).size !== file.selectedPages.length ||
        file.selectedPages.some((page) => stored.pageCount !== null && page >= stored.pageCount))
    )
      return { ok: false, message: `La selección de páginas de un archivo es inválida.` };
  }
  await prisma.$transaction([
    ...parsed.data.files.map((file) =>
      prisma.submissionFile.update({
        where: { id: file.fileId },
        data: { rotation: file.rotation },
      }),
    ),
    prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        pdfOrder: {
          imageQuality: parsed.data.imageQuality,
          items: parsed.data.files.map((file, sortOrder) => ({
            fileId: file.fileId,
            sortOrder,
            selectedPages: file.selectedPages ?? null,
            cropPercent: file.cropPercent ?? 0,
          })),
        },
      },
    }),
  ]);
  revalidatePath("/app");
  return { ok: true, message: "Orden, rotación y páginas guardados." };
}

export async function saveEvaluations(
  input: z.infer<typeof evaluationSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireSession();
  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Las calificaciones contienen datos inválidos." };
  const assignment = await prisma.assignment.findFirst({
    where: { id: parsed.data.assignmentId, course: { userId } },
    select: { id: true, courseId: true, course: { select: { members: { select: { id: true } } } } },
  });
  if (!assignment) return { ok: false, message: "No tienes acceso a esta tarea." };
  const allowedMembers = new Set(assignment.course.members.map((member) => member.id));
  if (
    new Set(parsed.data.evaluations.map((item) => item.memberId)).size !==
      parsed.data.evaluations.length ||
    parsed.data.evaluations.some((item) => !allowedMembers.has(item.memberId))
  )
    return { ok: false, message: "Hay integrantes inválidos o repetidos." };

  try {
    await prisma.$transaction(async (tx) => {
    let template = await tx.evaluationTemplate.findFirst({
      where: { courseId: assignment.courseId, active: true },
      orderBy: { id: "asc" },
      select: { id: true, criteria: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) {
      template = await tx.evaluationTemplate.create({
        data: {
          courseId: assignment.courseId,
          name: "Evaluación semanal predeterminada",
          criteria: {
            create: defaultCriteria.map((name, sortOrder) => ({
              name,
              maxScore: 20,
              sortOrder,
            })),
          },
        },
        select: { id: true, criteria: { orderBy: { sortOrder: "asc" } } },
      });
    }
    if (parsed.data.evaluations.some((item) => item.scores.length !== template!.criteria.length))
      throw new Error("Las notas no coinciden con la plantilla activa.");
    for (const item of parsed.data.evaluations) {
      if (item.scores.some((score, index) => score > template!.criteria[index].maxScore))
        throw new Error("Una nota supera el máximo del criterio.");
      if (item.scores.some((score, index) => score < template!.criteria[index].maxScore && !item.reasons?.[index]?.trim()))
        throw new Error("Indica el motivo de cada reducción.");
      const total = item.scores.reduce((sum, score) => sum + score, 0);
      const evaluation = await tx.memberEvaluation.upsert({
        where: {
          assignmentId_memberId: {
            assignmentId: assignment.id,
            memberId: item.memberId,
          },
        },
        update: { total, comments: item.comments || null },
        create: {
          assignmentId: assignment.id,
          memberId: item.memberId,
          total,
          comments: item.comments || null,
        },
        select: { id: true },
      });
      await tx.criterionScore.deleteMany({ where: { evaluationId: evaluation.id } });
      await tx.criterionScore.createMany({
        data: template.criteria.map((criterion, index) => ({
          evaluationId: evaluation.id,
          criterionId: criterion.id,
          score: item.scores[index],
          reason:
            item.scores[index] < criterion.maxScore
              ? item.reasons?.[index] || null
              : null,
        })),
      });
      await tx.groupWorkloadSnapshot.updateMany({
        where: { assignmentId: assignment.id, memberId: item.memberId },
        data: { grade: total },
      });
    }
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: "REVIEW" },
    });
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudieron guardar las evaluaciones.",
    };
  }
  revalidatePath("/app");
  return { ok: true, message: "Evaluaciones guardadas correctamente." };
}

export async function saveEvaluationTemplate(
  input: z.infer<typeof evaluationTemplateSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireSession();
  const parsed = evaluationTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los nombres y máximos de la rúbrica." };
  if (!(await ownsCourse(userId, parsed.data.courseId)))
    return { ok: false, message: "No tienes acceso a este curso." };
  await prisma.$transaction(async (tx) => {
    await tx.evaluationTemplate.updateMany({
      where: { courseId: parsed.data.courseId, active: true },
      data: { active: false },
    });
    await tx.evaluationTemplate.create({
      data: {
        courseId: parsed.data.courseId,
        name: parsed.data.name,
        criteria: {
          create: parsed.data.criteria.map((criterion, sortOrder) => ({ ...criterion, sortOrder })),
        },
      },
    });
  });
  revalidatePath("/app");
  return { ok: true, message: "Plantilla de evaluación guardada." };
}

export async function saveWeeklyReport(
  input: z.infer<typeof reportSchema>,
): Promise<{ ok: boolean; message: string; body?: string }> {
  const { userId } = await requireSession();
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "El reporte contiene datos inválidos." };
  const assignment = await prisma.assignment.findFirst({
    where: { id: parsed.data.assignmentId, course: { userId } },
    select: {
      id: true,
      sections: { orderBy: { sortOrder: "asc" }, select: { name: true } },
      course: {
        select: {
          members: {
            where: { active: true },
            select: {
              id: true,
              fullName: true,
              assignments: {
                where: { assignmentId: parsed.data.assignmentId },
                select: { id: true },
              },
            },
          },
        },
      },
      submissions: { select: { late: true } },
      exclusions: { select: { memberId: true } },
    },
  });
  if (!assignment) return { ok: false, message: "No tienes acceso a esta tarea." };
  const excludedIds = new Set(assignment.exclusions.map((item) => item.memberId));
  const participatingMembers = assignment.course.members.filter(
    (member) => !excludedIds.has(member.id),
  );
  const memberCounts = participatingMembers.map((member) => ({
    name: member.fullName,
    count: member.assignments.length,
  }));
  const minimum = memberCounts.length
    ? Math.min(...memberCounts.map((member) => member.count))
    : 0;
  const extras = memberCounts
    .filter((member) => member.count > minimum)
    .map((member) => member.name);
  const pending = Math.max(
    0,
    participatingMembers.length - assignment.submissions.length,
  );
  const late = assignment.submissions.filter((submission) => submission.late).length;
  const body =
    parsed.data.body ??
    reportText(
      assignment.sections.map((section) => section.name),
      pending,
      late,
      extras,
      assignment.exclusions
        .map((exclusion) =>
          assignment.course.members.find((member) => member.id === exclusion.memberId)?.fullName,
        )
        .filter((name): name is string => Boolean(name)),
    );
  await prisma.report.create({
    data: {
      assignmentId: assignment.id,
      body,
      generatorVersion: parsed.data.body ? "edited-v1" : "template-v1",
    },
  });
  revalidatePath("/app");
  return {
    ok: true,
    body,
    message: parsed.data.body
      ? "Reporte editado guardado."
      : "Reporte generado con los datos actuales.",
  };
}

export async function updateProfile(
  input: z.infer<typeof profileSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireSession();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Revisa los datos de configuración." };
  const optional = (value?: string) => value || null;
  await prisma.userProfile.upsert({
    where: { userId },
    update: {
      name: parsed.data.name,
      systemName: parsed.data.systemName,
      university: optional(parsed.data.university),
      faculty: optional(parsed.data.faculty),
      campus: optional(parsed.data.campus),
      shift: optional(parsed.data.shift),
      degree: optional(parsed.data.degree),
      timezone: parsed.data.timezone,
    },
    create: {
      userId,
      name: parsed.data.name,
      systemName: parsed.data.systemName,
      university: optional(parsed.data.university),
      faculty: optional(parsed.data.faculty),
      campus: optional(parsed.data.campus),
      shift: optional(parsed.data.shift),
      degree: optional(parsed.data.degree),
      timezone: parsed.data.timezone,
    },
  });
  revalidatePath("/app");
  return { ok: true, message: "Configuración guardada." };
}
