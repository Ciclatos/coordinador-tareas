# Coordinador de Tareas

Aplicación web en español para coordinar tareas grupales universitarias: define secciones y ejercicios, distribuye la carga considerando el historial, recibe archivos, registra evaluaciones y compila un PDF final tamaño carta.

## Enlaces

- Producción: [coordinador-tareas.vercel.app](https://coordinador-tareas.vercel.app)
- Repositorio: [github.com/Ciclatos/coordinador-tareas](https://github.com/Ciclatos/coordinador-tareas)

## Funcionalidad

- Dashboard responsive con progreso y estados de la tarea.
- Cursos, integrantes, tareas semanales y configuración localizada para Guatemala.
- Generador de rangos, pares, impares, múltiplos y listas alfanuméricas.
- Identidad de ejercicio compuesta por sección y etiqueta, de modo que `5.3:5` y `5.4:5` son diferentes.
- Distribución híbrida determinista: considera saldo histórico, rotación por sección, pesos, exclusiones y asignaciones bloqueadas.
- Matriz editable para mover ejercicios entre integrantes.
- Carga local de PDF, JPG y PNG; las imágenes conservan proporción al ajustarse a carta.
- Evaluación rápida con cinco criterios de 20 puntos.
- Reporte determinista en español, sin depender de una API de IA.
- PDF final mediante `pdf-lib`: portada, desempeño, carátula, integrantes, entregas y numeración de páginas.
- Esquema PostgreSQL normalizado para persistencia multiusuario futura.

## Arquitectura

La interfaz usa Next.js App Router y TypeScript estricto. `src/lib/domain.ts` contiene reglas puras y testeables; `src/lib/pdf.ts` compone el documento íntegramente en el navegador para evitar límites de memoria de funciones serverless; `src/components/AppShell.tsx` implementa el flujo demostrable. `prisma/schema.prisma` define el modelo relacional y aislamiento por propietario previsto para la conexión productiva.

## Desarrollo local

Requisitos: Node.js 20.9 o posterior y npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre `http://localhost:3000`. La demostración usa únicamente nombres ficticios y funciona sin credenciales externas.

## Base de datos y almacenamiento

1. Crea PostgreSQL en Supabase o Neon.
2. Copia `.env.example` a `.env.local` y completa `DATABASE_URL` y `DIRECT_URL`.
3. Para almacenamiento privado, crea un bucket no público y configura las variables de Supabase.
4. Aplica el esquema con Prisma después de instalar/generar el cliente del entorno elegido.

Los archivos estudiantiles deben almacenarse con claves opacas y servirse mediante URLs firmadas. Nunca uses el bucket como público.

## Referencia visual y PDF

Los documentos originales se mantienen fuera de Git mediante `references/*`. Consulta [references/README.md](references/README.md) para los nombres admitidos. Para renderizar la referencia página por página:

```bash
mkdir -p tmp/pdfs
pdftoppm -png references/tarea-semana-5-ejemplo.pdf tmp/pdfs/referencia
```

El PDF final sigue el orden: portada del reporte, desempeño y evaluación, carátula, integrantes, desarrollo y anexos.

## Calidad

```bash
npm run lint
npm test
npm run build
# o todo junto
npm run check
```

Las pruebas cubren reglas de ejercicios, reinicio por sección, números repetidos entre secciones, distribución determinista, historial, exclusiones, bloqueos, pesos, notas y reporte.

## Despliegue

Con una sesión de Vercel autenticada:

```bash
npx vercel --prod
```

Configura en Vercel las mismas variables de `.env.local`; nunca publiques la clave de servicio de Supabase en el navegador.

## Privacidad

- Los PDFs originales, carnés reales, `.env*`, `tmp/` y `output/` están ignorados.
- Los datos demo son ficticios.
- No se registran contenidos de entregas en logs.
- Valida MIME real, tamaño, autorización y pertenencia al usuario antes de activar almacenamiento remoto.

## Limitaciones conocidas

Esta primera versión desplegable conserva el estado en la sesión del navegador y genera el PDF en el cliente. El esquema PostgreSQL está definido, pero la autenticación, persistencia remota, URLs firmadas, historial de versiones, miniaturas PDF.js, recorte/rotación visual y políticas RLS requieren conectar un proyecto Supabase/Neon con credenciales de producción. La UI señala estos flujos sin enviar datos personales a servicios externos.

## Próximas mejoras

- Activar autenticación y persistencia del esquema Prisma.
- Añadir miniaturas y reordenamiento drag-and-drop real por página.
- Añadir enlaces individuales de entrega y almacenamiento privado.
- Incorporar pruebas E2E Playwright al CI.
