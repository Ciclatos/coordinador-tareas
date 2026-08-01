"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { reportText } from "@/lib/domain";

export type FormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string[]> }
  | undefined;
const courseSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del curso").max(120),
  code: z.string().trim().max(30).optional(),
  teacher: z.string().trim().max(120).optional(),
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
});
const assignmentSchema = z.object({
  courseId: z.string().cuid(),
  number: z.coerce.number().int().positive(),
  weekNumber: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(160),
  topic: z.string().trim().max(200).optional(),
  weekStart: z.coerce.date(),
  weekEnd: z.coerce.date(),
  dueAt: z.coerce.date(),
});
const distributionSchema = z.object({
  assignmentId: z.string().cuid(),
  seed: z.string().min(1).max(100),
  exercises: z
    .array(
      z.object({
        localId: z.string().min(1).max(160),
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
      z.object({
        memberId: z.string().cuid(),
        scores: z.array(z.number().min(0).max(100)).length(5),
        comments: z.string().trim().max(1000).optional(),
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
const reportSchema = z.object({
  assignmentId: z.string().cuid(),
  body: z.string().trim().min(50).max(10000).optional(),
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
      data: { ...parsed.data, topic: parsed.data.topic || null },
    });
  } catch {
    return { message: "Ya existe una tarea con ese número en el curso." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Tarea creada." };
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
  const memberCount = await prisma.courseMember.count({
    where: {
      courseId: assignment.courseId,
      id: { in: memberIds },
      active: true,
    },
  });
  if (memberCount !== memberIds.length)
    return {
      ok: false,
      message: "Hay integrantes que no pertenecen al curso.",
    };
  const exerciseIds = new Set(
    parsed.data.exercises.map((item) => item.localId),
  );
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
  await prisma.$transaction(async (tx) => {
    await tx.exerciseAssignment.deleteMany({
      where: { assignmentId: assignment.id },
    });
    await tx.assignmentSection.deleteMany({
      where: { assignmentId: assignment.id },
    });
    const grouped = new Map<string, typeof parsed.data.exercises>();
    for (const item of parsed.data.exercises) {
      grouped.set(item.section, [...(grouped.get(item.section) ?? []), item]);
    }
    const exerciseMap = new Map<string, string>();
    let sectionOrder = 0;
    for (const [name, items] of grouped) {
      const section = await tx.assignmentSection.create({
        data: {
          assignmentId: assignment.id,
          name,
          sortOrder: sectionOrder++,
          rule: { mode: "hybrid", seed: parsed.data.seed },
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
      }
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
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: "DISTRIBUTED" },
    });
  });
  revalidatePath("/app");
  return { ok: true, message: "Distribución guardada y reproducible." };
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
    if (template.criteria.length !== 5)
      throw new Error("La plantilla activa debe contener cinco criterios.");
    for (const item of parsed.data.evaluations) {
      if (item.scores.some((score, index) => score > template!.criteria[index].maxScore))
        throw new Error("Una nota supera el máximo del criterio.");
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
  revalidatePath("/app");
  return { ok: true, message: "Evaluaciones guardadas correctamente." };
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
    },
  });
  if (!assignment) return { ok: false, message: "No tienes acceso a esta tarea." };
  const memberCounts = assignment.course.members.map((member) => ({
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
    assignment.course.members.length - assignment.submissions.length,
  );
  const late = assignment.submissions.filter((submission) => submission.late).length;
  const body =
    parsed.data.body ??
    reportText(
      assignment.sections.map((section) => section.name),
      pending,
      late,
      extras,
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
