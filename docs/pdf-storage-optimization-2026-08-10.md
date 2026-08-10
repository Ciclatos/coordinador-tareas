# Auditoría de peso y política de consolidación

Fecha: 10 de agosto de 2026. La auditoría fue de solo lectura y no eliminó archivos productivos.

## Línea base

La muestra de mayor tamaño contenía 80 páginas y pesaba 64.77 MiB (0.81 MiB por página). Sus seis entregas fuente sumaban 64.74 MiB: 0.03, 12.46, 6.90, 17.93, 13.37 y 14.05 MiB. Por tanto, las páginas administrativas, logo y fuentes aportaban menos de 0.1 % y no existía una duplicación material.

Se encontraron 108 imágenes únicas en el documento final, 107 procedentes de entregas escaneadas, con resolución media aproximada de 1787×1966 px y máximos de 2510×3164 px. La causa principal era que `pdf-lib` copiaba los PDF originales completos; los perfiles anteriores solo actuaban sobre imágenes sueltas.

## Solución

- Los PDF con texto seleccionable, contenido vectorial o sin imágenes se preservan sin rasterización.
- Solo una página detectada como escaneo sin texto se renderiza con PDF.js, respeta su proporción y se codifica como JPEG.
- Alta usa hasta 2400 px, 200 DPI objetivo y calidad 90 %.
- Equilibrada usa hasta 1800 px, 165 DPI y calidad 78 %; es el perfil predeterminado.
- Compacta usa hasta 1200 px, 120 DPI y calidad 62 %.
- La interfaz muestra estimación previa, tamaño real, perfil y reducción obtenida.

Con la misma muestra productiva, procesada localmente y sin subir copias, los resultados fueron:

| Perfil | Tamaño | Reducción frente a 64.77 MiB |
|---|---:|---:|
| Alta | 39.37 MiB | 39 % |
| Equilibrada | 18.07 MiB | 72 % |
| Compacta | 7.21 MiB | 89 % |

Además se generó una muestra ficticia de 36 páginas (30 escaneos): Alta 9.1 MiB, Equilibrada 5.4 MiB y Compacta 2.4 MiB. Se renderizaron páginas administrativas, fórmulas y escritura de los tres perfiles; Equilibrada mantuvo lectura nítida y Compacta lectura aceptable para límites estrictos.

## Consolidación

Generar un PDF ya no finaliza una tarea. La finalización es explícita y exige un PDF vigente, entregas completas, ausencia de correcciones y que todas las fuentes actuales estén incluidas. Liberar almacenamiento es una segunda acción destructiva con confirmación escrita.

Se conservan tarea, integrantes, distribución, evaluaciones, comentarios, reporte, puntualidad, páginas, tamaño, nombre original, SHA-256, historial de versiones y PDF finales. Solo se eliminan los blobs individuales y derivados regenerables. `SubmissionFile.storageKey` queda vacío y `binaryDeletedAt` registra la operación; la UI lo presenta como “consolidado” en vez de error.

El cron puede ejecutar la misma política tras 7, 14 o 30 días únicamente cuando el coordinador la habilita. El valor predeterminado es Nunca. Cada decisión se vuelve a validar al ejecutar para impedir consolidar un PDF desactualizado o incompleto.
