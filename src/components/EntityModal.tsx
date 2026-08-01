"use client";
import { useActionState, useEffect } from "react";
import { X } from "lucide-react";
import {
  createAssignment,
  createCourse,
  createMember,
  updateAssignment,
  updateCourse,
  updateMember,
} from "@/app/app/actions";
import type { DashboardData } from "@/data/dashboard";

type Mode = "course" | "member" | "assignment";
const labels = {
  course: "Nuevo curso",
  member: "Agregar integrante",
  assignment: "Nueva tarea",
};
export type EditableEntity = {
  id: string;
  courseId?: string;
  name?: string;
  code?: string | null;
  teacher?: string | null;
  section?: string | null;
  groupNumber?: string | null;
  academicYear?: number | null;
  fullName?: string;
  shortName?: string;
  carnet?: string;
  email?: string | null;
  number?: number;
  weekNumber?: number;
  title?: string;
  topic?: string | null;
  weekStart?: string;
  weekEnd?: string;
  dueAt?: string;
};
export function EntityModal({
  mode,
  courses,
  onClose,
  initial,
}: {
  mode: Mode;
  courses: DashboardData;
  onClose: () => void;
  initial?: EditableEntity;
}) {
  const action = initial
    ? mode === "course"
      ? updateCourse
      : mode === "member"
        ? updateMember
        : updateAssignment
    : mode === "course"
      ? createCourse
      : mode === "member"
        ? createMember
        : createAssignment;
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(onClose, 650);
      return () => clearTimeout(timer);
    }
  }, [state?.ok, onClose]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header>
          <div>
            <small>DATOS REQUERIDOS</small>
            <h2 id="modal-title">
              {initial ? labels[mode].replace("Nuevo", "Editar").replace("Nueva", "Editar").replace("Agregar", "Editar") : labels[mode]}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </header>
        <form action={formAction}>
          {initial && <input type="hidden" name="id" value={initial.id} />}
          {mode !== "course" && (
            <label>
              Curso
              {initial?.courseId && (
                <input type="hidden" name="courseId" value={initial.courseId} />
              )}
              <select
                name={initial ? undefined : "courseId"}
                required
                disabled={Boolean(initial)}
                defaultValue={initial?.courseId ?? ""}
              >
                <option value="" disabled>
                  Selecciona un curso
                </option>
                {courses
                  .filter((c) => c.active)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {mode === "course" && (
            <>
              <label>
                Nombre del curso
                <input name="name" required defaultValue={initial?.name ?? ""} />
              </label>
              <div className="two">
                <label>
                  Código
                  <input name="code" defaultValue={initial?.code ?? ""} />
                </label>
                <label>
                  Año académico
                  <input
                    name="academicYear"
                    type="number"
                    defaultValue={initial?.academicYear ?? new Date().getFullYear()}
                    required
                  />
                </label>
              </div>
              <label>
                Docente
                <input name="teacher" defaultValue={initial?.teacher ?? ""} />
              </label>
              <div className="two">
                <label>
                  Sección
                  <input name="section" defaultValue={initial?.section ?? ""} />
                </label>
                <label>
                  Número de grupo
                  <input name="groupNumber" defaultValue={initial?.groupNumber ?? ""} />
                </label>
              </div>
            </>
          )}
          {mode === "member" && (
            <>
              <label>
                Nombre completo
                <input name="fullName" required defaultValue={initial?.fullName ?? ""} />
              </label>
              <div className="two">
                <label>
                  Nombre corto
                  <input name="shortName" required defaultValue={initial?.shortName ?? ""} />
                </label>
                <label>
                  Carné
                  <input name="carnet" required defaultValue={initial?.carnet ?? ""} />
                </label>
              </div>
              <label>
                Correo opcional
                <input name="email" type="email" defaultValue={initial?.email ?? ""} />
              </label>
            </>
          )}
          {mode === "assignment" && (
            <>
              <div className="two">
                <label>
                  Número de tarea
                  <input name="number" type="number" min="1" required defaultValue={initial?.number} />
                </label>
                <label>
                  Número de semana
                  <input name="weekNumber" type="number" min="1" required defaultValue={initial?.weekNumber} />
                </label>
              </div>
              <label>
                Título
                <input name="title" required defaultValue={initial?.title ?? ""} />
              </label>
              <label>
                Tema
                <input name="topic" defaultValue={initial?.topic ?? ""} />
              </label>
              <div className="two">
                <label>
                  Inicio de semana
                  <input
                    name="weekStart"
                    type="date"
                    defaultValue={initial?.weekStart?.slice(0, 10) ?? today}
                    required
                  />
                </label>
                <label>
                  Final de semana
                  <input
                    name="weekEnd"
                    type="date"
                    defaultValue={initial?.weekEnd?.slice(0, 10) ?? today}
                    required
                  />
                </label>
              </div>
              <label>
                Fecha y hora límite
                <input
                  name="dueAt"
                  type="datetime-local"
                  required
                  defaultValue={initial?.dueAt?.slice(0, 16)}
                />
              </label>
            </>
          )}
          {state?.message && (
            <p className={state.ok ? "form-success" : "auth-error"}>
              {state.message}
            </p>
          )}
          <button className="primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </section>
    </div>
  );
}
