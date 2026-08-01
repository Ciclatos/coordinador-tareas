"use client";

import { useEffect, useState } from "react";

export function PdfPageThumbnails({
  url,
  name,
  selectedPages,
  onChange,
}: {
  url: string;
  name: string;
  selectedPages?: number[];
  onChange: (pages: number[]) => void;
}) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [message, setMessage] = useState("Cargando miniaturas…");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo leer el PDF privado.");
        const document = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
        if (document.numPages > 100)
          throw new Error("La vista previa admite hasta 100 páginas por archivo.");
        const rendered: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.24 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("No se pudo crear la miniatura.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          rendered.push(canvas.toDataURL("image/jpeg", 0.72));
          page.cleanup();
        }
        await document.destroy();
        if (!cancelled) {
          setThumbnails(rendered);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled)
          setMessage(error instanceof Error ? error.message : "No se pudo mostrar el PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (message) return <small className="thumbnail-message">{message}</small>;
  const selected = selectedPages ?? thumbnails.map((_, index) => index);
  return (
    <div className="pdf-thumbnails" aria-label={`Páginas de ${name}`}>
      {thumbnails.map((source, index) => {
        const active = selected.includes(index);
        return (
          <button
            type="button"
            key={index}
            className={active ? "selected" : ""}
            disabled={active && selected.length === 1}
            aria-pressed={active}
            aria-label={`${active ? "Excluir" : "Incluir"} página ${index + 1} de ${name}`}
            onClick={() =>
              !(active && selected.length === 1) &&
              onChange(
                active
                  ? selected.filter((page) => page !== index)
                  : [...selected, index].sort((left, right) => left - right),
              )
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source} alt="" />
            <span>{index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
