"use client";
import { useActionState, useEffect } from "react";
import { X } from "lucide-react";
import {
  createAssignment,
  createCourse,
  createMember,
} from "@/app/app/actions";
import type { DashboardData } from "@/data/dashboard";

type Mode = "course" | "member" | "assignment";
const labels = {
  course: "Nuevo curso",
  member: "Agregar integrante",
  assignment: "Nueva tarea",
};
export function EntityModal({
  mode,
  courses,
  onClose,
}: {
  mode: Mode;
  courses: DashboardData;
  onClose: () => void;
}) {
  const action =
    mode === "course"
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
            <h2 id="modal-title">{labels[mode]}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </header>
        <form action={formAction}>
          {mode !== "course" && (
            <label>
              Curso
              <select name="courseId" required defaultValue="">
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
                <input name="name" required />
              </label>
              <div className="two">
                <label>
                  Código
                  <input name="code" />
                </label>
                <label>
                  Año académico
                  <input
                    name="academicYear"
                    type="number"
                    defaultValue={new Date().getFullYear()}
                    required
                  />
                </label>
              </div>
              <label>
                Docente
                <input name="teacher" />
              </label>
              <div className="two">
                <label>
                  Sección
                  <input name="section" />
                </label>
                <label>
                  Número de grupo
                  <input name="groupNumber" />
                </label>
              </div>
            </>
          )}
          {mode === "member" && (
            <>
              <label>
                Nombre completo
                <input name="fullName" required />
              </label>
              <div className="two">
                <label>
                  Nombre corto
                  <input name="shortName" required />
                </label>
                <label>
                  Carné
                  <input name="carnet" required />
                </label>
              </div>
              <label>
                Correo opcional
                <input name="email" type="email" />
              </label>
            </>
          )}
          {mode === "assignment" && (
            <>
              <div className="two">
                <label>
                  Número de tarea
                  <input name="number" type="number" min="1" required />
                </label>
                <label>
                  Número de semana
                  <input name="weekNumber" type="number" min="1" required />
                </label>
              </div>
              <label>
                Título
                <input name="title" required />
              </label>
              <label>
                Tema
                <input name="topic" />
              </label>
              <div className="two">
                <label>
                  Inicio de semana
                  <input
                    name="weekStart"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </label>
                <label>
                  Final de semana
                  <input
                    name="weekEnd"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </label>
              </div>
              <label>
                Fecha y hora límite
                <input name="dueAt" type="datetime-local" required />
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
