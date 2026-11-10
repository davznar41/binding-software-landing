# Binding Software · Landing corporativa

Propuesta de portada para Binding Software, centrada en Binding Identity y la digitalización de la recepción hotelera. Incluye una landing responsive y una página de accesibilidad.

## Tecnología

Astro **6.4.8**, TypeScript estricto y CSS nativo. Generación estática, sin React, SSR ni backend. Entorno verificado: Node.js **24.11.1** y pnpm **11.25.0**. Mínimo declarado: Node.js 22.19.0.

## Desarrollo

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abrir `http://localhost:4321/`. Accesibilidad: `/accesibilidad/`.

## Verificación y build

```sh
pnpm exec playwright install chromium firefox webkit
pnpm verify
```

`pnpm verify` ejecuta TypeScript, build y las pruebas con Playwright y axe-core. `pnpm build` genera el sitio estático en `dist/`.

## Documentación

- [Arquitectura y mantenimiento](docs/ARQUITECTURA.md).
- [Accesibilidad y movimiento](docs/ACCESIBILIDAD.md).

Entrega para revisión de Binding. Las afirmaciones comerciales y la declaración de accesibilidad requieren validación corporativa. Los recursos conservan sus derechos y licencias; no se concede una licencia abierta del proyecto.
