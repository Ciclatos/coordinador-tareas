"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CircleHelp, RotateCcw, X } from "lucide-react";
import { driver, type Driver } from "driver.js";
import {
  resetAllTutorials,
  updateTutorialProgress,
} from "@/app/app/tutorial-actions";
import {
  shouldAutoStartTutorial,
  tutorialStatusLabel,
  type TutorialProgressDto,
} from "@/lib/tutorial-progress";
import {
  tutorialDefinitions,
  tutorialKeys,
  viewTutorialKey,
  type TutorialKey,
} from "@/tutorials/tutorialDefinitions";

export default function TutorialSystem({
  eligible,
  initialProgress,
  view,
  go,
}: {
  eligible: boolean;
  initialProgress: TutorialProgressDto[];
  view: string;
  go: (view: string) => void;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeKey, setActiveKey] = useState<TutorialKey | null>(null);
  const [generalFinishedThisSession, setGeneralFinishedThisSession] =
    useState(false);
  const [, startTransition] = useTransition();
  const driverRef = useRef<Driver | null>(null);
  const persistQueue = useRef<Promise<unknown>>(Promise.resolve());
  const autoAttempted = useRef(new Set<TutorialKey>());
  const pendingContext = useRef(new Set<TutorialKey>());
  const currentView = useRef(view);
  const progressByKey = useMemo(
    () => new Map(progress.map((item) => [item.tutorialKey, item])),
    [progress],
  );

  const persist = useCallback(
    (
      key: TutorialKey,
      action: "START" | "STEP" | "COMPLETE" | "SKIP",
      currentStep?: number,
      replay = false,
    ) => {
      const definition = tutorialDefinitions[key];
      setProgress((current) => {
        const old = current.find((item) => item.tutorialKey === key);
        const preserve = replay && old?.status === "COMPLETED";
        const next: TutorialProgressDto = {
          tutorialKey: key,
          tutorialVersion: definition.version,
          currentStep: action === "STEP" ? (currentStep ?? 0) : null,
          status: preserve
            ? "COMPLETED"
            : action === "COMPLETE"
              ? "COMPLETED"
              : action === "SKIP"
                ? "SKIPPED"
                : "IN_PROGRESS",
        };
        return [...current.filter((item) => item.tutorialKey !== key), next];
      });
      const task = persistQueue.current.then(() =>
        updateTutorialProgress({ key, action, currentStep, replay }),
      );
      persistQueue.current = task.catch(() => undefined);
      startTransition(() => {
        void task;
      });
      return task;
    },
    [],
  );

  const startTutorial = useCallback(
    (key: TutorialKey, replay = false) => {
      const definition = tutorialDefinitions[key];
      setHelpOpen(false);
      setActiveKey(key);
      if (definition.view && definition.view !== view) go(definition.view);
      persist(key, "START", undefined, replay);
      window.setTimeout(
        () => {
          let completed = false;
          const finish = async (action: "COMPLETE" | "SKIP") => {
            if (completed) return;
            completed = true;
            await persist(key, action, undefined, replay);
            if (key === "general") setGeneralFinishedThisSession(true);
            setActiveKey(null);
            driverRef.current?.destroy();
            driverRef.current = null;
          };
          const instance = driver({
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
            allowKeyboardControl: true,
            allowClose: true,
            overlayOpacity: 0.58,
            stageRadius: 10,
            stagePadding: 8,
            showProgress: true,
            progressText: "Paso {{current}} de {{total}}",
            nextBtnText: "Siguiente",
            prevBtnText: "Anterior",
            doneBtnText:
              key === "general" ? "Comenzar a usar la aplicación" : "Finalizar",
            skipMissingElement: true,
            waitForElement: 800,
            popoverClass: "coordinador-tutorial",
            onNextClick: (_element, _step, { driver: current }) => {
              const index = current.getActiveIndex() ?? 0;
              if (current.isLastStep()) void finish("COMPLETE");
              else {
                persist(key, "STEP", index + 1, replay);
                current.moveNext();
              }
            },
            onPrevClick: (_element, _step, { driver: current }) =>
              current.movePrevious(),
            onCloseClick: () => {
              void finish("SKIP");
            },
            onDoneClick: () => {
              void finish("COMPLETE");
            },
            onDestroyed: () => {
              if (!completed) {
                completed = true;
                persist(key, "SKIP", undefined, replay);
                if (key === "general") setGeneralFinishedThisSession(true);
                setActiveKey(null);
                driverRef.current = null;
              }
            },
            onPopoverRender: (popover) => {
              popover.closeButton.setAttribute("aria-label", "Cerrar tutorial");
              if (!popover.footer.querySelector(".tutorial-skip-button")) {
                const skip = document.createElement("button");
                skip.type = "button";
                skip.className = "tutorial-skip-button";
                skip.textContent = "Omitir tutorial";
                skip.addEventListener("click", () => {
                  void finish("SKIP");
                });
                popover.footer.insertBefore(skip, popover.footerButtons);
              }
            },
            steps: definition.steps.map((step) => ({
              element: step.target,
              skipMissingElement: true,
              popover: {
                title: step.title,
                description: step.description,
                side: step.side,
                align: "center",
              },
            })),
          });
          driverRef.current = instance;
          instance.drive(progressByKey.get(key)?.currentStep ?? 0);
        },
        definition.view && definition.view !== view ? 650 : 250,
      );
    },
    [go, persist, progressByKey, view],
  );

  useEffect(() => () => driverRef.current?.destroy(), []);
  useEffect(() => {
    currentView.current = view;
  }, [view]);
  useEffect(() => {
    const key: TutorialKey = "general";
    if (autoAttempted.current.has(key)) return;
    const stored = progressByKey.get(key);
    if (
      shouldAutoStartTutorial({
        key,
        eligible,
        progress: stored,
        generalProgress: stored,
        generalActive: Boolean(activeKey),
        generalFinishedThisSession,
      })
    ) {
      autoAttempted.current.add(key);
      const timer = window.setTimeout(() => startTutorial(key), 800);
      return () => window.clearTimeout(timer);
    }
  }, [
    activeKey,
    eligible,
    generalFinishedThisSession,
    progressByKey,
    startTutorial,
  ]);
  useEffect(() => {
    const key = viewTutorialKey[view];
    if (!key || helpOpen || pendingContext.current.has(key)) return;
    if (
      shouldAutoStartTutorial({
        key,
        eligible,
        progress: progressByKey.get(key),
        generalProgress: progressByKey.get("general"),
        generalActive: Boolean(activeKey),
        generalFinishedThisSession,
      })
    ) {
      pendingContext.current.add(key);
      window.setTimeout(() => {
        pendingContext.current.delete(key);
        if (viewTutorialKey[currentView.current] === key) startTutorial(key);
      }, 700);
    }
  }, [
    activeKey,
    eligible,
    generalFinishedThisSession,
    helpOpen,
    progressByKey,
    startTutorial,
    view,
  ]);

  const contextualKey = viewTutorialKey[view] ?? "general";
  const resetOne = (key: TutorialKey) =>
    startTransition(async () => {
      await updateTutorialProgress({ key, action: "RESET" });
      setProgress((current) =>
        current.filter((item) => item.tutorialKey !== key),
      );
      autoAttempted.current.delete(key);
      pendingContext.current.delete(key);
    });
  return (
    <>
      {!eligible && !progressByKey.get("general") && (
        <button
          className="tutorial-invitation"
          onClick={() => startTutorial("general", true)}
        >
          <CircleHelp /> Conoce las funciones principales
        </button>
      )}
      <div className="tutorial-global-actions">
        <button
          className="outline tutorial-context-button"
          title="Ver tutorial de esta sección"
          onClick={() => startTutorial(contextualKey, true)}
        >
          <CircleHelp /> Ver tutorial
        </button>
        <button
          className="outline"
          data-tutorial="help-center"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp /> Ayuda y tutoriales
        </button>
      </div>
      {helpOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <section
            className="help-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="modal-close"
              aria-label="Cerrar ayuda"
              onClick={() => setHelpOpen(false)}
            >
              <X />
            </button>
            <h2 id="help-title">Ayuda y tutoriales</h2>
            <p>
              Consulta un recorrido cuando lo necesites. Tu progreso se
              sincroniza entre dispositivos.
            </p>
            <div className="tutorial-list">
              {tutorialKeys.map((key) => {
                const item = progressByKey.get(key);
                return (
                  <article key={key}>
                    <span>
                      <b>{tutorialDefinitions[key].title}</b>
                      <small>
                        {tutorialStatusLabel(item?.status)}
                        {item &&
                        item.tutorialVersion < tutorialDefinitions[key].version
                          ? " · Tutorial actualizado"
                          : ""}
                      </small>
                    </span>
                    <div className="tutorial-row-actions">
                      <button
                        className="outline"
                        onClick={() => startTutorial(key, true)}
                      >
                        {item?.status === "COMPLETED"
                          ? "Volver a ver"
                          : item?.status === "IN_PROGRESS"
                            ? "Continuar"
                            : "Ver tutorial"}
                      </button>
                      {item && (
                        <button
                          className="outline"
                          aria-label={`Reiniciar ${tutorialDefinitions[key].title}`}
                          onClick={() => resetOne(key)}
                        >
                          <RotateCcw />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <button
              className="outline reset-tutorials"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw /> Reiniciar todos los tutoriales
            </button>
          </section>
        </div>
      )}
      {confirmReset && (
        <div className="modal-backdrop">
          <section
            className="review-modal destructive"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">¿Reiniciar todos los tutoriales?</h2>
            <p>
              Se eliminará el progreso guardado y volverán a mostrarse al entrar
              en cada módulo.
            </p>
            <div className="review-modal-actions">
              <button
                className="outline"
                onClick={() => setConfirmReset(false)}
              >
                Cancelar
              </button>
              <button
                className="review-reject"
                onClick={() =>
                  startTransition(async () => {
                    await resetAllTutorials();
                    setProgress([]);
                    autoAttempted.current.clear();
                    setConfirmReset(false);
                    setHelpOpen(false);
                  })
                }
              >
                Confirmar reinicio
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
