# Accesibilidad y movimiento

Objetivo técnico: WCAG 2.2 AA. La página `/accesibilidad/` explica el ámbito, las medidas y las revisiones pendientes. No se declara certificación ni evaluación integral de conformidad.

## Medidas implementadas

- HTML semántico, idioma español, títulos específicos y encabezados jerarquizados.
- Navegaciones con nombre accesible, enlaces descriptivos y salto al contenido.
- Foco visible inmediato de 3 px con separación, sin retraso de aparición.
- Menú nativo operable con teclado y sin JavaScript; mejora funcional para cierre con Escape y devolución del foco.
- Cabecera adherente con altura medida para mantener visibles los destinos y el foco.
- Objetivos de navegación de al menos 44 px y CTA de al menos 48 px.
- CTA lila claro con texto oscuro; hover lila oscuro con texto blanco. Foco diferenciado y adaptación a colores forzados.
- Gradiente conservador sobre la foto, dimensiones explícitas y variantes móviles. Alternativas de logos y exclusión de elementos decorativos.
- Reflujo a 320 px y comprobaciones de ampliación de texto y espaciado.

## Movimiento

| Elemento          | Comportamiento                                                            |
| ----------------- | ------------------------------------------------------------------------- |
| Hero              | Entrada de 560 ms y 16 px, desfases 0/120/240 ms; una ejecución al cargar |
| Soluciones        | Entrada grupal de 600 ms y 16 px                                          |
| Proceso           | Números de 480 ms y 12 px, desfases de 100 ms; conectores decorativos     |
| Ejemplo económico | Entrada grupal de 560 ms y 14 px; cifras constantes                       |
| Interacciones     | Transiciones de 200 ms en enlaces, CTA e iconos                           |

El contenido esencial permanece visible y accesible durante las entradas. Las transformaciones no desplazan el layout. No hay parallax, contadores, progreso ficticio ni movimiento continuo.

Las entradas por scroll utilizan `animation-trigger` y `timeline-trigger` cuando están disponibles. El fallback `animation-timeline: view()` es reversible al retroceder. Sin soporte se muestra el contenido completo sin esa animación.

`prefers-reduced-motion: reduce` desactiva animaciones y transiciones. Los colores del CTA cambian inmediatamente para conservar el contraste; el foco neutraliza las transformaciones de grupos interactivos sin reiniciar la entrada.

## Validación y límites

Las pruebas cubren ambas rutas, seis anchuras, navegación con teclado, contraste, foco, menú abierto, colores forzados y movimiento reducido. También comprueban contenido con animaciones anuladas y sin JavaScript. Los resultados incompletos de axe, especialmente contraste sobre imágenes, requieren revisión manual y no se consideran superados automáticamente.

En WebKit para Windows se verifica foco explícito y activación con Enter/Escape. El Tab inicial presenta una limitación del entorno y no se da por validado; Chromium y Firefox sí lo comprueban.

Quedan pendientes lectores de pantalla, zoom real del navegador, dispositivos físicos, Safari real y evaluación especializada de todos los criterios aplicables. Binding debe validar la declaración y el canal específico de accesibilidad; se mantiene el contacto corporativo oficial sin inventar compromisos de respuesta.
