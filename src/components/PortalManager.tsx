"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  MessageSquareWarning,
  RefreshCw,
  Share2,
  XCircle,
} from "lucide-react";
import {
  regenerateSubmissionPortal,
  reviewSubmission,
  saveSubmissionPortal,
} from "@/app/app/portal-actions";
import {
  submissionOriginLabel,
  submissionStatusLabel,
  submissionVersionLabel,
} from "@/lib/submission-presentation";

type Portal = {
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  allowLateSubmissions: boolean;
  allowReplacements: boolean;
  maxReplacements: number;
  maxFileSize: number;
  allowedMimeTypes: unknown;
  instructions: string | null;
  tokenVersion: number;
  token: string | null;
  tokenIssue: string | null;
} | null;
type Submission = {
  id: string;
  status: string;
  late: boolean;
  origin: string;
  reviewComment: string | null;
  dataIssue: string | null;
  member: { fullName: string };
  _count: { versions: number };
  versions: {
    version: number;
    files: { sizeBytes: number; pageCount: number | null }[];
  }[];
};
type Assignment = {
  id: string;
  number: number;
  title: string;
  dueAt: string;
  courseName: string;
  submissionPortal: Portal;
  members: { id: string; active: boolean }[];
  exclusions: { memberId: string }[];
  submissions: Submission[];
};
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export default function PortalManager({
  assignment,
  refresh,
}: {
  assignment: Assignment;
  refresh: () => void;
}) {
  const portal = assignment.submissionPortal;
  const [enabled, setEnabled] = useState(portal?.enabled ?? false);
  const [opensAt, setOpensAt] = useState(localDate(portal?.opensAt ?? null));
  const [closesAt, setClosesAt] = useState(
    localDate(portal?.closesAt ?? assignment.dueAt),
  );
  const [late, setLate] = useState(portal?.allowLateSubmissions ?? false);
  const [replacements, setReplacements] = useState(
    portal?.allowReplacements ?? true,
  );
  const [maxReplacements, setMaxReplacements] = useState(
    portal?.maxReplacements ?? 2,
  );
  const [maxMb, setMaxMb] = useState(
    Math.round((portal?.maxFileSize ?? 25 * 1024 * 1024) / 1024 / 1024),
  );
  const configuredTypes = Array.isArray(portal?.allowedMimeTypes)
    ? (portal.allowedMimeTypes as string[])
    : ["application/pdf"];
  const [images, setImages] = useState(configuredTypes.length > 1);
  const [instructions, setInstructions] = useState(
    portal?.instructions ??
      "Suba un único archivo PDF legible con todos los ejercicios asignados.",
  );
  const [message, setMessage] = useState("");
  const [reviewDialog, setReviewDialog] = useState<null | {
    submissionId: string;
    status: "NEEDS_CORRECTION" | "REJECTED";
    memberName: string;
  }>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [busy, start] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const url =
    portal?.token && typeof window !== "undefined"
      ? `${window.location.origin}/entregar/${portal.token}`
      : "";
  const eligible = assignment.members.filter(
    (member) =>
      member.active &&
      !assignment.exclusions.some((item) => item.memberId === member.id),
  ).length;
  const delivered = new Set(
    assignment.submissions.map((item) => item.member.fullName),
  ).size;
  const save = () =>
    start(async () => {
      try {
        await saveSubmissionPortal({
          assignmentId: assignment.id,
          enabled,
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          allowLateSubmissions: late,
          allowReplacements: replacements,
          maxReplacements,
          maxFileSize: maxMb * 1024 * 1024,
          allowedMimeTypes: images
            ? ["application/pdf", "image/jpeg", "image/png", "image/webp"]
            : ["application/pdf"],
          instructions,
        });
        setMessage("Portal guardado correctamente.");
        refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "No se pudo guardar.",
        );
      }
    });
  const regenerate = () => {
    if (
      !confirm(
        "El enlace anterior dejará de funcionar inmediatamente. ¿Continuar?",
      )
    )
      return;
    start(async () => {
      try {
        await regenerateSubmissionPortal(assignment.id);
        setMessage("Enlace regenerado; el anterior fue revocado.");
        refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "No se pudo regenerar.",
        );
      }
    });
  };
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copiado.`);
    } catch {
      setMessage(
        `No fue posible copiar automáticamente. Seleccione este texto: ${value}`,
      );
    }
  };
  const shareText = `Hola, compañeros. Les comparto el enlace para entregar la Tarea ${assignment.number} de ${assignment.courseName}:\n\n${url}\n\nAl ingresar:\n1. Seleccionen su nombre.\n2. Confirmen su carné.\n3. Revisen sus ejercicios asignados.\n4. Suban un único archivo PDF legible.\n\nFecha límite: ${new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala" }).format(new Date(assignment.dueAt))}.\n\nPor favor, verifiquen el archivo antes de enviarlo.`;
  const applyReview = (
    submissionId: string,
    status: "APPROVED" | "NEEDS_CORRECTION" | "REJECTED",
    comment?: string,
  ) =>
    start(async () => {
      try {
        const result = await reviewSubmission({
          submissionId,
          status,
          comment,
        });
        setMessage(result.message);
        setReviewDialog(null);
        setReviewReason("");
        refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la entrega.",
        );
      }
    });
  return (
    <section className="panel portal-manager" data-tutorial="submission-portal">
      <div className="panel-head">
        <div>
          <h3>
            <Link2 /> Portal de entrega
          </h3>
          <p>
            Enlace público seguro para que cada estudiante confirme su identidad
            y entregue su archivo.
          </p>
        </div>
        <span className={`pill ${enabled ? "success" : "neutral"}`}>
          {enabled ? "Activo" : "Desactivado"}
        </span>
      </div>
      <div className="coverage-grid">
        {[
          ["Integrantes", eligible],
          ["Entregados", delivered],
          ["Pendientes", Math.max(0, eligible - delivered)],
          [
            "Tardíos",
            assignment.submissions.filter((item) => item.late).length,
          ],
          [
            "Corrección",
            assignment.submissions.filter(
              (item) => item.status === "NEEDS_CORRECTION",
            ).length,
          ],
          [
            "Aprobados",
            assignment.submissions.filter((item) => item.status === "APPROVED")
              .length,
          ],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="generator">
        <label>
          <span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />{" "}
            Portal activo
          </span>
        </label>
        <label>
          Apertura
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(event) => setOpensAt(event.target.value)}
          />
        </label>
        <label>
          Cierre
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
          />
        </label>
        <label>
          Tamaño máximo (MB)
          <input
            type="number"
            min="1"
            max="250"
            value={maxMb}
            onChange={(event) => setMaxMb(Number(event.target.value))}
          />
        </label>
        <label>
          Máximo de reemplazos
          <input
            type="number"
            min="0"
            max="20"
            value={maxReplacements}
            onChange={(event) => setMaxReplacements(Number(event.target.value))}
          />
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={late}
              onChange={(event) => setLate(event.target.checked)}
            />{" "}
            Aceptar tardías
          </span>
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={replacements}
              onChange={(event) => setReplacements(event.target.checked)}
            />{" "}
            Permitir reemplazos
          </span>
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={images}
              onChange={(event) => setImages(event.target.checked)}
            />{" "}
            Permitir imágenes
          </span>
        </label>
      </div>
      <label>
        Instrucciones
        <textarea
          rows={3}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <div className="title-actions">
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar y generar enlace"}
        </button>
        {portal && (
          <>
            <button className="outline" onClick={() => copy(url, "Enlace")}>
              <Copy /> Copiar enlace
            </button>
            <button
              className="outline"
              onClick={() => copy(shareText, "Mensaje")}
            >
              <Copy /> Copiar mensaje
            </button>
            <button
              className="outline"
              onClick={() =>
                navigator.share
                  ? navigator.share({
                      title: `${assignment.courseName} · Tarea ${assignment.number}`,
                      text: shareText,
                      url,
                    })
                  : copy(shareText, "Mensaje")
              }
            >
              <Share2 /> Compartir
            </button>
            <a className="outline" href={url} target="_blank">
              <ExternalLink /> Abrir portal
            </a>
            <button className="outline" disabled={busy} onClick={regenerate}>
              <RefreshCw /> Regenerar
            </button>
          </>
        )}
      </div>
      {url && <input aria-label="Enlace público" readOnly value={url} />}{" "}
      {portal?.tokenIssue && (
        <div className="notice warning">
          {portal.tokenIssue} Use “Regenerar” para crear un enlace válido.
        </div>
      )}
      {message && <div className="notice">{message}</div>}{" "}
      {assignment.submissions
        .filter((item) => item.origin === "PORTAL")
        .map((submission) => (
          <div className="portal-review" key={submission.id}>
            <span>
              <b>{submission.member.fullName}</b>
              <span
                className={`submission-status status-${submission.status.toLowerCase()}`}
              >
                {submissionStatusLabel(submission.status, submission.late)}
              </span>
              <small>
                {submissionVersionLabel(submission._count.versions)} ·{" "}
                {submissionOriginLabel(submission.origin)}
              </small>
              {submission.reviewComment && (
                <small>{submission.reviewComment}</small>
              )}
              {submission.dataIssue && (
                <small className="submission-data-issue" role="alert">
                  {submission.dataIssue}
                </small>
              )}
            </span>
            <div
              className="submission-review-actions"
              data-tutorial="submission-review"
            >
              <button
                className="review-approve"
                title="Marcar esta entrega como aprobada"
                disabled={busy}
                onClick={() => applyReview(submission.id, "APPROVED")}
              >
                <CheckCircle2 /> Aprobar
              </button>
              <button
                className="review-correct"
                title="Enviar observaciones y solicitar una nueva versión"
                disabled={busy}
                onClick={() => {
                  setReviewReason("");
                  setReviewDialog({
                    submissionId: submission.id,
                    status: "NEEDS_CORRECTION",
                    memberName: submission.member.fullName,
                  });
                }}
              >
                <MessageSquareWarning /> Solicitar corrección
              </button>
              <button
                className="review-reject"
                title="Rechazar esta entrega"
                disabled={busy}
                onClick={() => {
                  setReviewReason("");
                  setReviewDialog({
                    submissionId: submission.id,
                    status: "REJECTED",
                    memberName: submission.member.fullName,
                  });
                }}
              >
                <XCircle /> Rechazar
              </button>
            </div>
          </div>
        ))}
      {reviewDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy)
              setReviewDialog(null);
          }}
        >
          <section
            className={`review-modal ${reviewDialog.status === "REJECTED" ? "destructive" : "warning"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
          >
            <button
              className="modal-close"
              aria-label="Cerrar"
              disabled={busy}
              onClick={() => setReviewDialog(null)}
            >
              <XCircle />
            </button>
            <h2 id="review-dialog-title">
              {reviewDialog.status === "REJECTED"
                ? "Rechazar entrega"
                : "Solicitar corrección"}
            </h2>
            <p>
              {reviewDialog.status === "REJECTED"
                ? `Esta acción marcará la entrega de ${reviewDialog.memberName} como rechazada.`
                : `Indique a ${reviewDialog.memberName} qué debe corregir antes de enviar otra versión.`}
            </p>
            <label>
              Observaciones obligatorias
              <textarea
                autoFocus
                rows={5}
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                placeholder={
                  reviewDialog.status === "REJECTED"
                    ? "Explique claramente el motivo del rechazo…"
                    : "Describa los cambios que debe realizar…"
                }
              />
            </label>
            <div className="review-modal-actions">
              <button
                className="outline"
                disabled={busy}
                onClick={() => setReviewDialog(null)}
              >
                Cancelar
              </button>
              <button
                className={
                  reviewDialog.status === "REJECTED"
                    ? "review-reject"
                    : "review-correct"
                }
                disabled={busy || reviewReason.trim().length < 3}
                onClick={() =>
                  applyReview(
                    reviewDialog.submissionId,
                    reviewDialog.status,
                    reviewReason,
                  )
                }
              >
                {busy
                  ? "Procesando…"
                  : reviewDialog.status === "REJECTED"
                    ? "Confirmar rechazo"
                    : "Enviar solicitud de corrección"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
