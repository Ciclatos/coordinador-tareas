export const tutorialKeys = [
  "general",
  "courses",
  "members",
  "assignments",
  "distribution",
  "submission_portal",
  "submissions",
  "evaluations",
  "report",
  "pdf_builder",
] as const;
export type TutorialKey = (typeof tutorialKeys)[number];
export type TutorialStepDefinition = {
  title: string;
  description: string;
  target?: string;
  side?: "top" | "right" | "bottom" | "left";
};
export type TutorialDefinition = {
  key: TutorialKey;
  version: number;
  title: string;
  view?: string;
  steps: TutorialStepDefinition[];
};

const nav = (key: string) => `[data-tutorial="nav-${key}"]`;
export const tutorialDefinitions: Record<TutorialKey, TutorialDefinition> = {
  general: {
    key: "general",
    version: 1,
    title: "Primeros pasos",
    steps: [
      {
        title: "Bienvenido a Coordinador de Tareas",
        description:
          "Esta aplicación te ayuda a distribuir ejercicios, recibir entregas, evaluar al grupo y generar el PDF final.",
      },
      {
        title: "Navegación principal",
        description:
          "Desde aquí puedes acceder a tus cursos, tareas, entregas y configuración.",
        target: "[data-tutorial=main-navigation]",
        side: "right",
      },
      {
        title: "Cursos",
        description:
          "Primero crea un curso y registra los datos del docente, grupo e institución.",
        target: nav("courses"),
        side: "right",
      },
      {
        title: "Integrantes",
        description:
          "Agrega a los integrantes y sus carnés. Esta información se reutiliza en las tareas y el portal.",
        target: nav("members"),
        side: "right",
      },
      {
        title: "Tareas",
        description:
          "Crea una tarea, añade secciones y define los ejercicios de cada una.",
        target: nav("assignments"),
        side: "right",
      },
      {
        title: "Distribución",
        description:
          "La aplicación distribuye los ejercicios de forma equilibrada y conserva el historial de carga.",
        target: nav("distribution"),
        side: "right",
      },
      {
        title: "Portal de entrega",
        description:
          "Genera un enlace para que cada integrante confirme su identidad y suba directamente su PDF.",
        target: nav("submissions"),
        side: "right",
      },
      {
        title: "Evaluación y reporte",
        description:
          "Revisa las entregas, asigna notas y genera automáticamente el reporte semanal.",
        target: nav("evaluations"),
        side: "right",
      },
      {
        title: "PDF final",
        description:
          "Organiza las páginas y genera un único PDF listo para entregar.",
        target: nav("pdf_builder"),
        side: "right",
      },
      {
        title: "Todo listo",
        description:
          "Cada sección tiene su propio tutorial. Puedes volver a verlos en cualquier momento desde Ayuda y tutoriales.",
      },
    ],
  },
  courses: {
    key: "courses",
    version: 1,
    title: "Cursos",
    view: "Cursos",
    steps: [
      {
        title: "Tus cursos",
        description:
          "Crea y administra cursos, datos institucionales, docente, grupo y carátula.",
        target: nav("courses"),
      },
      {
        title: "Crear curso",
        description:
          "Usa Nuevo curso para comenzar. También puedes editar, archivar o reactivar los existentes.",
        target: "[data-tutorial=create-course]",
      },
    ],
  },
  members: {
    key: "members",
    version: 1,
    title: "Integrantes",
    view: "Integrantes",
    steps: [
      {
        title: "Integrantes y carnés",
        description:
          "Agrega personas, ordena la lista, importa CSV, copia desde otro curso y desactiva temporalmente.",
        target: nav("members"),
      },
      {
        title: "Agregar integrante",
        description:
          "El carné se reutiliza para verificar al estudiante en el portal público.",
        target: "[data-tutorial=create-member]",
      },
    ],
  },
  assignments: {
    key: "assignments",
    version: 1,
    title: "Tareas",
    view: "Tareas",
    steps: [
      {
        title: "Crear tareas",
        description:
          "Define datos generales, semana, fecha límite y secciones independientes.",
        target: nav("assignments"),
      },
      {
        title: "Nueva tarea",
        description:
          "Crea la tarea y después configura sus ejercicios en Distribución.",
        target: "[data-tutorial=create-assignment]",
      },
    ],
  },
  distribution: {
    key: "distribution",
    version: 1,
    title: "Distribución",
    view: "Distribución",
    steps: [
      {
        title: "Configurar secciones",
        description:
          "Cada sección conserva su regla, rango, peso y observaciones.",
        target: "[data-tutorial=section-editor]",
      },
      {
        title: "Distribuir y exportar",
        description:
          "Elige un modo, bloquea o mueve asignaciones y exporta un resumen legible para WhatsApp.",
        target: nav("distribution"),
      },
    ],
  },
  submission_portal: {
    key: "submission_portal",
    version: 1,
    title: "Portal de entrega",
    view: "Entregas",
    steps: [
      {
        title: "Activar el portal",
        description:
          "Configura apertura, cierre, tardías, reemplazos y formatos.",
        target: "[data-tutorial=submission-portal]",
      },
      {
        title: "Compartir o revocar",
        description:
          "Copia el enlace o mensaje; al regenerarlo, el anterior deja de funcionar.",
      },
    ],
  },
  submissions: {
    key: "submissions",
    version: 1,
    title: "Entregas",
    view: "Entregas",
    steps: [
      {
        title: "Revisar entregas",
        description:
          "Consulta estado, versión, archivos, miniaturas e historial.",
        target: nav("submissions"),
      },
      {
        title: "Acciones de revisión",
        description:
          "Aprueba, solicita una corrección con observaciones o rechaza indicando el motivo.",
        target: "[data-tutorial=submission-review]",
      },
    ],
  },
  evaluations: {
    key: "evaluations",
    version: 1,
    title: "Evaluación",
    view: "Evaluación",
    steps: [
      {
        title: "Evaluar al grupo",
        description:
          "Configura criterios, aplica puntuación rápida, comentarios y guarda los totales.",
        target: nav("evaluations"),
      },
    ],
  },
  report: {
    key: "report",
    version: 1,
    title: "Reporte",
    view: "PDF final",
    steps: [
      {
        title: "Reporte semanal",
        description:
          "Revisa el texto determinista, edítalo y guárdalo antes de construir el documento.",
        target: "[data-tutorial=weekly-report]",
      },
    ],
  },
  pdf_builder: {
    key: "pdf_builder",
    version: 1,
    title: "PDF final",
    view: "PDF final",
    steps: [
      {
        title: "Constructor PDF",
        description:
          "Ordena archivos, selecciona páginas, rota, previsualiza y elige compresión.",
        target: nav("pdf_builder"),
      },
      {
        title: "Generar y descargar",
        description:
          "El documento final conserva el orden configurado y se guarda como una nueva versión.",
        target: "[data-tutorial=generate-pdf]",
      },
    ],
  },
};

export const viewTutorialKey: Record<string, TutorialKey> = {
  Cursos: "courses",
  Integrantes: "members",
  Tareas: "assignments",
  Distribución: "distribution",
  Entregas: "submissions",
  Evaluación: "evaluations",
  "PDF final": "pdf_builder",
};
