"use client";

import { useState, useTransition } from "react";
import { Database, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import {
  loadStorageSnapshot,
  runStorageCleanup,
} from "@/app/app/storage-actions";
import type { StorageSnapshot } from "@/lib/storage-management";
import { storageLevel } from "@/lib/storage-policy";

const MIB = 1024 * 1024;
const format = (bytes: number) =>
  bytes >= 1024 * MIB
    ? `${(bytes / 1024 / MIB).toFixed(2)} GB`
    : `${(bytes / MIB).toFixed(2)} MB`;

export default function StoragePanel() {
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const load = () =>
    startTransition(async () => {
      setMessage("");
      try {
        const result = await loadStorageSnapshot();
        setSnapshot(result.snapshot);
        setCanManage(result.canManage);
      } catch {
        setMessage("No fue posible consultar el almacenamiento.");
      }
    });
  const cleanup = (scope: "orphans" | "qa") =>
    startTransition(async () => {
      const result = await runStorageCleanup({ scope, confirmation });
      setMessage(result.message);
      if (result.ok) {
        setConfirmation("");
        const refreshed = await loadStorageSnapshot();
        setSnapshot(refreshed.snapshot);
        setCanManage(refreshed.canManage);
      }
    });
  const level = storageLevel(snapshot?.percentUsed ?? 0);
  const orphan = snapshot?.categories.find((item) => item.key === "orphans");
  return (
    <section className={`panel storage-panel ${level}`}>
      <div className="storage-heading">
        <div>
          <p className="eyebrow">Control de capacidad</p>
          <h3><Database size={20} /> Almacenamiento</h3>
          <p>Inventario privado de Vercel Blob cruzado con las referencias vigentes.</p>
        </div>
        <button className="outline" onClick={load} disabled={pending}>
          <RefreshCw size={16} /> {snapshot ? "Actualizar" : "Consultar uso"}
        </button>
      </div>
      {snapshot && (
        <>
          <div className="storage-usage" aria-label={`${snapshot.percentUsed.toFixed(1)} por ciento utilizado`}>
            <span style={{ width: `${snapshot.percentUsed}%` }} />
          </div>
          <div className="storage-total">
            <strong>{format(snapshot.totalBytes)} / {format(snapshot.limitBytes)}</strong>
            <span>{snapshot.percentUsed.toFixed(1)} % · {snapshot.blobCount} archivos · {snapshot.submissionCount} entregas</span>
          </div>
          <div className="storage-categories">
            {snapshot.categories.map((category) => (
              <article key={category.key}>
                <span>{category.label}</span>
                <strong>{format(category.bytes)}</strong>
                <small>{category.count} archivo(s)</small>
              </article>
            ))}
          </div>
          <div className="storage-consolidation-metrics">
            <article><span>Entregas activas</span><strong>{snapshot.activeSubmissionFiles}</strong></article>
            <article><span>Entregas consolidadas</span><strong>{snapshot.consolidatedSubmissionFiles}</strong></article>
            <article><span>Archivos eliminables</span><strong>{format(snapshot.reclaimableSubmissionBytes)}</strong></article>
            <article><span>PDF finales</span><strong>{format(snapshot.finalPdfBytes)}</strong></article>
            <article><span>Ahorro por consolidación</span><strong>{format(snapshot.consolidationSavingsBytes)}</strong></article>
          </div>
          <p className="storage-note">
            <ShieldAlert size={16} /> Se detectaron {snapshot.duplicateGroups} grupos duplicados
            ({format(snapshot.duplicateBytes)} en copias) y {snapshot.missingReferenceCount} referencias sin blob.
            Las copias no se eliminan automáticamente porque algunas pueden representar versiones válidas.
          </p>
          <div className="storage-cleanup">
            <h4>Limpieza segura</h4>
            <p>Solo se consideran blobs sin referencia en PostgreSQL y con más de 24 horas. Las entregas vigentes nunca entran en estas acciones.</p>
            {!canManage && <p className="notice">Las métricas son informativas. Solo el administrador principal puede ejecutar limpiezas globales.</p>}
            <label>
              Escriba <b>LIMPIAR ALMACENAMIENTO</b> para confirmar
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <div className="storage-actions">
              <button
                className="outline"
                disabled={!canManage || pending || confirmation !== "LIMPIAR ALMACENAMIENTO" || !snapshot.reclaimableQaCount}
                onClick={() => cleanup("qa")}
              >
                <Trash2 size={16} /> Limpiar QA sin referencia ({format(snapshot.reclaimableQaBytes)})
              </button>
              <button
                className="danger"
                disabled={!canManage || pending || confirmation !== "LIMPIAR ALMACENAMIENTO" || !orphan?.count}
                onClick={() => cleanup("orphans")}
              >
                <Trash2 size={16} /> Limpiar huérfanos ({format(orphan?.bytes ?? 0)})
              </button>
            </div>
          </div>
        </>
      )}
      {message && <p className="storage-message" role="status">{message}</p>}
    </section>
  );
}
