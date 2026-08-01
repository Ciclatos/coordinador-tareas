"use client";
import { useMemo, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Pencil,
  Send,
  Settings,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  buildExercises,
  distributeByMode,
  generateLabels,
  reportText,
  type Allocation,
  type Exercise,
  type Member,
  type DistributionMode,
} from "@/lib/domain";
import { createAssignmentPdf, type StoredPdfSource } from "@/lib/pdf";
import { logout } from "@/app/(auth)/actions";
import type { DashboardData } from "@/data/dashboard";
import { EntityModal, type EditableEntity } from "@/components/EntityModal";
import { PdfPageThumbnails } from "@/components/PdfPageThumbnails";
import {
  copyMembers,
  importMembersCsv,
  moveMember,
  saveDistribution,
  saveEvaluations,
  savePdfConfiguration,
  saveWeeklyReport,
  setAssignmentArchived,
  setCourseActive,
  setMemberActive,
  updateProfile,
} from "@/app/app/actions";
import { submissionPath } from "@/lib/submission-path";
import { formatPageSelection, parsePageSelection } from "@/lib/page-selection";

type View =
  | "Resumen"
  | "Cursos"
  | "Integrantes"
  | "Tareas"
  | "Distribución"
  | "Entregas"
  | "Evaluación"
  | "PDF final"
  | "Configuración";
type ModalState = {
  mode: "course" | "member" | "assignment";
  initial?: EditableEntity;
};
type PdfPreference = { fileId: string; sortOrder: number; selectedPages?: number[] };
function pdfPreferences(value: unknown): PdfPreference[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).items)
      ? ((value as Record<string, unknown>).items as unknown[])
      : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.fileId !== "string" || typeof candidate.sortOrder !== "number") return [];
    const selectedPages = Array.isArray(candidate.selectedPages)
      ? candidate.selectedPages.filter((page): page is number => Number.isInteger(page) && page >= 0)
      : undefined;
    return [{ fileId: candidate.fileId, sortOrder: candidate.sortOrder, selectedPages }];
  });
}
type ImageQuality = "high" | "balanced" | "compact";
function pdfImageQuality(value: unknown): ImageQuality {
  if (value && typeof value === "object") {
    const quality = (value as Record<string, unknown>).imageQuality;
    if (quality === "high" || quality === "balanced" || quality === "compact")
      return quality;
  }
  return "balanced";
}
function distributionModeFromRule(value: unknown): DistributionMode {
  if (value && typeof value === "object") {
    const mode = (value as Record<string, unknown>).mode;
    if (mode === "independent" || mode === "global" || mode === "hybrid" || mode === "manual")
      return mode;
  }
  return "hybrid";
}
const nav: [View, typeof LayoutDashboard][] = [
  ["Resumen", LayoutDashboard],
  ["Cursos", BookOpen],
  ["Integrantes", Users],
  ["Tareas", FileText],
  ["Distribución", Send],
  ["Entregas", Upload],
  ["Evaluación", ClipboardCheck],
  ["PDF final", FileDown],
  ["Configuración", Settings],
];
export default function AppShell({
  currentUser = {
    name: "Carlos Díaz",
    systemName: "Coordinador de Tareas",
  },
  initialData = [],
}: {
  currentUser?: {
    name: string;
    systemName: string;
    university?: string | null;
    faculty?: string | null;
    campus?: string | null;
    shift?: string | null;
    degree?: string | null;
  };
  initialData?: DashboardData;
}) {
  const currentCourse = initialData[0];
  const currentAssignment = currentCourse?.assignments[0];
  const members = useMemo(
    () =>
      initialData[0]?.members.map((member) => ({
        id: member.id,
        name: member.fullName,
        shortName: member.shortName,
        carnet: member.carnet,
        email: member.email,
        historicalLoad: member.workloadBalance,
        active: member.active,
      })) ?? [],
    [initialData],
  );
  const [view, setView] = useState<View>("Resumen");
  const router = useRouter();
  const [mutating, startMutation] = useTransition();
  const [menu, setMenu] = useState(false);
  const [sectionDefs, setSectionDefs] = useState(() =>
    currentAssignment?.sections.length
      ? currentAssignment.sections.map((section) => ({
          id: section.id,
          name: section.name,
          labels: section.exercises.map((exercise) => exercise.label),
        }))
      : [{ id: "draft-section-1", name: "Sección 1", labels: [] as string[] }],
  );
  const activeMembers = useMemo(
    () => members.filter((member) => member.active),
    [members],
  );
  const [excludedMemberIds, setExcludedMemberIds] = useState<string[]>(() =>
    currentAssignment?.exclusions.map((exclusion) => exclusion.memberId) ?? [],
  );
  const [exercises, setExercises] = useState<Exercise[]>(() =>
    currentAssignment?.sections.length
      ? currentAssignment.sections.flatMap((section) =>
          section.exercises.map((exercise) => ({
            id: exercise.id,
            sectionId: section.id,
            section: section.name,
            label: exercise.label,
            weight: exercise.weight,
          })),
        )
      : [],
  );
  const [allocations, setAllocations] = useState<Allocation[]>(() =>
    currentAssignment?.sections.length
      ? currentAssignment.sections.flatMap((section) =>
          section.exercises.flatMap((exercise) =>
            exercise.allocations.map((allocation) => ({
              exerciseId: exercise.id,
              memberId: allocation.memberId,
              locked: allocation.locked,
            })),
          ),
        )
      : [],
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [rule, setRule] = useState<
    "manual" | "range" | "odd" | "even" | "multiple"
  >("multiple");
  const [distributionMode, setDistributionMode] = useState<DistributionMode>(() =>
    distributionModeFromRule(currentAssignment?.sections[0]?.rule),
  );
  const [input, setInput] = useState("5 al 25");
  const [toast, setToast] = useState("");
  const defaultReport = currentAssignment
    ? reportText(
        currentAssignment.sections.map((section) => section.name),
        Math.max(0, currentCourse.members.length - currentAssignment.submissions.length),
        currentAssignment.submissions.filter((submission) => submission.late).length,
        [],
        currentAssignment.exclusions
          .map((exclusion) =>
            currentCourse.members.find((member) => member.id === exclusion.memberId)?.fullName,
          )
          .filter((name): name is string => Boolean(name)),
      )
    : "";
  const [reportBody, setReportBody] = useState(
    currentAssignment?.reports[0]?.body ?? defaultReport,
  );
  const storedPdfFiles: StoredPdfSource[] =
    currentAssignment?.submissions.flatMap((submission) =>
      submission.versions.flatMap((version) =>
        version.files.map((file) => ({
          id: file.id,
          name: file.originalName,
          mimeType: file.mimeType,
          url: `/api/files/${file.id}`,
          rotation: ([0, 90, 180, 270].includes(file.rotation) ? file.rotation : 0) as
            | 0
            | 90
            | 180
            | 270,
          selectedPages: pdfPreferences(currentAssignment.pdfOrder).find(
            (preference) => preference.fileId === file.id,
          )?.selectedPages,
          pageCount: file.pageCount,
        })),
      ),
    ) ?? [];
  const [pdfFileOrder, setPdfFileOrder] = useState<string[]>(() =>
    [...storedPdfFiles]
      .sort((left, right) => {
        const preferences = pdfPreferences(currentAssignment?.pdfOrder);
        const leftOrder = preferences.find((item) => item.fileId === left.id)?.sortOrder;
        const rightOrder = preferences.find((item) => item.fileId === right.id)?.sortOrder;
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      })
      .map((file) => file.id),
  );
  const [pdfOptions, setPdfOptions] = useState<Record<string, Pick<StoredPdfSource, "rotation" | "selectedPages">>>(
    () => Object.fromEntries(storedPdfFiles.map((file) => [file.id, { rotation: file.rotation, selectedPages: file.selectedPages }])),
  );
  const [imageQuality, setImageQuality] = useState<ImageQuality>(() =>
    pdfImageQuality(currentAssignment?.pdfOrder),
  );
  const orderedStoredPdfFiles = storedPdfFiles.map((file) => ({ ...file, ...pdfOptions[file.id] })).sort((left, right) => {
    const leftIndex = pdfFileOrder.indexOf(left.id);
    const rightIndex = pdfFileOrder.indexOf(right.id);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const currentAssignmentId = initialData[0]?.assignments[0]?.id;
  const totals = useMemo(
    () =>
      members.map((m) => ({
        m,
        count: allocations.filter((a) => a.memberId === m.id).length,
      })),
    [allocations, members],
  );
  const go = (v: View) => {
    setView(v);
    setMenu(false);
  };
  const notify = (v: string) => {
    setToast(v);
    setTimeout(() => setToast(""), 2800);
  };
  const regenerate = () => {
    try {
      const labels = generateLabels(input, rule);
      const next = buildExercises(sectionDefs.map((section) => ({ ...section, labels })));
      setSectionDefs((current) => current.map((section) => ({ ...section, labels })));
      setExercises(next);
      const eligible = activeMembers.filter((member) => !excludedMemberIds.includes(member.id));
      setAllocations(
        eligible.length
          ? distributeByMode(next, eligible, distributionMode, allocations)
          : [],
      );
      notify(`${next.length} ejercicios distribuidos sin duplicados`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo distribuir");
    }
  };
  const download = async () => {
    if (!currentCourse || !currentAssignment) {
      notify("Crea una tarea antes de generar el PDF.");
      return;
    }
    notify("Generando documento…");
    try {
    const persistedExercises: Exercise[] = currentAssignment.sections.flatMap(
      (section) =>
        section.exercises.map((exercise) => ({
          id: exercise.id,
          sectionId: section.id,
          section: section.name,
          label: exercise.label,
          weight: exercise.weight,
        })),
    );
    const persistedAllocations: Allocation[] = currentAssignment.sections.flatMap(
      (section) =>
        section.exercises.flatMap((exercise) =>
          exercise.allocations.map((allocation) => ({
            exerciseId: exercise.id,
            memberId: allocation.memberId,
            locked: allocation.locked,
          })),
        ),
    );
    const bytes = await createAssignmentPdf({
      systemName: currentUser.systemName,
      course: {
        ...currentCourse,
        university: currentCourse.university || currentUser.university,
        faculty: currentCourse.faculty || currentUser.faculty,
        campus: currentCourse.campus || currentUser.campus,
        shift: currentCourse.shift || currentUser.shift,
        degree: currentCourse.degree || currentUser.degree,
      },
      assignment: currentAssignment,
      members,
      exercises: persistedExercises.length ? persistedExercises : exercises,
      allocations: persistedAllocations.length ? persistedAllocations : allocations,
      evaluations: currentAssignment.evaluations.map((evaluation) => ({
        memberId: evaluation.memberId,
        total: evaluation.total,
        scores: evaluation.scores.map((score) => ({
          name: score.criterion.name,
          maxScore: score.criterion.maxScore,
          score: score.score,
        })),
      })),
      reportBody,
      files: [],
      storedFiles: orderedStoredPdfFiles,
      imageQuality,
    });
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarea-${currentAssignment.number}-${currentCourse.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("PDF final generado correctamente");
    } catch (error) {
      notify(
        error instanceof Error
          ? `No se pudo generar el PDF: ${error.message}`
          : "No se pudo generar el PDF.",
      );
    }
  };
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span>CT</span>
          <div>
            {currentUser.systemName}
            <br />
            <small>Gestión universitaria</small>
          </div>
          <button className="close" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => go(label)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="profile">
          <div>
            {currentUser.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </div>
          <span>
            {currentUser.name}
            <small>Coordinador</small>
          </span>
          <form action={logout}>
            <button
              className="logout"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>
      {menu && (
        <button
          className="scrim"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <main>
        <header>
          <button className="mobile-menu" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <span>{currentCourse?.name ?? "Sin curso seleccionado"}</span>
            <small>
              {currentAssignment
                ? `Tarea ${currentAssignment.number} · Semana ${currentAssignment.weekNumber}`
                : "Crea una tarea para comenzar"}
            </small>
          </div>
          <button className="outline" onClick={() => go("Configuración")}>
            <Settings size={16} /> Configurar
          </button>
        </header>
        <section className="content">
          {view === "Resumen" && (
            <Dashboard go={go} data={initialData} name={currentUser.name} />
          )}{" "}
          {view === "Cursos" && (
            <Courses
              courses={initialData}
              onCreate={() => setModal({ mode: "course" })}
              onOpen={() => go("Integrantes")}
              onEdit={(course) => setModal({ mode: "course", initial: course })}
              onToggle={(course) =>
                startMutation(async () => {
                  const result = await setCourseActive(course.id, !course.active);
                  setToast(result.message);
                  if (result.ok) router.refresh();
                })
              }
              busy={mutating}
            />
          )}{" "}
          {view === "Integrantes" && (
            <Members
              totals={totals}
              courseId={currentCourse?.id}
              courses={initialData}
              onCreate={() => setModal({ mode: "member" })}
              hasCourses={initialData.length > 0}
              onEdit={(member) => setModal({ mode: "member", initial: member })}
              onAction={(action) =>
                startMutation(async () => {
                  const result = await action();
                  setToast(result.message);
                  if (result.ok) router.refresh();
                })
              }
              busy={mutating}
            />
          )}{" "}
          {view === "Tareas" && (
            <Tasks
              courses={initialData}
              onCreate={() => setModal({ mode: "assignment" })}
              onOpen={() => go("Distribución")}
              onEdit={(assignment) => setModal({ mode: "assignment", initial: assignment })}
              onArchive={(assignment) =>
                startMutation(async () => {
                  const result = await setAssignmentArchived(
                    assignment.id,
                    assignment.status !== "ARCHIVED",
                  );
                  setToast(result.message);
                  if (result.ok) router.refresh();
                })
              }
              busy={mutating}
            />
          )}{" "}
          {view === "Distribución" && (
            <Distribution
              members={activeMembers}
              exercises={exercises}
              setExercises={setExercises}
              allocations={allocations}
              setAllocations={setAllocations}
              rule={rule}
              setRule={setRule}
              input={input}
              setInput={setInput}
              regenerate={regenerate}
              assignmentId={currentAssignmentId}
              sections={sectionDefs}
              setSections={setSectionDefs}
              excludedMemberIds={excludedMemberIds}
              setExcludedMemberIds={setExcludedMemberIds}
              distributionMode={distributionMode}
              setDistributionMode={setDistributionMode}
            />
          )}{" "}
          {view === "Entregas" && <Submissions courses={initialData} />}{" "}
          {view === "Evaluación" && <Evaluation courses={initialData} />}{" "}
          {view === "PDF final" && (
            <PdfBuilder
              storedFiles={orderedStoredPdfFiles}
              onMoveFile={(fileId, direction) =>
                setPdfFileOrder((current) => {
                  const complete = [
                    ...current,
                    ...storedPdfFiles
                      .map((file) => file.id)
                      .filter((id) => !current.includes(id)),
                  ];
                  const index = complete.indexOf(fileId);
                  const target = index + direction;
                  if (index < 0 || target < 0 || target >= complete.length)
                    return complete;
                  const next = [...complete];
                  [next[index], next[target]] = [next[target], next[index]];
                  return next;
                })
              }
              onMoveFileTo={(fileId, targetId) =>
                setPdfFileOrder((current) => {
                  if (fileId === targetId) return current;
                  const complete = [
                    ...current,
                    ...storedPdfFiles
                      .map((file) => file.id)
                      .filter((id) => !current.includes(id)),
                  ];
                  const from = complete.indexOf(fileId);
                  const to = complete.indexOf(targetId);
                  if (from < 0 || to < 0) return complete;
                  const next = [...complete];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  return next;
                })
              }
              onConfigureFile={(fileId, options) =>
                setPdfOptions((current) => ({
                  ...current,
                  [fileId]: { ...current[fileId], ...options },
                }))
              }
              imageQuality={imageQuality}
              setImageQuality={setImageQuality}
              download={download}
              members={activeMembers}
              assignmentId={currentAssignmentId}
              reportBody={reportBody}
              setReportBody={setReportBody}
            />
          )}{" "}
          {view === "Configuración" && <SettingsView user={currentUser} />}
        </section>
      </main>
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <EntityModal
          mode={modal.mode}
          courses={initialData}
          onClose={() => setModal(null)}
          initial={modal.initial}
        />
      )}
    </div>
  );
}
function Title({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="title">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function Dashboard({
  go,
  data,
  name,
}: {
  go: (v: View) => void;
  data: DashboardData;
  name: string;
}) {
  const assignments = data.flatMap((course) =>
    course.assignments.map((assignment) => ({
      ...assignment,
      courseName: course.name,
    })),
  );
  const current =
    assignments.find((item) =>
      ["DISTRIBUTED", "RECEIVING", "REVIEW"].includes(item.status),
    ) ?? assignments[0];
  const activeCourses = data.filter((course) => course.active).length;
  const upcoming = assignments.filter(
    (item) => new Date(item.dueAt) > new Date(),
  ).length;
  const currentCourse = current
    ? data.find((course) =>
        course.assignments.some((assignment) => assignment.id === current.id),
      )
    : undefined;
  const exerciseCount =
    current?.sections.reduce(
      (total, section) => total + section.exercises.length,
      0,
    ) ?? 0;
  const memberCount = currentCourse?.members.length ?? 0;
  const submissionCount = current?.submissions.length ?? 0;
  const evaluationCount = current?.evaluations.length ?? 0;
  const pendingDeliveries = assignments.reduce((total, assignment) => {
    const course = data.find((item) =>
      item.assignments.some((candidate) => candidate.id === assignment.id),
    );
    return total + Math.max(0, (course?.members.length ?? 0) - assignment.submissions.length);
  }, 0);
  return (
    <>
      <Title
        eyebrow={new Intl.DateTimeFormat("es-GT", {
          dateStyle: "full",
          timeZone: "America/Guatemala",
        }).format(new Date())}
        title={`Hola, ${name.split(" ")[0]}`}
      />
      {current ? (
        <div className="hero">
          <div>
            <span className="pill">TAREA EN CURSO</span>
            <h2>
              {current.courseName} · Tarea {current.number}
            </h2>
            <p>
              {current.title} · vence{" "}
              {new Intl.DateTimeFormat("es-GT", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Guatemala",
              }).format(new Date(current.dueAt))}
            </p>
            <div className="progress">
              <i style={{ width: current._count.submissions ? "67%" : "8%" }} />
            </div>
            <small>{current._count.submissions} entregas registradas</small>
          </div>
          <button onClick={() => go("Entregas")}>Gestionar entregas →</button>
        </div>
      ) : (
        <div className="hero">
          <div>
            <span className="pill">PRIMEROS PASOS</span>
            <h2>Organiza tu próximo trabajo grupal</h2>
            <p>Crea un curso, registra al grupo y prepara la primera tarea.</p>
          </div>
          <button onClick={() => go("Cursos")}>Crear un curso →</button>
        </div>
      )}
      <div className="stats">
        <article>
          <span>Cursos activos</span>
          <strong>{activeCourses}</strong>
          <small>Disponibles ahora</small>
        </article>
        <article>
          <span>Próximas tareas</span>
          <strong>{upcoming}</strong>
          <small>Con fecha futura</small>
        </article>
        <article>
          <span>Entregas pendientes</span>
          <strong className="amber">{pendingDeliveries}</strong>
          <small>Según entregas registradas</small>
        </article>
        <article>
          <span>Listas para compilar</span>
          <strong className="green">
            {assignments.filter((item) => item.status === "REVIEW").length}
          </strong>
          <small>En etapa de revisión</small>
        </article>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Progreso de la tarea</h3>
            <p>Completa cada etapa para generar el documento final.</p>
          </div>
        </div>
        <div className="steps">
          {[
            [
              "1",
              "Ejercicios definidos",
              `${exerciseCount} ejercicios en ${current?.sections.length ?? 0} secciones`,
              exerciseCount > 0,
            ],
            [
              "2",
              "Distribución completada",
              exerciseCount
                ? `Carga asignada entre ${memberCount} integrantes`
                : "Pendiente de definir ejercicios",
              current?.status !== "DRAFT" && exerciseCount > 0,
            ],
            [
              "3",
              "Recibir entregas",
              `${submissionCount} de ${memberCount} integrantes entregaron`,
              memberCount > 0 && submissionCount >= memberCount,
            ],
            [
              "4",
              "Evaluar integrantes",
              `${evaluationCount} de ${memberCount} evaluados`,
              memberCount > 0 && evaluationCount >= memberCount,
            ],
            [
              "5",
              "Generar PDF final",
              current?.reports.length
                ? "Reporte semanal generado"
                : "Listo cuando completes la evaluación",
              Boolean(current?.reports.length),
            ],
          ].map(([n, t, d, done]) => (
            <button
              key={String(n)}
              onClick={() =>
                go(
                  n === "3"
                    ? "Entregas"
                    : n === "4"
                      ? "Evaluación"
                      : n === "5"
                        ? "PDF final"
                        : "Distribución",
                )
              }
            >
              <b className={done ? "done" : ""}>
                {done ? <CheckCircle2 size={17} /> : n}
              </b>
              <span>
                <strong>{t}</strong>
                <small>{d}</small>
              </span>
              <em>›</em>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
function Courses({
  courses,
  onCreate,
  onOpen,
  onEdit,
  onToggle,
  busy,
}: {
  courses: DashboardData;
  onCreate: () => void;
  onOpen: () => void;
  onEdit: (course: DashboardData[number]) => void;
  onToggle: (course: DashboardData[number]) => void;
  busy: boolean;
}) {
  return (
    <>
      <Title eyebrow="Organización" title="Cursos">
        <button className="primary" onClick={onCreate}>
          <Plus size={17} /> Nuevo curso
        </button>
      </Title>
      <div className="cards">
        {courses.map((course) => (
          <article className="course" key={course.id}>
            <span>
              {course.name
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase()}
            </span>
            <small>{course.active ? "ACTIVO" : "ARCHIVADO"}</small>
            <h3>{course.name}</h3>
            <p>
              Sección {course.section || "—"} · Grupo{" "}
              {course.groupNumber || "—"}
            </p>
            <footer>
              <b>{course.members.length} integrantes</b>
              <div className="row-actions">
                <button onClick={() => onEdit(course)} aria-label={`Editar ${course.name}`}>
                  <Pencil size={14} /> Editar
                </button>
                <button disabled={busy} onClick={() => onToggle(course)}>
                  <Archive size={14} /> {course.active ? "Archivar" : "Reactivar"}
                </button>
                <button onClick={onOpen}>Integrantes →</button>
              </div>
            </footer>
          </article>
        ))}
        {courses.length === 0 && (
          <div className="empty panel">
            <BookOpen />
            <h3>Crea tu primer curso</h3>
            <p>Después podrás registrar integrantes y tareas semanales.</p>
            <button className="primary" onClick={onCreate}>
              Crear curso
            </button>
          </div>
        )}
      </div>
    </>
  );
}
function Members({
  totals,
  onCreate,
  hasCourses,
  courseId,
  courses,
  onEdit,
  onAction,
  busy,
}: {
  totals: { m: Member; count: number }[];
  onCreate: () => void;
  hasCourses: boolean;
  courseId?: string;
  courses: DashboardData;
  onEdit: (member: EditableEntity) => void;
  onAction: (action: () => Promise<{ ok: boolean; message: string }>) => void;
  busy: boolean;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [sourceCourseId, setSourceCourseId] = useState("");
  const [targetCourseId, setTargetCourseId] = useState(courseId ?? "");
  return (
    <>
      <Title eyebrow="Organización" title="Integrantes del grupo">
        <div className="row-actions">
          <button className="outline" onClick={() => setToolsOpen((open) => !open)} disabled={!hasCourses}>
            {toolsOpen ? "Cerrar herramientas" : "Importar o copiar"}
          </button>
          <button className="primary" onClick={onCreate} disabled={!hasCourses}>
            <Plus size={17} /> Agregar integrante
          </button>
        </div>
      </Title>
      {toolsOpen && (
        <div className="panel member-tools">
          <section>
            <h3>Importar CSV</h3>
            <p>Encabezados: <code>nombre,carnet,nombre_corto,correo</code>. Máximo 200 filas.</p>
            <label>
              Curso destino
              <select value={targetCourseId} onChange={(event) => setTargetCourseId(event.target.value)}>
                <option value="">Selecciona un curso</option>
                {courses.filter((course) => course.active).map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={"nombre,carnet,nombre_corto,correo\nAna Pérez,2026-001,Ana,ana@example.com"}
              rows={5}
            />
            <button
              className="primary"
              disabled={busy || !targetCourseId || !csv.trim()}
              onClick={() => onAction(() => importMembersCsv(targetCourseId, csv))}
            >
              Importar integrantes
            </button>
          </section>
          <section>
            <h3>Copiar desde otro curso</h3>
            <p>Copia integrantes activos y omite carnés que ya existan en el destino.</p>
            <label>
              Curso origen
              <select value={sourceCourseId} onChange={(event) => setSourceCourseId(event.target.value)}>
                <option value="">Selecciona el origen</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <label>
              Curso destino
              <select value={targetCourseId} onChange={(event) => setTargetCourseId(event.target.value)}>
                <option value="">Selecciona el destino</option>
                {courses.filter((course) => course.active).map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={busy || !sourceCourseId || !targetCourseId || sourceCourseId === targetCourseId}
              onClick={() => onAction(() => copyMembers(sourceCourseId, targetCourseId))}
            >
              Copiar integrantes
            </button>
          </section>
        </div>
      )}
      {totals.length === 0 ? (
        <div className="empty panel">
          <Users />
          <h3>Sin integrantes</h3>
          <p>
            {hasCourses
              ? "Agrega integrantes al curso activo."
              : "Primero crea un curso."}
          </p>
        </div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Integrante</th>
                <th>Carné</th>
                <th>Asignados esta semana</th>
                <th>Saldo histórico</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(({ m, count }) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    <small>{m.shortName}</small>
                  </td>
                  <td>{m.carnet}</td>
                  <td>{count} ejercicios</td>
                  <td>
                    <span className="balance">{m.historicalLoad}</span>
                  </td>
                  <td>
                    <span className={`status ${m.active ? "" : "gray"}`}>
                      {m.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions compact">
                      <button
                        className="icon-action"
                        aria-label={`Subir a ${m.name}`}
                        disabled={busy || !m.active}
                        onClick={() => onAction(() => moveMember(m.id, -1))}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-action"
                        aria-label={`Bajar a ${m.name}`}
                        disabled={busy || !m.active}
                        onClick={() => onAction(() => moveMember(m.id, 1))}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-action"
                        aria-label={`Editar ${m.name}`}
                        onClick={() =>
                          onEdit({
                            id: m.id,
                            courseId,
                            fullName: m.name,
                            shortName: m.shortName,
                            carnet: m.carnet,
                            email: m.email,
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-action"
                        disabled={busy}
                        onClick={() => onAction(() => setMemberActive(m.id, !m.active))}
                      >
                        <Archive size={14} /> {m.active ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function Tasks({
  courses,
  onCreate,
  onOpen,
  onEdit,
  onArchive,
  busy,
}: {
  courses: DashboardData;
  onCreate: () => void;
  onOpen: () => void;
  onEdit: (assignment: EditableEntity) => void;
  onArchive: (assignment: DashboardData[number]["assignments"][number]) => void;
  busy: boolean;
}) {
  const assignments = courses.flatMap((course) =>
    course.assignments.map((assignment) => ({
      ...assignment,
      courseId: course.id,
      courseName: course.name,
    })),
  );
  return (
    <>
      <Title eyebrow="Planificación" title="Tareas semanales">
        <button
          className="primary"
          onClick={onCreate}
          disabled={courses.length === 0}
        >
          <Plus size={17} /> Nueva tarea
        </button>
      </Title>
      <div className="panel">
        {assignments.map((assignment) => (
          <div className="task-row" key={assignment.id}>
            <div className="task-num">
              {String(assignment.number).padStart(2, "0")}
            </div>
            <div>
              <span className="status">{assignment.status}</span>
              <h3>
                {assignment.courseName} · {assignment.title}
              </h3>
              <p>
                {assignment._count.sections} secciones ·{" "}
                {assignment._count.submissions} entregas · Fecha límite{" "}
                {new Intl.DateTimeFormat("es-GT", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Guatemala",
                }).format(new Date(assignment.dueAt))}
              </p>
            </div>
            <div className="row-actions task-actions">
              <button className="outline" onClick={() => onEdit(assignment)}>
                <Pencil size={14} /> Editar
              </button>
              <button className="outline" disabled={busy} onClick={() => onArchive(assignment)}>
                <Archive size={14} /> {assignment.status === "ARCHIVED" ? "Restaurar" : "Archivar"}
              </button>
              <button className="outline" onClick={onOpen}>Distribución</button>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <div className="empty">
            <FileText />
            <h3>Sin tareas semanales</h3>
            <p>
              Crea una tarea para definir secciones y distribuir ejercicios.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
function Distribution({
  members,
  exercises,
  setExercises,
  allocations,
  setAllocations,
  rule,
  setRule,
  input,
  setInput,
  regenerate,
  assignmentId,
  sections,
  setSections,
  excludedMemberIds,
  setExcludedMemberIds,
  distributionMode,
  setDistributionMode,
}: {
  members: Member[];
  exercises: Exercise[];
  setExercises: React.Dispatch<React.SetStateAction<Exercise[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  rule: "manual" | "range" | "odd" | "even" | "multiple";
  setRule: (v: "manual" | "range" | "odd" | "even" | "multiple") => void;
  input: string;
  setInput: (v: string) => void;
  regenerate: () => void;
  assignmentId?: string;
  sections: Array<{ id: string; name: string; labels: string[] }>;
  setSections: React.Dispatch<
    React.SetStateAction<Array<{ id: string; name: string; labels: string[] }>>
  >;
  excludedMemberIds: string[];
  setExcludedMemberIds: React.Dispatch<React.SetStateAction<string[]>>;
  distributionMode: DistributionMode;
  setDistributionMode: (mode: DistributionMode) => void;
}) {
  const [saving, startSaving] = useTransition();
  const [saveMessage, setSaveMessage] = useState("");
  const move = (eid: string, mid: string) =>
    setAllocations((a) =>
      a.map((x) =>
        x.exerciseId === eid ? { ...x, memberId: mid, locked: true } : x,
      ),
    );
  const toggleLock = (exerciseId: string) =>
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.exerciseId === exerciseId
          ? { ...allocation, locked: !allocation.locked }
          : allocation,
      ),
    );
  const renameSection = (id: string, name: string) => {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, name } : section)),
    );
    setExercises((current) =>
      current.map((exercise) =>
        exercise.sectionId === id ? { ...exercise, section: name } : exercise,
      ),
    );
  };
  const removeSection = (id: string) => {
    const removedExercises = new Set(
      exercises.filter((exercise) => exercise.sectionId === id).map((exercise) => exercise.id),
    );
    setSections((current) => current.filter((section) => section.id !== id));
    setExercises((current) => current.filter((exercise) => exercise.sectionId !== id));
    setAllocations((current) =>
      current.filter((allocation) => !removedExercises.has(allocation.exerciseId)),
    );
  };
  const eligibleMembers = members.filter((member) => !excludedMemberIds.includes(member.id));
  const distributionComplete =
    exercises.length > 0 &&
    allocations.length === exercises.length &&
    new Set(allocations.map((allocation) => allocation.exerciseId)).size === exercises.length &&
    allocations.every((allocation) => eligibleMembers.some((member) => member.id === allocation.memberId));
  return (
    <>
      <Title
        eyebrow="Tarea 5 · Modo híbrido recomendado"
        title="Distribución de ejercicios"
      >
        <div className="title-actions">
          <button className="outline" onClick={regenerate}>
            Redistribuir
          </button>
          <button
            className="primary"
            disabled={!assignmentId || !eligibleMembers.length || !distributionComplete || saving}
            onClick={() =>
              assignmentId &&
              startSaving(async () => {
                const result = await saveDistribution({
                  assignmentId,
                  seed: "5",
                  mode: distributionMode,
                  excludedMemberIds,
                  exercises: exercises.map((item) => ({
                    localId: item.id,
                    section: item.section,
                    label: item.label,
                    weight: item.weight,
                  })),
                  allocations,
                });
                setSaveMessage(result.message);
              })
            }
          >
            {saving ? "Guardando…" : "Guardar distribución"}
          </button>
        </div>
      </Title>
      <div className="panel exclusion-panel">
        <div>
          <h3>Participación en esta tarea</h3>
          <p>Excluye temporalmente a alguien sin desactivarlo en el curso. Redistribuye antes de guardar.</p>
        </div>
        <div className="exclusion-list">
          {members.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={!excludedMemberIds.includes(member.id)}
                onChange={(event) => {
                  setExcludedMemberIds((current) =>
                    event.target.checked
                      ? current.filter((id) => id !== member.id)
                      : [...current, member.id],
                  );
                  if (!event.target.checked)
                    setAllocations((current) => current.filter((item) => item.memberId !== member.id));
                }}
              />
              {member.shortName}
            </label>
          ))}
        </div>
      </div>
      <div className="panel distribution-mode">
        <label>
          Modo de distribución
          <select
            value={distributionMode}
            onChange={(event) => setDistributionMode(event.target.value as DistributionMode)}
          >
            <option value="hybrid">Híbrido recomendado</option>
            <option value="independent">Independiente por sección</option>
            <option value="global">Global equilibrado</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <p>
          {distributionMode === "manual"
            ? "Conserva únicamente los movimientos actuales; completa cada ejercicio antes de guardar."
            : "Redistribuye para aplicar el modo seleccionado con la misma semilla reproducible."}
        </p>
      </div>
      <div className="panel section-editor">
        <div className="panel-head">
          <div>
            <h3>Secciones de la tarea</h3>
            <p>Cada sección conserva su propia numeración de ejercicios.</p>
          </div>
          <button
            className="outline"
            onClick={() =>
              setSections((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  name: `Sección ${current.length + 1}`,
                  labels: [],
                },
              ])
            }
          >
            <Plus size={16} /> Agregar sección
          </button>
        </div>
        <div className="section-list">
          {sections.map((section, index) => (
            <div key={section.id}>
              <label>
                Nombre de sección {index + 1}
                <input
                  value={section.name}
                  onChange={(event) => renameSection(section.id, event.target.value)}
                />
              </label>
              <span>{section.labels.length} ejercicio(s)</span>
              <button
                aria-label={`Eliminar ${section.name}`}
                disabled={sections.length === 1}
                onClick={() => removeSection(section.id)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="generator panel">
        <label>
          Regla de selección
          <select
            value={rule}
            onChange={(e) => setRule(e.target.value as typeof rule)}
          >
            <option value="range">Rango completo</option>
            <option value="odd">Impares</option>
            <option value="even">Pares</option>
            <option value="multiple">Múltiplos de 5</option>
            <option value="manual">Lista manual</option>
          </select>
        </label>
        <label>
          Valores
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1 al 25 o 5, 10, 15"
          />
        </label>
        <div>
          <small>Vista previa</small>
          <b>{generateSafe(input, rule).join(", ") || "—"}</b>
        </div>
      </div>
      <div className="matrix panel">
        <table>
          <thead>
            <tr>
              <th>Integrante</th>
              {[...new Set(exercises.map((e) => e.section))].map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {eligibleMembers.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.shortName}</b>
                  <small>Histórico: {m.historicalLoad}</small>
                </td>
                {[...new Set(exercises.map((e) => e.section))].map((s) => (
                  <td key={s}>
                    {exercises
                      .filter(
                        (e) =>
                          e.section === s &&
                          allocations.find((a) => a.exerciseId === e.id)
                            ?.memberId === m.id,
                      )
                      .map((e) => (
                        <span className="exercise-chip" key={e.id}>
                          <select
                            aria-label={`Asignación ${s} ${e.label}`}
                            value={m.id}
                            onChange={(x) => move(e.id, x.target.value)}
                          >
                            <option value={m.id}>{e.label}</option>
                            {eligibleMembers
                              .filter((o) => o.id !== m.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {e.label} → {o.shortName}
                                </option>
                              ))}
                          </select>
                          <button
                            className={
                              allocations.find((item) => item.exerciseId === e.id)?.locked
                                ? "locked"
                                : ""
                            }
                            aria-label={`${
                              allocations.find((item) => item.exerciseId === e.id)?.locked
                                ? "Desbloquear"
                                : "Bloquear"
                            } ${s} ${e.label}`}
                            title="Conservar esta asignación al redistribuir"
                            onClick={() => toggleLock(e.id)}
                          >
                            {allocations.find((item) => item.exerciseId === e.id)?.locked
                              ? "🔒"
                              : "○"}
                          </button>
                        </span>
                      ))}
                  </td>
                ))}
                <td>
                  <strong>
                    {allocations.filter((a) => a.memberId === m.id).length}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="notice">
        <CheckCircle2 /> {distributionComplete ? "Cobertura completa" : "Distribución pendiente"}: {allocations.length} de {exercises.length} asignados · {excludedMemberIds.length} excluidos · semilla 5
      </div>
      {saveMessage && <div className="notice">{saveMessage}</div>}
    </>
  );
}
function generateSafe(
  input: string,
  rule: "manual" | "range" | "odd" | "even" | "multiple",
) {
  try {
    return generateLabels(input, rule);
  } catch {
    return [];
  }
}
function Submissions({ courses }: { courses: DashboardData }) {
  const router = useRouter();
  const assignments = useMemo(
    () =>
      courses.flatMap((course) =>
        course.assignments.map((assignment) => ({
          ...assignment,
          courseName: course.name,
          members: course.members,
        })),
      ),
    [courses],
  );
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const assignment = assignments.find((item) => item.id === assignmentId);
  const [memberId, setMemberId] = useState(assignment?.members[0]?.id ?? "");
  const [exerciseId, setExerciseId] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const chooseFiles = (incoming: File[]) => {
    const allowed = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    const invalid = incoming.find(
      (file) => !allowed.has(file.type) || file.size > 25 * 1024 * 1024,
    );
    if (invalid) {
      setMessage(`${invalid.name}: formato no permitido o supera 25 MB.`);
      return;
    }
    setPending(incoming.slice(0, 20));
    setMessage("");
  };
  const submit = async () => {
    if (!assignment || !memberId || !pending.length) return;
    setUploading(true);
    setMessage("");
    setProgress(0);
    const uploadId = crypto.randomUUID();
    try {
      const completed: Array<{ pathname: string; originalName: string; exerciseId: string | null }> = [];
      for (const [index, file] of pending.entries()) {
        const payload = {
          assignmentId: assignment.id,
          memberId,
          exerciseId: exerciseId || null,
          uploadId,
          originalName: file.name,
        };
        const blob = await upload(
          submissionPath(assignment.id, uploadId, file.name),
          file,
          {
            access: "private",
            handleUploadUrl: "/api/submissions/upload",
            clientPayload: JSON.stringify(payload),
            contentType: file.type,
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: ({ percentage }) =>
              setProgress(Math.round(((index + percentage / 100) / pending.length) * 100)),
          },
        );
        completed.push({ pathname: blob.pathname, originalName: file.name, exerciseId: exerciseId || null });
      }
      const response = await fetch("/api/submissions/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: assignment.id, memberId, uploadId, files: completed }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; version?: number };
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo registrar la entrega.");
      setPending([]);
      setProgress(100);
      setMessage(`Entrega guardada como versión ${result.version}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la entrega.");
    } finally {
      setUploading(false);
    }
  };
  const removeStored = async (fileId: string) => {
    if (!window.confirm("¿Eliminar este archivo privado de forma permanente?")) return;
    const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("No se pudo eliminar el archivo.");
      return;
    }
    setMessage("Archivo eliminado.");
    router.refresh();
  };
  return (
    <>
      <Title eyebrow="Archivos privados" title="Recepción de entregas">
        <span className="pill neutral">
          {assignment?.submissions.length ?? 0} entrega(s) registrada(s)
        </span>
      </Title>
      <div className="generator panel">
        <label>
          Tarea
          <select
            value={assignmentId}
            onChange={(event) => {
              const nextId = event.target.value;
              const next = assignments.find((item) => item.id === nextId);
              setAssignmentId(nextId);
              setMemberId(next?.members[0]?.id ?? "");
              setExerciseId("");
            }}
          >
            {assignments.map((item) => (
              <option key={item.id} value={item.id}>{item.courseName} · Tarea {item.number}</option>
            ))}
          </select>
        </label>
        <label>
          Integrante
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            {assignment?.members.map((member) => (
              <option key={member.id} value={member.id}>{member.fullName}</option>
            ))}
          </select>
        </label>
        <label>
          Ejercicio asociado (opcional)
          <select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
            <option value="">Entrega general</option>
            {assignment?.sections.flatMap((section) =>
              section.exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>{section.name} · {exercise.label}</option>
              )),
            )}
          </select>
        </label>
      </div>
      <label className="drop">
        <Upload size={32} />
        <strong>Arrastra PDFs o imágenes aquí</strong>
        <span>PDF, JPG, PNG o WEBP · máximo 25 MB por archivo</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          disabled={!assignment || !memberId || uploading}
          onChange={(event) => chooseFiles(Array.from(event.target.files || []))}
        />
        <b>Seleccionar archivos</b>
      </label>
      {pending.length > 0 && (
        <div className="panel">
          <p>{pending.length} archivo(s) preparados para una nueva versión.</p>
          <button className="primary" disabled={uploading} onClick={submit}>
            {uploading ? `Subiendo… ${progress}%` : "Guardar entrega privada"}
          </button>
        </div>
      )}
      {message && <div className="notice">{message}</div>}
      <div className="panel file-list">
        {!assignment || assignment.submissions.length === 0 ? (
          <div className="empty">
            <FileText />
            <h3>Aún no hay archivos</h3>
            <p>
              Selecciona una tarea, un integrante y los archivos recibidos.
              Se almacenarán de forma privada y con historial de versiones.
            </p>
          </div>
        ) : (
          assignment.submissions.flatMap((submission) =>
            submission.versions.flatMap((version) =>
              version.files.map((file) => (
                <div key={file.id}>
                  <FileText />
                  <span>
                    <b>{submission.member.fullName} · {file.originalName}</b>
                    <small>
                      Versión {version.version} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · {submission.late ? "Entrega tardía" : "Entregado"}
                    </small>
                  </span>
                  <a className="outline" href={`/api/files/${file.id}`} target="_blank">Ver</a>
                  <button onClick={() => removeStored(file.id)}>Eliminar</button>
                </div>
              )),
            ),
          )
        )}
      </div>
    </>
  );
}
function Evaluation({ courses }: { courses: DashboardData }) {
  const criteria = [
    "Puntualidad",
    "Presentación PDF",
    "Trabajo en equipo",
    "Comunicación",
    "Ejercicios completos",
  ];
  const assignments = useMemo(
    () =>
      courses.flatMap((course) =>
        course.assignments.map((assignment) => ({
          ...assignment,
          courseName: course.name,
          members: course.members,
        })),
      ),
    [courses],
  );
  const makeScores = (item: (typeof assignments)[number] | undefined) =>
    Object.fromEntries(
      (item?.members ?? []).map((member) => {
        const stored = item?.evaluations.find(
          (evaluation) => evaluation.memberId === member.id,
        );
        return [
          member.id,
          stored?.scores.map((score) => score.score) ?? [20, 20, 20, 20, 20],
        ];
      }),
    ) as Record<string, number[]>;
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const assignment = assignments.find((item) => item.id === assignmentId);
  const [scores, setScores] = useState<Record<string, number[]>>(() =>
    makeScores(assignments[0]),
  );
  const [message, setMessage] = useState("");
  const [saving, startSaving] = useTransition();
  const setScore = (memberId: string, criterionIndex: number, value: number) =>
    setScores((current) => ({
      ...current,
      [memberId]: (current[memberId] ?? [20, 20, 20, 20, 20]).map(
        (score, index) => (index === criterionIndex ? value : score),
      ),
    }));
  const applyAll = (value: number) =>
    setScores(
      Object.fromEntries(
        (assignment?.members ?? []).map((member) => [
          member.id,
          criteria.map(() => value),
        ]),
      ),
    );
  return (
    <>
      <Title eyebrow="Revisión rápida" title="Evaluación del grupo">
        <div className="title-actions">
          <button
            className="outline"
            disabled={!assignment}
            onClick={() => applyAll(20)}
          >
            Aplicar 20 a todos
          </button>
          <button
            className="primary"
            disabled={!assignment || saving}
            onClick={() =>
              assignment &&
              startSaving(async () => {
                const result = await saveEvaluations({
                  assignmentId: assignment.id,
                  evaluations: assignment.members.map((member) => ({
                    memberId: member.id,
                    scores: scores[member.id] ?? [20, 20, 20, 20, 20],
                  })),
                });
                setMessage(result.message);
              })
            }
          >
            {saving ? "Guardando…" : "Guardar evaluaciones"}
          </button>
        </div>
      </Title>
      <div className="generator panel">
        <label>
          Tarea
          <select
            value={assignmentId}
            onChange={(event) => {
              const next = assignments.find(
                (item) => item.id === event.target.value,
              );
              setAssignmentId(event.target.value);
              setScores(makeScores(next));
              setMessage("");
            }}
          >
            {assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.courseName} · Tarea {item.number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Integrante</th>
              {criteria.map((c) => (
                <th key={c}>
                  {c}
                  <small>Máx. 20</small>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {assignment?.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.shortName}</b>
                  <small>{m.carnet}</small>
                </td>
                {criteria.map((c, criterionIndex) => (
                  <td key={c}>
                    <input
                      className="score"
                      type="number"
                      min="0"
                      max="20"
                      value={scores[m.id]?.[criterionIndex] ?? 20}
                      aria-label={`${c} de ${m.fullName}`}
                      onChange={(event) =>
                        setScore(
                          m.id,
                          criterionIndex,
                          Math.max(
                            0,
                            Math.min(20, Number(event.target.value)),
                          ),
                        )
                      }
                    />
                  </td>
                ))}
                <td>
                  <strong>
                    {(scores[m.id] ?? [20, 20, 20, 20, 20]).reduce(
                      (total, score) => total + score,
                      0,
                    )}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="notice">
        <CheckCircle2 /> La suma máxima de los criterios es 100 puntos.
      </p>
      {message && <p className="notice">{message}</p>}
    </>
  );
}
function PdfBuilder({
  storedFiles,
  download,
  members,
  assignmentId,
  reportBody,
  setReportBody,
  onMoveFile,
  onConfigureFile,
  onMoveFileTo,
  imageQuality,
  setImageQuality,
}: {
  storedFiles: StoredPdfSource[];
  download: () => void;
  members: Member[];
  assignmentId?: string;
  reportBody: string;
  setReportBody: (body: string) => void;
  onMoveFile: (fileId: string, direction: -1 | 1) => void;
  onConfigureFile: (
    fileId: string,
    options: Pick<StoredPdfSource, "rotation" | "selectedPages">,
  ) => void;
  onMoveFileTo: (fileId: string, targetId: string) => void;
  imageQuality: ImageQuality;
  setImageQuality: (quality: ImageQuality) => void;
}) {
  const [savingReport, startSavingReport] = useTransition();
  const [savingConfiguration, startSavingConfiguration] = useTransition();
  const [reportMessage, setReportMessage] = useState("");
  const [configurationMessage, setConfigurationMessage] = useState("");
  const [pageInputs, setPageInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      storedFiles.map((file) => [file.id, formatPageSelection(file.selectedPages)]),
    ),
  );
  const blocks = [
    "Portada del reporte",
    "Desempeño grupal",
    "Evaluación detallada",
    "Resumen de notas",
    "Carátula oficial",
    "Integrantes del grupo",
    ...storedFiles.map((file) => file.name),
  ];
  return (
    <>
      <Title eyebrow="Constructor final" title="Compilar PDF">
        <button className="primary" onClick={download} disabled={!assignmentId}>
          <FileDown size={17} /> Generar y descargar
        </button>
      </Title>
      <div className="panel report-editor">
        <div>
          <h3>Reporte de desempeño semanal</h3>
          <p>
            Genera el texto con entregas, atrasos y distribución actuales; luego
            puedes editarlo antes de compilar.
          </p>
        </div>
        <textarea
          aria-label="Texto del reporte semanal"
          value={reportBody}
          onChange={(event) => setReportBody(event.target.value)}
          rows={7}
        />
        <div className="title-actions">
          <button
            className="outline"
            disabled={!assignmentId || savingReport}
            onClick={() =>
              assignmentId &&
              startSavingReport(async () => {
                const result = await saveWeeklyReport({ assignmentId });
                if (result.body) setReportBody(result.body);
                setReportMessage(result.message);
              })
            }
          >
            Generar desde datos actuales
          </button>
          <button
            className="primary"
            disabled={!assignmentId || reportBody.trim().length < 50 || savingReport}
            onClick={() =>
              assignmentId &&
              startSavingReport(async () => {
                const result = await saveWeeklyReport({
                  assignmentId,
                  body: reportBody,
                });
                setReportMessage(result.message);
              })
            }
          >
            {savingReport ? "Guardando…" : "Guardar texto editado"}
          </button>
        </div>
        {reportMessage && <p className="notice">{reportMessage}</p>}
      </div>
      <div className="builder">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Orden y páginas</h3>
              <p>Arrastra entregas para ordenarlas, rota su contenido y elige páginas con rangos como 1-3,5.</p>
            </div>
            <div className="quality-actions">
              <label>
                Calidad de imágenes
                <select
                  value={imageQuality}
                  onChange={(event) => setImageQuality(event.target.value as ImageQuality)}
                >
                  <option value="high">Alta - 2400 px / 90%</option>
                  <option value="balanced">Equilibrada - 1800 px / 78%</option>
                  <option value="compact">Compacta - 1200 px / 62%</option>
                </select>
              </label>
              <button
                className="primary"
                disabled={!assignmentId || savingConfiguration}
                onClick={() =>
                  assignmentId &&
                  startSavingConfiguration(async () => {
                    try {
                      const files = storedFiles.map((file) => ({
                        fileId: file.id,
                        rotation: file.rotation ?? 0,
                        selectedPages:
                          file.mimeType === "application/pdf"
                            ? parsePageSelection(
                                pageInputs[file.id] ?? "",
                                file.pageCount ?? undefined,
                              )
                            : undefined,
                      }));
                      const result = await savePdfConfiguration({
                        assignmentId,
                        imageQuality,
                        files,
                      });
                      setConfigurationMessage(result.message);
                    } catch (error) {
                      setConfigurationMessage(
                        error instanceof Error ? error.message : "Configuración inválida.",
                      );
                    }
                  })
                }
              >
                {savingConfiguration ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
          {configurationMessage && <p className="notice">{configurationMessage}</p>}
          {blocks.map((b, i) => (
            <div
              className="block"
              key={`${b}-${i}`}
              draggable={i >= 6}
              onDragStart={(event) => {
                if (i >= 6) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", storedFiles[i - 6].id);
                }
              }}
              onDragOver={(event) => {
                if (i >= 6) event.preventDefault();
              }}
              onDrop={(event) => {
                if (i >= 6) {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  if (sourceId) onMoveFileTo(sourceId, storedFiles[i - 6].id);
                }
              }}
            >
              <b>⋮⋮</b>
              <span>
                <strong>{b}</strong>
                <small>
                  {i < 6
                    ? "Página administrativa generada"
                    : "Entrega recibida"}
                </small>
              </span>
              {i >= 6 && (
                <div className="file-controls">
                  <label>
                    Rotación
                    <select
                      aria-label={`Rotación de ${b}`}
                      value={storedFiles[i - 6].rotation ?? 0}
                      onChange={(event) =>
                        onConfigureFile(storedFiles[i - 6].id, {
                          rotation: Number(event.target.value) as 0 | 90 | 180 | 270,
                        })
                      }
                    >
                      <option value="0">0°</option>
                      <option value="90">90°</option>
                      <option value="180">180°</option>
                      <option value="270">270°</option>
                    </select>
                  </label>
                  {storedFiles[i - 6].mimeType === "application/pdf" && (
                    <>
                      <label>
                        Páginas
                        <input
                          aria-label={`Páginas de ${b}`}
                          value={pageInputs[storedFiles[i - 6].id] ?? ""}
                          placeholder="Todas"
                          onChange={(event) => {
                            const value = event.target.value;
                            setPageInputs((current) => ({
                              ...current,
                              [storedFiles[i - 6].id]: value,
                            }));
                            try {
                              onConfigureFile(storedFiles[i - 6].id, {
                                selectedPages: parsePageSelection(
                                  value,
                                  storedFiles[i - 6].pageCount ?? undefined,
                                ),
                              });
                              setConfigurationMessage("");
                            } catch (error) {
                              setConfigurationMessage(
                                error instanceof Error ? error.message : "Selección inválida.",
                              );
                            }
                          }}
                        />
                      </label>
                      <PdfPageThumbnails
                        url={storedFiles[i - 6].url}
                        name={b}
                        selectedPages={storedFiles[i - 6].selectedPages}
                        onChange={(pages) => {
                          setPageInputs((current) => ({
                            ...current,
                            [storedFiles[i - 6].id]: formatPageSelection(pages),
                          }));
                          onConfigureFile(storedFiles[i - 6].id, { selectedPages: pages });
                        }}
                      />
                    </>
                  )}
                  <div className="block-actions">
                    <button
                      aria-label={`Subir ${b}`}
                      disabled={i === 6}
                      onClick={() => onMoveFile(storedFiles[i - 6].id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Bajar ${b}`}
                      disabled={i === blocks.length - 1}
                      onClick={() => onMoveFile(storedFiles[i - 6].id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              )}
              <em>{i + 1}</em>
            </div>
          ))}
        </div>
        <div className="preview panel">
          <div className="paper">
            <small>UNIVERSIDAD MARIANO GÁLVEZ</small>
            <h2>Reporte de desempeño semanal</h2>
            <p>Matemática Discreta</p>
            <hr />
            <b>INTEGRANTES DEL GRUPO</b>
            {members.map((m) => (
              <span key={m.id}>• {m.name}</span>
            ))}
          </div>
          <small>
            {6 + storedFiles.length} páginas estimadas · Carta · Calidad alta
          </small>
        </div>
      </div>
    </>
  );
}
function SettingsView({
  user,
}: {
  user: {
    name: string;
    systemName: string;
    university?: string | null;
    faculty?: string | null;
    campus?: string | null;
    shift?: string | null;
    degree?: string | null;
  };
}) {
  const [values, setValues] = useState({
    name: user.name,
    systemName: user.systemName,
    university: user.university ?? "",
    faculty: user.faculty ?? "",
    campus: user.campus ?? "",
    shift: user.shift ?? "",
    degree: user.degree ?? "",
    timezone: "America/Guatemala",
  });
  const [message, setMessage] = useState("");
  const [saving, startSaving] = useTransition();
  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) =>
      setValues((current) => ({
        ...current,
        [name]: event.target.value,
      })),
  });
  return (
    <>
      <Title eyebrow="Preferencias" title="Configuración" />
      <div className="panel form">
        <h3>Identidad del sistema</h3>
        <label>
          Nombre de la aplicación
          <input {...field("systemName")} />
        </label>
        <label>
          Nombre del coordinador
          <input {...field("name")} />
        </label>
        <div className="two">
          <label>
            País
            <select defaultValue="GT">
              <option value="GT">Guatemala</option>
            </select>
          </label>
          <label>
            Zona horaria
            <select {...field("timezone")}>
              <option>America/Guatemala</option>
            </select>
          </label>
        </div>
        <h3>Información institucional</h3>
        <label>
          Universidad
          <input {...field("university")} />
        </label>
        <label>
          Facultad
          <input {...field("faculty")} />
        </label>
        <label>
          Carrera
          <input {...field("degree")} />
        </label>
        <div className="two">
          <label>
            Sede
            <input {...field("campus")} />
          </label>
          <label>
            Jornada
            <input {...field("shift")} />
          </label>
        </div>
        <h3>Documento predeterminado</h3>
        <div className="two">
          <label>
            Tamaño
            <select defaultValue="letter">
              <option value="letter">Carta (8.5 × 11 in)</option>
            </select>
          </label>
          <label>
            Idioma
            <select defaultValue="es">
              <option value="es">Español</option>
            </select>
          </label>
        </div>
        <button
          className="primary"
          disabled={saving}
          onClick={() =>
            startSaving(async () => {
              const result = await updateProfile(values);
              setMessage(result.message);
            })
          }
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {message && <p className="notice">{message}</p>}
      </div>
    </>
  );
}
