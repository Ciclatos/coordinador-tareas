"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { publicUploadError } from "@/lib/storage-errors";
import { withNetworkRetry } from "@/lib/network-retry";
import { CheckCircle2, FileText, ShieldCheck, UploadCloud } from "lucide-react";
import { submissionPath } from "@/lib/submission-path";

type Summary = {
  state: string;
  university: string | null;
  course: string;
  assignment: string;
  topic: string | null;
  sections: string[];
  dueAt: string;
  instructions: string | null;
  allowedMimeTypes: string[];
  maxFileSize: number;
  allowLateSubmissions: boolean;
  allowReplacements: boolean;
  members: { reference: string; name: string; alias: string }[];
};
type Details = {
  memberName: string;
  course: string;
  assignment: string;
  dueAt: string;
  sections: { name: string; exercises: { label: string; weight: number }[] }[];
  total: number;
  totalWeight: number;
  previous: null | {
    status: string;
    firstReceivedAt: string | null;
    lastReceivedAt: string | null;
    version: number;
    reviewComment: string | null;
  };
  mayReplace: boolean;
};
type Receipt = {
  receiptCode: string;
  version: number;
  fileName: string;
  pageCount: number | null;
  late: boolean;
  receivedAt?: string;
};

const stateLabels: Record<string, string> = {
  UPCOMING: "Próximamente",
  OPEN: "Abierta",
  DUE_SOON: "Vence pronto",
  CLOSED: "Cerrada",
  LATE_ALLOWED: "Se aceptan entregas tardías",
  DISABLED: "Portal desactivado",
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-GT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(new Date(value));

export default function PublicSubmissionPortal({
  token,
  summary,
  invalid = false,
}: {
  token: string;
  summary?: Summary;
  invalid?: boolean;
}) {
  const [reference, setReference] = useState("");
  const [carnet, setCarnet] = useState("");
  const [csrf, setCsrf] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);
  if (invalid || !summary)
    return (
      <main className="public-portal">
        <section className="public-card public-error">
          <ShieldCheck />
          <h1>Enlace inválido</h1>
          <p>
            Este enlace no existe o fue revocado. Solicite al coordinador el
            enlace vigente.
          </p>
        </section>
      </main>
    );
  const active = ["OPEN", "DUE_SOON", "LATE_ALLOWED"].includes(summary.state);
  const identify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/public-submissions/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, memberReference: reference, carnet }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCsrf(result.csrf);
      setDetails(result.details);
      setCarnet("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible verificar los datos.",
      );
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!file || !details || !confirmed || busy) return;
    if (
      !summary.allowedMimeTypes.includes(file.type) ||
      file.size > summary.maxFileSize
    ) {
      setMessage("El archivo no cumple con el formato o tamaño permitido.");
      return;
    }
    setBusy(true);
    setMessage("");
    setProgress(0);
    const uploadId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const expectedPathname = submissionPath("public", uploadId, file.name);
    try {
      let uploadedPathname = expectedPathname;
      try {
        const blob = await withNetworkRetry(() => upload(
          expectedPathname,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/public-submissions/upload",
            clientPayload: JSON.stringify({
              csrf,
              uploadId,
              originalName: file.name,
            }),
            contentType: file.type,
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: ({ percentage }) =>
              setProgress(Math.round(percentage)),
          },
        ));
        uploadedPathname = blob.pathname;
      } catch {
        // La respuesta del SDK puede perderse después de que Blob haya
        // almacenado el archivo. La confirmación valida su existencia, MIME,
        // tamaño y contenido antes de registrar la entrega.
      }
      const response = await fetch("/api/public-submissions/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          csrf,
          idempotencyKey,
          uploadId,
          pathname: uploadedPathname,
          originalName: file.name,
          confirmed: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReceipt(result);
      setFile(null);
      setProgress(100);
    } catch (error) {
      setMessage(publicUploadError(error, "No se pudo enviar la entrega. Inténtelo nuevamente."));
    } finally {
      setBusy(false);
    }
  };
  if (receipt)
    return (
      <main className="public-portal">
        <section className="public-card receipt">
          <CheckCircle2 />
          <p className="eyebrow">Comprobante de entrega</p>
          <h1>Entrega recibida correctamente</h1>
          <h2>{details?.memberName}</h2>
          <dl>
            <div>
              <dt>Curso y tarea</dt>
              <dd>
                {details?.course} · {details?.assignment}
              </dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{receipt.late ? "Tardía" : "Puntual"}</dd>
            </div>
            <div>
              <dt>Versión</dt>
              <dd>{receipt.version}</dd>
            </div>
            <div>
              <dt>Archivo</dt>
              <dd>
                {receipt.fileName} · {receipt.pageCount ?? "—"} página(s)
              </dd>
            </div>
            <div>
              <dt>Comprobante</dt>
              <dd>
                <code>{receipt.receiptCode}</code>
              </dd>
            </div>
          </dl>
          <button
            className="public-primary"
            onClick={() => navigator.clipboard?.writeText(receipt.receiptCode)}
          >
            Copiar comprobante
          </button>
          <p>
            Conserve este código como referencia. No permite acceder al archivo.
          </p>
        </section>
      </main>
    );
  return (
    <main className="public-portal">
      <section className="public-card public-header">
        <p className="eyebrow">{summary.university || "Portal académico"}</p>
        <h1>{summary.course}</h1>
        <h2>{summary.assignment}</h2>
        {summary.topic && <p>{summary.topic}</p>}
        <span className={`public-state state-${summary.state.toLowerCase()}`}>
          {stateLabels[summary.state]}
        </span>
        <div className="public-meta">
          <p>
            <b>Secciones:</b> {summary.sections.join(", ")}
          </p>
          <p>
            <b>Fecha límite:</b> {formatDate(summary.dueAt)}
          </p>
          <p>
            <b>Formato:</b>{" "}
            {summary.allowedMimeTypes.includes("application/pdf") ? "PDF" : ""}
            {summary.allowedMimeTypes.length > 1 ? " e imágenes" : ""} · máximo{" "}
            {Math.round(summary.maxFileSize / 1024 / 1024)} MB
          </p>
          <p>
            <b>Reemplazos:</b>{" "}
            {summary.allowReplacements ? "permitidos" : "no permitidos"}
          </p>
        </div>
        {summary.instructions && (
          <aside>
            <b>Instrucciones</b>
            <p>{summary.instructions}</p>
          </aside>
        )}
      </section>
      {!details ? (
        <section className="public-card">
          <p className="eyebrow">Confirmación de identidad</p>
          <h2>Seleccione su nombre</h2>
          {!active && (
            <div className="public-alert">
              El portal no está disponible para recibir entregas en este
              momento.
            </div>
          )}
          <form onSubmit={identify}>
            <label>
              Integrante
              <select
                required
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={!active}
              >
                <option value="">Seleccione su nombre…</option>
                {summary.members.map((member) => (
                  <option key={member.reference} value={member.reference}>
                    {member.name}
                    {member.alias && member.alias !== member.name
                      ? ` (${member.alias})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ingrese su carné para confirmar su identidad
              <input
                required
                autoComplete="off"
                value={carnet}
                onChange={(event) => setCarnet(event.target.value)}
                disabled={!active}
              />
            </label>
            <button className="public-primary" disabled={!active || busy}>
              {busy ? "Verificando…" : "Ver mi asignación"}
            </button>
          </form>
          {message && (
            <div role="alert" className="public-alert">
              {message}
            </div>
          )}
          <p className="public-privacy">
            <ShieldCheck /> La verificación se realiza de forma segura. Los
            carnés no se muestran públicamente.
          </p>
        </section>
      ) : (
        <>
          <section className="public-card">
            <p className="eyebrow">Asignación confirmada</p>
            <h2>{details.memberName}</h2>
            {details.sections.map((section) => (
              <div className="assignment-block" key={section.name}>
                <b>Sección {section.name}</b>
                <p>
                  {section.exercises
                    .map((exercise) => exercise.label)
                    .join(", ")}
                </p>
              </div>
            ))}
            <p>
              <b>Total:</b> {details.total} ejercicios
              {details.totalWeight ? ` · peso ${details.totalWeight}` : ""}
            </p>
            {details.previous && (
              <aside>
                <b>
                  Entrega anterior: versión {details.previous.version} ·{" "}
                  {details.previous.status}
                </b>
                {details.previous.reviewComment && (
                  <p>
                    <strong>Comentario del coordinador:</strong>{" "}
                    {details.previous.reviewComment}
                  </p>
                )}
              </aside>
            )}
          </section>
          {details.mayReplace ? (
            <section className="public-card">
              <p className="eyebrow">Archivo privado</p>
              <h2>
                {details.previous ? "Subir nueva versión" : "Subir entrega"}
              </h2>
              <label className="public-drop">
                <UploadCloud />
                <b>{file ? file.name : "Seleccione o arrastre su archivo"}</b>
                <span>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type}`
                    : "PDF o formatos habilitados por el coordinador"}
                </span>
                <input
                  type="file"
                  accept={summary.allowedMimeTypes.join(",")}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setConfirmed(false);
                  }}
                />
              </label>
              {file && (
                <>
                  <div className="file-confirm">
                    <FileText />
                    <span>
                      <b>{file.name}</b>
                      <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                    </span>
                    <button onClick={() => setFile(null)}>Eliminar</button>
                  </div>
                  <label className="public-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />{" "}
                    Confirmo que el archivo corresponde a mi entrega y contiene
                    los ejercicios que me fueron asignados.
                  </label>
                  <button
                    className="public-primary"
                    disabled={!confirmed || busy}
                    onClick={send}
                  >
                    {busy ? `Subiendo… ${progress}%` : "Enviar entrega"}
                  </button>
                </>
              )}
              {message && (
                <div role="alert" className="public-alert">
                  {message}
                </div>
              )}
            </section>
          ) : (
            <section className="public-card">
              <h2>Entrega recibida</h2>
              <p>
                Los reemplazos están deshabilitados o ya se alcanzó el máximo
                permitido.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
