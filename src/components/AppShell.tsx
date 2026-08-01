"use client";
import { useMemo, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Send,
  Settings,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  buildExercises,
  distribute,
  generateLabels,
  type Allocation,
  type Exercise,
  type Member,
} from "@/lib/domain";
import { createAssignmentPdf } from "@/lib/pdf";
import { logout } from "@/app/(auth)/actions";
import type { DashboardData } from "@/data/dashboard";
import { EntityModal } from "@/components/EntityModal";
import { saveDistribution } from "@/app/app/actions";
import { submissionPath } from "@/lib/submission-path";

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
const sections = [
  { id: "s53", name: "Sección 5.3", labels: ["5", "10", "15", "20", "25"] },
  { id: "s54", name: "Sección 5.4", labels: ["5", "10", "15", "20", "25"] },
  { id: "s55", name: "Sección 5.5", labels: ["5", "10", "15", "20", "25"] },
];

export default function AppShell({
  currentUser = {
    name: "Carlos Díaz",
    systemName: "Coordinador de Tareas",
  },
  initialData = [],
}: {
  currentUser?: { name: string; systemName: string };
  initialData?: DashboardData;
}) {
  const members = useMemo(
    () =>
      initialData[0]?.members.map((member) => ({
        id: member.id,
        name: member.fullName,
        shortName: member.shortName,
        carnet: member.carnet,
        historicalLoad: member.workloadBalance,
        active: member.active,
      })) ?? [],
    [initialData],
  );
  const [view, setView] = useState<View>("Resumen");
  const [menu, setMenu] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>(() =>
    buildExercises(sections),
  );
  const [allocations, setAllocations] = useState<Allocation[]>(() =>
    members.length ? distribute(buildExercises(sections), members) : [],
  );
  const [modal, setModal] = useState<"course" | "member" | "assignment" | null>(
    null,
  );
  const [rule, setRule] = useState<
    "manual" | "range" | "odd" | "even" | "multiple"
  >("multiple");
  const [input, setInput] = useState("5 al 25");
  const [files, setFiles] = useState<File[]>([]);
  const [toast, setToast] = useState("");
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
      const next = buildExercises(sections.map((s) => ({ ...s, labels })));
      setExercises(next);
      setAllocations(members.length ? distribute(next, members) : []);
      notify(`${next.length} ejercicios distribuidos sin duplicados`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo distribuir");
    }
  };
  const download = async () => {
    notify("Generando documento…");
    const bytes = await createAssignmentPdf({
      members,
      exercises,
      allocations,
      files,
    });
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tarea-semana-5.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("PDF final generado correctamente");
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
            <span>Matemática Discreta</span>
            <small>Tarea 5 · Semana 5</small>
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
              onCreate={() => setModal("course")}
            />
          )}{" "}
          {view === "Integrantes" && (
            <Members
              totals={totals}
              onCreate={() => setModal("member")}
              hasCourses={initialData.length > 0}
            />
          )}{" "}
          {view === "Tareas" && (
            <Tasks
              courses={initialData}
              onCreate={() => setModal("assignment")}
            />
          )}{" "}
          {view === "Distribución" && (
            <Distribution
              members={members}
              exercises={exercises}
              allocations={allocations}
              setAllocations={setAllocations}
              rule={rule}
              setRule={setRule}
              input={input}
              setInput={setInput}
              regenerate={regenerate}
              assignmentId={currentAssignmentId}
            />
          )}{" "}
          {view === "Entregas" && (
            <Submissions
              setFiles={setFiles}
              courses={initialData}
            />
          )}{" "}
          {view === "Evaluación" && <Evaluation members={members} />}{" "}
          {view === "PDF final" && (
            <PdfBuilder files={files} download={download} members={members} />
          )}{" "}
          {view === "Configuración" && <SettingsView />}
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
          mode={modal}
          courses={initialData}
          onClose={() => setModal(null)}
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
          <strong className="amber">0</strong>
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
            ["1", "Ejercicios definidos", "15 ejercicios en 3 secciones", true],
            [
              "2",
              "Distribución completada",
              "Carga equilibrada entre 6 integrantes",
              true,
            ],
            ["3", "Recibir entregas", "4 de 6 archivos recibidos", false],
            ["4", "Evaluar integrantes", "Pendiente de revisión", false],
            [
              "5",
              "Generar PDF final",
              "Listo cuando completes la evaluación",
              false,
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
}: {
  courses: DashboardData;
  onCreate: () => void;
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
              <button>Ver curso →</button>
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
}: {
  totals: { m: Member; count: number }[];
  onCreate: () => void;
  hasCourses: boolean;
}) {
  return (
    <>
      <Title eyebrow="Matemática Discreta" title="Integrantes del grupo">
        <button className="primary" onClick={onCreate} disabled={!hasCourses}>
          <Plus size={17} /> Agregar integrante
        </button>
      </Title>
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
                    <span className="status">Activo</span>
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
}: {
  courses: DashboardData;
  onCreate: () => void;
}) {
  const assignments = courses.flatMap((course) =>
    course.assignments.map((assignment) => ({
      ...assignment,
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
            <button className="outline">Abrir tarea</button>
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
  allocations,
  setAllocations,
  rule,
  setRule,
  input,
  setInput,
  regenerate,
  assignmentId,
}: {
  members: Member[];
  exercises: Exercise[];
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  rule: "manual" | "range" | "odd" | "even" | "multiple";
  setRule: (v: "manual" | "range" | "odd" | "even" | "multiple") => void;
  input: string;
  setInput: (v: string) => void;
  regenerate: () => void;
  assignmentId?: string;
}) {
  const [saving, startSaving] = useTransition();
  const [saveMessage, setSaveMessage] = useState("");
  const move = (eid: string, mid: string) =>
    setAllocations((a) =>
      a.map((x) => (x.exerciseId === eid ? { ...x, memberId: mid } : x)),
    );
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
            disabled={!assignmentId || !members.length || saving}
            onClick={() =>
              assignmentId &&
              startSaving(async () => {
                const result = await saveDistribution({
                  assignmentId,
                  seed: "5",
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
            {members.map((m) => (
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
                        <select
                          aria-label={`Asignación ${s} ${e.label}`}
                          key={e.id}
                          value={m.id}
                          onChange={(x) => move(e.id, x.target.value)}
                        >
                          <option value={m.id}>{e.label}</option>
                          {members
                            .filter((o) => o.id !== m.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {e.label} → {o.shortName}
                              </option>
                            ))}
                        </select>
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
        <CheckCircle2 /> Cobertura completa: {exercises.length} asignados · 0
        duplicados · 0 pendientes · semilla 5
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
function Submissions({
  setFiles,
  courses,
}: {
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  courses: DashboardData;
}) {
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
      setFiles((current) => [...current, ...pending]);
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
function Evaluation({ members }: { members: Member[] }) {
  const criteria = [
    "Puntualidad",
    "Presentación PDF",
    "Trabajo en equipo",
    "Comunicación",
    "Ejercicios completos",
  ];
  return (
    <>
      <Title eyebrow="Revisión rápida" title="Evaluación del grupo">
        <button className="primary">Guardar evaluaciones</button>
      </Title>
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
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.shortName}</b>
                  <small>{m.carnet}</small>
                </td>
                {criteria.map((c) => (
                  <td key={c}>
                    <input
                      className="score"
                      type="number"
                      min="0"
                      max="20"
                      defaultValue="20"
                    />
                  </td>
                ))}
                <td>
                  <strong>100</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="notice">
        <CheckCircle2 /> La suma máxima de los criterios es 100 puntos.
      </p>
    </>
  );
}
function PdfBuilder({
  files,
  download,
  members,
}: {
  files: File[];
  download: () => void;
  members: Member[];
}) {
  const blocks = [
    "Portada del reporte",
    "Desempeño grupal y tablas",
    "Carátula oficial",
    "Integrantes del grupo",
    ...files.map((f) => f.name),
  ];
  return (
    <>
      <Title eyebrow="Constructor final" title="Compilar PDF">
        <button className="primary" onClick={download}>
          <FileDown size={17} /> Generar y descargar
        </button>
      </Title>
      <div className="builder">
        <div className="panel">
          <h3>Orden de páginas</h3>
          <p>Arrastra los bloques para ajustar el documento.</p>
          {blocks.map((b, i) => (
            <div className="block" key={`${b}-${i}`}>
              <b>⋮⋮</b>
              <span>
                <strong>{b}</strong>
                <small>
                  {i < 4
                    ? "Página administrativa generada"
                    : "Entrega recibida"}
                </small>
              </span>
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
            {4 + files.length} páginas estimadas · Carta · Calidad alta
          </small>
        </div>
      </div>
    </>
  );
}
function SettingsView() {
  return (
    <>
      <Title eyebrow="Preferencias" title="Configuración" />
      <div className="panel form">
        <h3>Identidad del sistema</h3>
        <label>
          Nombre de la aplicación
          <input defaultValue="Coordinador de Tareas" />
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
            <select defaultValue="America/Guatemala">
              <option>America/Guatemala</option>
            </select>
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
        <button className="primary">Guardar cambios</button>
      </div>
    </>
  );
}
