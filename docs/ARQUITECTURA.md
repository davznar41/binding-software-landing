# Arquitectura y mantenimiento

El proyecto genera dos páginas estáticas: `/` y `/accesibilidad/`.

```text
src/
  components/       Header, Hero, Features, Process, Benefits, Footer, Arrow
  layouts/          BaseLayout compartido
  pages/            Inicio y accesibilidad
  data/assets.ts    Recursos y contacto oficial
  styles/           Tokens y estilos globales
public/assets/      Recursos optimizados y licencias
tests/              Pruebas funcionales, responsive, contraste y movimiento
docs/               Arquitectura y accesibilidad
```

## Implementación

Astro 6.4.8 exacta, TypeScript 5.9.3 con `astro/tsconfigs/strict` y CSS nativo. Versiones fijadas en `package.json` y `pnpm-lock.yaml`. Entorno probado: Node.js 24.11.1 y pnpm 11.25.0. El mínimo declarado, 22.19.0, contempla los requisitos del árbol bloqueado, pero no se presenta como un entorno probado.

`BaseLayout.astro` comparte metadatos, fuentes locales, cabecera, footer y salto al contenido. La landing conserva cuatro bloques: hero, soluciones, proceso e impacto. Identity es el producto principal; consultoría e integraciones son servicios complementarios.

El único módulo cliente está en `Header.astro`: cierra el menú al salir el foco, seguir un enlace o pulsar Escape y mide la altura del header con `ResizeObserver`. El menú utiliza `details` y `summary` y funciona sin JavaScript. El movimiento es CSS; no hay librerías de UI, React, SSR ni backend.

## Verificación

`pnpm check` comprueba tipos; el build no lo sustituye. `pnpm test` ejecuta 67 pruebas con Playwright y axe-core. Su preview utiliza `127.0.0.1:4322`, separado del desarrollo en 4321. Las evidencias se generan en `artifacts/quality/`, excluido del repositorio.

La revisión del 10 de noviembre de 2026 superó las 67 pruebas y 10 ejecuciones de axe sin violaciones detectadas. Se comprobaron ambas rutas a 320, 375, 390, 768, 1024 y 1440 px, además del movimiento en Chromium, Firefox y WebKit. El build conserva dos avisos de anotaciones en Zod transitivo. Los límites de accesibilidad se describen en [ACCESIBILIDAD.md](ACCESIBILIDAD.md).

## Recursos

Las imágenes, marcas y fuentes se sirven localmente. Las marcas proceden de `bindingsoftware.com/images/`; la foto hotelera es el recurso de Unsplash `photo-1566073771259-6a8506099945` utilizado por la portada oficial. Se conserva la autorización de uso declarada por el solicitante, sin atribuir el hotel como cliente.

Inter procede de Fontsource; Montserrat, de la web corporativa. Sus licencias se conservan en `public/assets/INTER-LICENSE.txt` y `public/assets/fonts/MONTSERRAT-OFL.txt`. Para sustituir imágenes, revisar autorización, dimensiones y alternativas en `src/data/assets.ts`, recorte y contraste. Los recursos de producción ya están optimizados y el build no necesita originales adicionales.

## Integración y pendientes

`dist/` está preparado para la raíz de un dominio. Un subdirectorio requiere configurar `base` y adaptar enlaces y recursos. Al integrar la nueva portada deben conservarse las demás páginas y funcionalidades corporativas, revisando colisiones de `/assets/` y `/_astro/`.

Inicio y accesibilidad son locales; las demás entradas, Login y EN enlazan al sitio oficial. ES representa el idioma actual. La propuesta no incluye traducción inglesa ni un buscador sin resultados; Binding deberá decidir su integración futura.

Binding debe validar «menos de 20 segundos», las métricas operativas, la afirmación citada sobre reportes SES y el ejemplo económico de 200 habitaciones, 75 % de ocupación y retorno posible de 1–3 meses. Se conserva su atribución y alcance en la página.

La consulta de dependencias del 10 de noviembre de 2026 mantiene **10 avisos: 1 crítico, 3 altos, 4 moderados y 2 bajos**, en Astro, Sharp y esbuild. La salida es estática y no procesa AVIF o imágenes de usuarios, ni utiliza islas hidratadas, View Transitions o middleware. Estas precondiciones limitan los recorridos identificados, pero no corrigen las bibliotecas. El equipo técnico debe decidir su mantenimiento antes de publicar; Astro permanece en 6.4.8 por requisito.
