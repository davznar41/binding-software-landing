import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.resolve('astro/package.json'))('sharp');

const widths = [320, 375, 390, 768, 1024, 1440];
const evidenceDir = process.env.EVIDENCE_DIR || 'artifacts/quality';
const routes = [
  {
    path: '/',
    slug: 'landing',
    title: 'Check-in digital para hoteles | Binding Software',
  },
  {
    path: '/accesibilidad/',
    slug: 'accesibilidad',
    title: 'Accesibilidad | Binding Software',
  },
];

async function noOverflow(page: Page) {
  const measurement = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('main *, header *, footer *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      })
      .map((e) => `${e.tagName}.${e.className}`),
  }));
  expect(measurement.document, JSON.stringify(measurement)).toBeLessThanOrEqual(
    measurement.viewport + 1,
  );
  expect(measurement.elements).toEqual([]);
}

for (const route of routes) {
  for (const width of widths) {
    test(`${route.slug}: responsive ${width}px y enlaces internos`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('script')).toHaveCount(1);
      await expect(page.locator('script')).toHaveAttribute('type', 'module');
      for (const image of await page.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('complete', true);
        await expect
          .poll(() =>
            image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await noOverflow(page);
      const images = await page
        .locator('img')
        .evaluateAll((imgs) =>
          imgs.every(
            (i) =>
              i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0,
          ),
        );
      expect(images).toBe(true);
      const targets = await page
        .locator(
          'header a:visible, header summary:visible, footer a, .button, .text-link, .contents a, .integration-brands a',
        )
        .evaluateAll((links) =>
          links.map((a) => ({
            text: a.textContent?.trim() || a.getAttribute('aria-label'),
            height: a.getBoundingClientRect().height,
            width: a.getBoundingClientRect().width,
          })),
        );
      for (const target of targets) {
        expect(target.height, JSON.stringify(target)).toBeGreaterThanOrEqual(
          44,
        );
        expect(target.width).toBeGreaterThanOrEqual(24);
      }
      const hrefs = [
        ...new Set(
          await page
            .locator('a')
            .evaluateAll((links) =>
              links.map((a) => a.getAttribute('href') || ''),
            ),
        ),
      ];
      for (const href of hrefs) {
        expect(href).not.toBe('');
        const url = new URL(href, page.url());
        if (url.origin !== new URL(page.url()).origin) continue;
        const targetResponse = await request.get(url.pathname);
        expect(targetResponse.status(), href).toBe(200);
        if (url.hash)
          expect(await targetResponse.text(), href).toContain(
            `id="${url.hash.slice(1)}"`,
          );
      }
      expect(errors).toEqual([]);
      if (width === 390 || width === 1440) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({
          path: `${evidenceDir}/${route.slug}-${width}.png`,
          fullPage: true,
        });
        if (route.slug === 'landing') {
          await page
            .locator('.hero')
            .screenshot({ path: `${evidenceDir}/hero-${width}.png` });
          await page
            .locator('header')
            .screenshot({ path: `${evidenceDir}/header-local-${width}.png` });
          await page.screenshot({
            path: `${evidenceDir}/portada-${width}.png`,
          });
          // Solo capturas aisladas: impedir que el header sticky se superponga
          // al recorte de secciones más altas que la ventana. Las capturas de
          // página y scroll conservan su comportamiento real.
          const captureStyle = await page.addStyleTag({
            content: '.site-header {position:relative!important}',
          });
          await page
            .locator('#soluciones')
            .screenshot({ path: `${evidenceDir}/soluciones-${width}.png` });
          await page
            .locator('#ventajas')
            .screenshot({ path: `${evidenceDir}/impacto-${width}.png` });
          await captureStyle.evaluate((el) =>
            (el as HTMLStyleElement).remove(),
          );
        }
      }
    });
  }

  for (const width of [390, 1440]) {
    test(`${route.slug}: axe WCAG 2.2 A/AA a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route.path);
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page })
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22aa',
          'best-practice',
        ])
        .analyze();
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(
        `${evidenceDir}/axe-${route.slug}-${width}.json`,
        JSON.stringify(
          {
            engine: result.testEngine,
            environment: result.testEnvironment,
            url: result.url,
            timestamp: result.timestamp,
            violations: result.violations,
            incomplete: result.incomplete,
            passes: result.passes.map((p) => ({ id: p.id, tags: p.tags })),
          },
          null,
          2,
        ),
      );
      expect(
        result.violations,
        JSON.stringify(result.violations, null, 2),
      ).toEqual([]);
    });
  }

  test(`${route.slug}: teclado, salto, foco y recorrido completo`, async ({
    page,
    baseURL,
  }) => {
    await page.goto(route.path);
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Saltar al contenido' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.goto(route.path);
    const count = await page.locator('a:visible').count();
    const seen: string[] = [];
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          href: el.getAttribute('href'),
          outline: style.outlineStyle,
          width: style.outlineWidth,
          top: r.top,
          bottom: r.bottom,
          viewport: innerHeight,
        };
      });
      expect(focused.tag).toBe('A');
      expect(focused.outline).toBe('solid');
      expect(parseFloat(focused.width)).toBeGreaterThanOrEqual(3);
      expect(focused.bottom).toBeGreaterThan(0);
      expect(focused.top).toBeLessThan(focused.viewport);
      seen.push(focused.href || '');
    }
    expect(seen.length).toBe(count);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('a:visible').nth(count - 2)).toBeFocused();
    await page
      .getByRole('navigation', { name: 'Pie de página' })
      .getByRole('link', { name: 'Accesibilidad', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/accesibilidad\/$/);
    await expect(
      page
        .getByRole('navigation', { name: 'Pie de página' })
        .getByRole('link', { name: 'Accesibilidad', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: 'Volver al inicio', exact: true })
      .click();
    await expect(page).toHaveURL(new URL('/', baseURL).href);
  });

  test(`${route.slug}: texto al 200%, reflujo y espaciado`, async ({
    page,
  }) => {
    await page.goto(route.path);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await noOverflow(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.addStyleTag({
      content:
        'html { font-size: 100% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
    });
    await noOverflow(page);
    // 320 CSS px representa el reflujo de 1280 CSS px al 400%; no simula zoom de navegador.
    await page.setViewportSize({ width: 1440, height: 900 });
    await noOverflow(page);
  });
}

test('navegación, estructura y cobertura comercial', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('.hero').getByRole('link', { name: 'Solicitar información' }),
  ).toHaveAttribute('href', 'https://bindingsoftware.com/contacto/');
  await expect(page.locator('.hero a')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Solicitar información', exact: true }),
  ).toHaveCount(2);
  await expect(page.locator('#proceso ol > li')).toHaveCount(4);
  await expect(page.locator('#contacto')).toHaveCount(1);
  await expect(
    page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Contacto', exact: true }),
  ).toHaveAttribute('href', 'https://bindingsoftware.com/contacto/');
  await expect(page.locator('main > section')).toHaveCount(5);
  await expect(page.locator('.operational-results > li')).toHaveCount(3);
  await expect(page.locator('.results-contact')).toHaveAttribute(
    'href',
    'https://bindingsoftware.com/contacto/',
  );
  await expect(page.locator('.economic-intro')).toContainText(
    '200 habitaciones y 75 %',
  );
  await expect(page.locator('.benefits blockquote')).toHaveAttribute(
    'cite',
    'https://bindingsoftware.com/por-que-binding/',
  );
  await expect(page.locator('.benefits blockquote')).toContainText('100 %');
  await expect(page.locator('.benefits blockquote')).toContainText(
    'Legal y reportes SES',
  );
  await expect(page.locator('.economic-results > li')).toHaveCount(3);
  await expect(page.locator('.economic-intro')).toContainText('1–3 meses');
  await expect(page.locator('.results-context')).toContainText(
    'no una garantía',
  );
  await expect(page.locator('.services > h3')).toHaveText(
    'Servicios complementarios',
  );
  await expect(page.locator('.service-card h4')).toHaveCount(2);
  await expect(page.locator('.identity-details > h4')).toHaveText(
    'Qué incluye',
  );
  await expect(page.locator('.service-photo')).toHaveCount(0);
  await expect(page.locator('.capabilities > li')).toHaveCount(3);
  await expect(page.locator('.capabilities')).toContainText('Pre check-in');
  await expect(page.locator('.capabilities')).toContainText('SES Hospedajes');
  await expect(page.locator('.integration-brands')).toContainText(
    'Integraciones con sistemas hoteleros',
  );
  await expect(page.locator('.integration-brands a')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'Binding Identity', exact: true }),
  ).toHaveCount(1);
  await expect(page.locator('.identity-copy')).toContainText(
    'Check-in digital y verificación de identidad en segundos',
  );
  await expect(page.locator('#soluciones article')).toHaveCount(3);
  await expect(page.locator('main form')).toHaveCount(0);
});

test('build estático con mejora de menú acotada y sin salida SSR', async () => {
  const home = await readFile('dist/index.html', 'utf8');
  const accessibility = await readFile('dist/accesibilidad/index.html', 'utf8');
  for (const html of [home, accessibility]) {
    expect(html).not.toMatch(/<astro-island\b/);
    const scripts = html.match(/<script\b[\s\S]*?<\/script>/g) || [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('type="module"');
    expect(scripts[0]!.length).toBeLessThan(2000);
    expect(html).toContain('lang="es"');
    expect(html).toContain('/accesibilidad/');
    expect(html).not.toMatch(/https?:\/\/[^"']+\.(?:css|js|woff2|webp)/);
  }
  const files = await readdir('dist');
  expect(files).not.toContain('server');
  expect(files).not.toContain('_worker.js');
});

test('contraste de combinaciones renderizadas y estados', async ({ page }) => {
  const checks: {
    route: string;
    selector: string;
    state?: 'hover';
    min?: number;
  }[] = [
    { route: '/', selector: '.hero .button' },
    { route: '/', selector: '.hero .button', state: 'hover' },
    { route: '/', selector: '.step-number' },
    { route: '/', selector: '.identity-proposition' },
    { route: '/', selector: '.identity-description' },
    { route: '/', selector: '.capabilities li' },
    { route: '/', selector: '.integration-brands > p' },
    { route: '/', selector: '.results-context' },
    { route: '/', selector: '.identity-details > h4' },
    { route: '/', selector: '.services > h3' },
    { route: '/', selector: '.service-card h4' },
    { route: '/', selector: '.service-card p' },
    { route: '/', selector: '.economic-intro' },
    { route: '/', selector: '.saving-amount' },
    { route: '/', selector: '.saving-title' },
    { route: '/', selector: '.economic-results li > p:last-child' },
    { route: '/', selector: '.results-contact' },
    { route: '/', selector: '.results-contact', state: 'hover' },
    { route: '/', selector: '.benefits li p' },
    { route: '/', selector: '.process li p' },
    { route: '/', selector: '.footer-description' },
    { route: '/', selector: 'header nav a', state: 'hover' },
    { route: '/', selector: '.desktop-navigation .languages span' },
    { route: '/', selector: '.desktop-navigation .login' },
    { route: '/accesibilidad/', selector: '.document .intro' },
    { route: '/accesibilidad/', selector: '.notice p' },
    { route: '/accesibilidad/', selector: '.contents a' },
    { route: '/accesibilidad/', selector: '.contents a', state: 'hover' },
  ];
  const report = [];
  for (const check of checks) {
    await page.goto(check.route);
    const element = page.locator(check.selector).first();
    if (check.state === 'hover') await element.hover();
    const pair = await element.evaluate((el) => {
      let parent: Element | null = el;
      const layers: number[][] = [];
      while (parent) {
        const rgba = getComputedStyle(parent)
          .backgroundColor.match(/[\d.]+/g)
          ?.map(Number);
        if (rgba) {
          const alpha = rgba[3] ?? 1;
          if (alpha > 0) layers.push([rgba[0]!, rgba[1]!, rgba[2]!, alpha]);
          if (alpha === 1) break;
        }
        parent = parent.parentElement;
      }
      let mixed = [255, 255, 255];
      for (const rgba of layers.reverse())
        mixed = mixed.map((v, i) => rgba[i]! * rgba[3]! + v * (1 - rgba[3]!));
      const background = 'rgb(' + mixed.join(', ') + ')';
      const method =
        'computed-alpha-composite; dark header gradient bounded by its lighter solid backing';
      const foreground = getComputedStyle(el).color;
      const luminance = (rgb: string) => {
        const values = rgb
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const normalized = v / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
        return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
      };
      const a = luminance(foreground),
        b = luminance(background);
      return {
        foreground,
        background,
        method,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
    report.push({ ...check, ...pair });
    expect(
      pair.ratio,
      JSON.stringify({ ...check, ...pair }),
    ).toBeGreaterThanOrEqual(check.min || 4.5);
  }
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    `${evidenceDir}/contraste.json`,
    JSON.stringify(report, null, 2),
  );
});

async function verifyHeroContrast(page: Page, width: number, filename: string) {
  const text = await page
    .locator('.hero-kicker, .hero h1, .hero .lead')
    .evaluateAll((roots) =>
      roots.flatMap((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          nodes.push({
            region: root.id || root.className,
            text: node.textContent.trim(),
            color: getComputedStyle(node.parentElement!).color,
            rects: [...range.getClientRects()].map((r) => ({
              x: r.x + scrollX,
              y: r.y + scrollY,
              width: r.width,
              height: r.height,
            })),
          });
        }
        return nodes;
      }),
    );
  // Solo en la prueba: renderizar el CSS real sobre blanco ofrece el fondo más
  // luminoso posible, independientemente del píxel de foto o del encuadre.
  // Ocultar texto conserva exactamente sus posiciones y evita muestrear glifos.
  const contrastStyle = await page.addStyleTag({
    content:
      '.hero { background: white !important; } .hero-backdrop, .hero-content { visibility: hidden !important; }',
  });
  const png = await page.screenshot({ fullPage: true });
  const { data, info } = (await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })) as {
    data: Buffer;
    info: { width: number; height: number; channels: number };
  };
  const luminance = (rgb: number[]) => {
    const linear = rgb.map((v) =>
      v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4,
    );
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const report = text.map((node) => {
    let maximum = 0;
    for (const rect of node.rects) {
      for (
        let y = Math.max(0, Math.floor(rect.y));
        y < Math.min(info.height, Math.ceil(rect.y + rect.height));
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(rect.x));
          x < Math.min(info.width, Math.ceil(rect.x + rect.width));
          x++
        ) {
          const i = (y * info.width + x) * info.channels;
          maximum = Math.max(
            maximum,
            luminance([data[i]!, data[i + 1]!, data[i + 2]!]),
          );
        }
      }
    }
    const foreground = luminance(
      node.color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number),
    );
    return {
      ...node,
      maximumBackgroundLuminance: maximum,
      minimumRatio: (foreground + 0.05) / (maximum + 0.05),
    };
  });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    `${evidenceDir}/${filename}.json`,
    JSON.stringify(
      {
        method:
          'CSS renderizado sobre blanco; mínimo por todos los píxeles de los rectángulos de texto; umbral 4.5:1 incluso para título grande',
        viewport: width,
        report,
      },
      null,
      2,
    ),
  );
  expect(report.map(({ region }) => region)).toEqual(
    expect.arrayContaining(['hero-kicker', 'hero-title', 'lead']),
  );
  for (const item of report)
    expect(item.minimumRatio, JSON.stringify(item)).toBeGreaterThanOrEqual(4.5);
  await contrastStyle.evaluate((el) => el.parentNode?.removeChild(el));
}
for (const width of widths) {
  test(`hero: contraste conservador del gradiente a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await verifyHeroContrast(page, width, `contraste-hero-${width}`);
  });
}

for (const route of routes)
  for (const width of [390, 1440]) {
    test(`${route.slug}: header adherente y foco visible a ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route.path);
      await expect(page.locator('header')).toHaveClass(/menu-enhanced/);
      await page.locator('footer').scrollIntoViewIfNeeded();
      expect((await page.locator('header').boundingBox())!.y).toBeCloseTo(0, 0);
      await page.screenshot({
        path: `${evidenceDir}/${route.slug}-scroll-${width}.png`,
      });
      await page.goto(
        route.path + (route.path === '/' ? '#soluciones' : '#medidas'),
      );
      const heading = page.locator(
        route.path === '/' ? '#solutions-title' : '#medidas',
      );
      expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(
        (await page.locator('header').boundingBox())!.height,
      );
      if (width === 390) {
        const summary = page.locator('header summary');
        const menu = page.locator('.mobile-navigation');
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('open', '');
        const links = await page.locator('.mobile-panel a').count();
        for (let i = 0; i <= links; i++) await page.keyboard.press('Tab');
        await expect(menu).not.toHaveAttribute('open', '');
        const focused = await page.evaluate(() => {
          const e = document.activeElement!;
          const r = e.getBoundingClientRect();
          return {
            inHeader: !!e.closest('header'),
            top: r.top,
            bottom: r.bottom,
          };
        });
        expect(focused.inHeader).toBe(false);
        expect(focused.top).toBeGreaterThanOrEqual(
          (await page.locator('header').boundingBox())!.height,
        );
        expect(focused.bottom).toBeLessThanOrEqual(1000);
        await summary.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Escape');
        await expect(menu).not.toHaveAttribute('open', '');
        await expect(summary).toBeFocused();
      } else {
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.addStyleTag({ content: 'html {font-size:200%!important}' });
        await expect
          .poll(async () =>
            page.evaluate(() =>
              Math.abs(
                parseFloat(
                  getComputedStyle(document.documentElement).getPropertyValue(
                    '--site-header-height',
                  ),
                ) -
                  document.querySelector('header')!.getBoundingClientRect()
                    .height,
              ),
            ),
          )
          .toBeLessThan(1);
        await heading.scrollIntoViewIfNeeded();
        expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(
          (await page.locator('header').boundingBox())!.height,
        );
      }
    });
  }

for (const route of routes) {
  test(`${route.slug}: menú nativo sin JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4322' + route.path);
    await page.evaluate(() => document.fonts.ready);
    const summary = page.locator('header summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details')).toHaveAttribute('open', '');
    await noOverflow(page);
    const header = (await page.locator('header').boundingBox())!;
    expect(
      (await page.locator('main').boundingBox())!.y,
    ).toBeGreaterThanOrEqual(header.y + header.height);
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('navigation', { name: 'Principal' })
        .getByRole('link', { name: 'Inicio', exact: true }),
    ).toBeFocused();
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('details')).not.toHaveAttribute('open', '');
    await context.close();
  });
}

test('CTA unificados: estados, contraste, foco y tamaño en seis anchuras', async ({
  page,
}) => {
  const report = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const shapes = [];
    for (const target of [
      { name: 'hero', selector: '.hero .button' },
      { name: 'impacto', selector: '.results-contact' },
    ]) {
      const button = page.locator(target.selector);
      await expect(button).toHaveAccessibleName('Solicitar información');
      await expect(button).toHaveAttribute(
        'href',
        'https://bindingsoftware.com/contacto/',
      );
      await page.locator('main').focus();
      await page.mouse.move(0, 0);
      await button.scrollIntoViewIfNeeded();
      for (const state of ['normal', 'hover', 'focus']) {
        if (state === 'hover') await button.hover();
        if (state === 'focus') {
          await page.mouse.move(0, 0);
          await page.keyboard.press('Tab');
          await button.focus();
        }
        const values = await button.evaluate((el) => {
          const s = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const luminance = (color: string) => {
            const v = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((n) =>
                n / 255 <= 0.04045
                  ? n / 255 / 12.92
                  : ((n / 255 + 0.055) / 1.055) ** 2.4,
              );
            return v[0]! * 0.2126 + v[1]! * 0.7152 + v[2]! * 0.0722;
          };
          const ratio = (a: string, b: string) => {
            const x = luminance(a),
              y = luminance(b);
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
          };
          return {
            shape: {
              background: s.backgroundColor,
              color: s.color,
              border: s.borderColor,
              radius: s.borderRadius,
              padding: s.padding,
              gap: s.gap,
              fontFamily: s.fontFamily,
              fontSize: s.fontSize,
              fontWeight: s.fontWeight,
              lineHeight: s.lineHeight,
            },
            shadow: s.boxShadow,
            height: rect.height,
            width: rect.width,
            top: rect.top,
            bottom: rect.bottom,
            textContrast: ratio(s.color, s.backgroundColor),
            borderAgainstFill: ratio(s.borderColor, s.backgroundColor),
            focusRingAgainstWhite: ratio(s.outlineColor, 'rgb(255,255,255)'),
            outlineWidth: parseFloat(s.outlineWidth),
            outlineStyle: s.outlineStyle,
          };
        });
        expect(values.textContrast).toBeGreaterThanOrEqual(4.5);
        if (state !== 'hover')
          expect(values.borderAgainstFill).toBeGreaterThanOrEqual(3);
        if (state !== 'focus') expect(values.shadow).toBe('none');
        expect(values.shape.border).not.toBe('rgb(255, 255, 255)');
        expect(values.height).toBeGreaterThanOrEqual(48);
        expect(values.width).toBeGreaterThanOrEqual(48);
        if (state === 'normal') shapes.push(values.shape);
        if (state === 'focus') {
          await expect(button).toBeFocused();
          expect(values.outlineStyle).toBe('solid');
          expect(values.outlineWidth).toBeGreaterThanOrEqual(3);
          expect(values.focusRingAgainstWhite).toBeGreaterThanOrEqual(3);
          const header = (await page.locator('header').boundingBox())!;
          expect(values.top - 7).toBeGreaterThanOrEqual(header.height);
          expect(values.bottom + 7).toBeLessThanOrEqual(1000);
        }
        report.push({ viewport: width, target: target.name, state, ...values });
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `${evidenceDir}/cta-${target.name}-${width}-${state}.png`,
          });
      }
    }
    expect(shapes[0]).toEqual(shapes[1]);
  }
  await writeFile(
    `${evidenceDir}/cta-estados.json`,
    JSON.stringify(report, null, 2),
  );
});

test('CTA: colores forzados y movimiento reducido', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('header summary')).toHaveAccessibleName('Menú');
  await expect(page.locator('.menu-icon')).toHaveCSS(
    'forced-color-adjust',
    'none',
  );
  await expect(page.locator('.menu-icon')).toHaveCSS(
    'background-image',
    /linear-gradient/,
  );
  for (const target of [
    { name: 'hero', selector: '.hero .button' },
    { name: 'impacto', selector: '.results-contact' },
  ]) {
    const button = page.locator(target.selector);
    await page.keyboard.press('Tab');
    await button.focus();
    await expect(button).toHaveCSS('transition-duration', '0s');
    await expect(button).toHaveCSS('border-top-style', 'solid');
    await expect(button).toHaveCSS('outline-style', 'solid');
    const colors = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, background: s.backgroundColor };
    });
    expect(colors.border).not.toBe(colors.background);
    await page.screenshot({
      path: `${evidenceDir}/cta-${target.name}-colores-forzados.png`,
    });
  }
});

test('transiciones discretas y preferencia de movimiento reducido', async ({
  page,
}) => {
  await page.goto('/');
  const action = page
    .locator('.hero')
    .getByRole('link', { name: 'Solicitar información' });
  await expect(action).toHaveCSS('transition-duration', '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(action).toHaveCSS('transition-duration', '0.2s');
  const durations = await action.locator('svg').evaluate((el) =>
    getComputedStyle(el)
      .transitionDuration.split(',')
      .map((value) => parseFloat(value)),
  );
  expect(
    durations.every((duration) => duration >= 0.15 && duration <= 0.2),
  ).toBe(true);
  await action.focus();
  await expect(action).toHaveCSS('outline-width', '3px');
});

test('contenido público corporativo y estado de evaluación transparente', async () => {
  const academicOrigin =
    /proyecto (?:demostrativo|de pr[áa]cticas)|(?:web|p[áa]gina|implementaci[óo]n) demostrativ[ao]|documento de pr[áa]cticas|ejercicio acad[ée]mico|trabajo de estudiantes|(?:tarea|prototipo) de pr[áa]cticas|pr[áa]cticas de Desarrollo de Aplicaciones Web/i;
  for (const path of ['dist/index.html', 'dist/accesibilidad/index.html']) {
    const html = await readFile(path, 'utf8');
    expect(html).not.toMatch(academicOrigin);
    expect(html).toContain(
      'Binding Software · Tecnología para la gestión hotelera',
    );
  }
  const accessibility = (
    await readFile('dist/accesibilidad/index.html', 'utf8')
  ).replace(/\s+/g, ' ');
  expect(accessibility).toContain(
    'validación corporativa de esta declaración están pendientes',
  );
  expect(accessibility).toContain(
    'No se declara un nivel de conformidad oficial',
  );
  for (const internalFile of [
    'README.md',
    'AGENTS.md',
    'DESIGN.md',
    'docs',
    'tests',
  ]) {
    expect(await readdir('dist')).not.toContain(internalFile);
  }
});

for (const width of [390, 1440]) {
  test(`recursos locales y medición de carga a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      const metrics = { cls: 0, lcp: 0 };
      Object.defineProperty(window, '__qualityMetrics', { value: metrics });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const response = await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const initialBytes = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .reduce(
          (sum, entry) =>
            sum + (entry as PerformanceResourceTiming).transferSize,
          0,
        ),
    );
    for (const image of await page.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async (el) => {
        await (el as HTMLImageElement).decode();
      });
    }
    await page.waitForLoadState('networkidle');
    const report = await page.evaluate(() => {
      const metrics = (
        window as typeof window & {
          __qualityMetrics: { cls: number; lcp: number };
        }
      ).__qualityMetrics;
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            url: resource.name,
            type: resource.initiatorType,
            bytes: resource.transferSize,
            decodedBytes: resource.decodedBodySize,
            durationMs: resource.duration,
          };
        });
      return {
        viewport: innerWidth,
        ...metrics,
        resources,
        images: [...document.images].map((img) => ({
          source: img.currentSrc,
          width: img.width,
          height: img.height,
          loading: img.loading,
          priority: img.fetchPriority,
        })),
      };
    });
    expect(
      report.resources.filter(
        (r) => new URL(r.url).origin !== new URL(page.url()).origin,
      ),
    ).toEqual([]);
    expect(
      report.resources.filter((r) => r.type === 'script').length,
    ).toBeLessThanOrEqual(1);
    const htmlBytes = (await response!.body()).length;
    await writeFile(
      `${evidenceDir}/rendimiento-${width}.json`,
      JSON.stringify(
        {
          environment:
            'Chromium headless, localhost, sin throttling; diagnóstico, no Lighthouse ni experiencia de campo',
          htmlBytes,
          initialBytes,
          totalTransferBytes:
            htmlBytes + report.resources.reduce((sum, r) => sum + r.bytes, 0),
          ...report,
        },
        null,
        2,
      ),
    );
  });
}

for (const route of routes)
  for (const width of widths) {
    test(route.slug + ': menú corporativo ' + width, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route.path);
      const summary = page.locator('header summary');
      if (width < 961) {
        await expect(summary).toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Principal' }),
        ).toHaveCount(0);
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('details')).toHaveAttribute('open', '');
        await page.keyboard.press('Tab');
        await expect(
          page
            .getByRole('navigation', { name: 'Principal' })
            .getByRole('link', { name: 'Inicio', exact: true }),
        ).toBeFocused();
      }
      await noOverflow(page);
      const nav = page.getByRole('navigation', { name: 'Principal' });
      await expect(nav.getByRole('link')).toHaveText([
        'Inicio',
        'Por qué Binding',
        'I+D+i',
        'Comparador 360º',
        'Contacto',
        'Login',
      ]);
      const destinations = [
        '/',
        'https://bindingsoftware.com/por-que-binding/',
        'https://bindingsoftware.com/idi/',
        'https://bindingsoftware.com/check-in-360/',
        'https://bindingsoftware.com/contacto/',
        'https://app.bindingid.com/login',
      ];
      for (let i = 0; i < destinations.length; i++)
        await expect(nav.getByRole('link').nth(i)).toHaveAttribute(
          'href',
          destinations[i]!,
        );
      expect(await nav.locator('[aria-current="page"]').count()).toBe(
        route.path === '/' ? 1 : 0,
      );
      await expect(
        page.getByRole('link', { name: 'English, sitio oficial en inglés' }),
      ).toHaveAttribute('href', 'https://bindingsoftware.com/en/');
      for (const link of await page.locator('header a:visible').all()) {
        // Enfocar el logotipo cierra el menú por focusout. Volver a abrirlo antes
        // de comprobar un enlace que pertenece a su panel, como haría el usuario.
        if (width < 961 && !(await link.isVisible())) {
          await summary.focus();
          await page.keyboard.press('Enter');
        }
        await link.focus();
        await expect(link).toHaveCSS('outline-width', '3px');
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 320) {
        await page.setViewportSize({ width: 1280, height: 1000 });
        const zoomStyle = await page.addStyleTag({
          content: 'html {font-size:200% !important}',
        });
        await noOverflow(page);
        await zoomStyle.evaluate((el) => (el as HTMLStyleElement).remove());
        await page.setViewportSize({ width: 320, height: 1000 });
        const spacing = await page.addStyleTag({
          content:
            '* {line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important}',
        });
        await noOverflow(page);
        await spacing.evaluate((el) => (el as HTMLStyleElement).remove());
      }
      if (width === 390) {
        await page.screenshot({
          path: evidenceDir + '/' + route.slug + '-menu-390.png',
          fullPage: true,
        });
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        await writeFile(
          evidenceDir + '/axe-' + route.slug + '-menu.json',
          JSON.stringify(
            { violations: axe.violations, incomplete: axe.incomplete },
            null,
            2,
          ),
        );
        expect(axe.violations).toEqual([]);
      }
      if (width < 961) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect(summary).toBeHidden();
        await expect(
          page.getByRole('navigation', { name: 'Principal' }),
        ).toHaveCount(1);
        await page.setViewportSize({ width, height: 1000 });
        if (
          !(await page
            .locator('details')
            .evaluate((el) => (el as HTMLDetailsElement).open))
        ) {
          await summary.focus();
          await page.keyboard.press('Enter');
        }
        await expect(page.locator('details')).toHaveAttribute('open', '');
        await summary.focus();
        await page.keyboard.press('Space');
        await expect(page.locator('details')).not.toHaveAttribute('open', '');
        await expect(summary).toBeFocused();
        await page.keyboard.press('Tab');
        expect(
          await page.evaluate(
            () => !!document.activeElement?.closest('header'),
          ),
        ).toBe(false);
      }
    });
  }

for (const width of [390, 1440]) {
  test(
    'entrada única visible, contraste y foco a ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addInitScript(() =>
        document.addEventListener(
          'DOMContentLoaded',
          () => document.getAnimations().forEach((a) => a.pause()),
          { once: true },
        ),
      );
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const animations = await page.evaluate(() =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a instanceof CSSAnimation &&
              a.animationName.includes('hero-arrive'),
          )
          .map((a) => ({
            timing: a.effect!.getTiming(),
            name: (a as CSSAnimation).animationName,
          })),
      );
      expect(animations).toHaveLength(3);
      for (const a of animations) {
        expect(a.timing.iterations).toBe(1);
        expect(a.timing.duration).toBe(560);
      }
      expect(
        animations.map((a) => a.timing.delay ?? 0).sort((a, b) => a - b),
      ).toEqual([0, 120, 240]);
      for (const time of [0, 180]) {
        await page.evaluate(
          (t) => document.getAnimations().forEach((a) => (a.currentTime = t)),
          time,
        );
        const readable = await page
          .locator('.hero h1,.hero .lead,.hero-actions')
          .evaluateAll((els) =>
            els.every(
              (el) =>
                getComputedStyle(el).opacity === '1' &&
                getComputedStyle(el).visibility === 'visible',
            ),
          );
        expect(readable).toBe(true);
        await page.screenshot({
          path: evidenceDir + '/entrada-' + width + '-' + time + 'ms.png',
        });
        if (time === 0)
          await verifyHeroContrast(page, width, 'contraste-entrada-' + width);
      }
      await page.evaluate(() =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a instanceof CSSAnimation &&
              a.animationName.includes('hero-arrive'),
          )
          .forEach((a) => {
            a.currentTime = 0;
            a.play();
          }),
      );
      await page.waitForFunction(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a instanceof CSSAnimation &&
                a.animationName.includes('hero-arrive'),
            ).length === 0,
      );
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => scrollTo(0, 0));
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (a) =>
                  a instanceof CSSAnimation &&
                  a.animationName.includes('hero-arrive'),
              ).length,
        ),
      ).toBe(0);
      await page.reload();
      // El hook de inspección pausa también las animaciones tras reload. Reanudar
      // las del hero antes de comprobar su ciclo real y la neutralización por foco.
      await page.evaluate(() =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a instanceof CSSAnimation &&
              a.animationName.includes('hero-arrive'),
          )
          .forEach((a) => a.play()),
      );
      await page
        .locator('.hero')
        .getByRole('link', { name: 'Solicitar información' })
        .focus();
      await expect(
        page
          .locator('.hero')
          .getByRole('link', { name: 'Solicitar información' }),
      ).toBeFocused();
      const focusedEntry = await page
        .locator('.hero h1,.hero .lead,.hero-actions')
        .evaluateAll((els) =>
          els.every((el) => getComputedStyle(el).transform === 'none'),
        );
      expect(focusedEntry).toBe(true);
      await page.waitForTimeout(900);
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (a) =>
                  a instanceof CSSAnimation &&
                  a.animationName.includes('hero-arrive'),
              ).length,
        ),
      ).toBe(0);
    },
  );
}
for (const route of routes) {
  test(
    route.slug + ': reduced-motion y fallback sin animaciones',
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.goto(route.path);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0,
      );
      await page.locator('header summary').click();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0,
      );
      await expect(
        page.getByRole('navigation', { name: 'Principal' }),
      ).toBeVisible();
      await page.locator('header summary').click();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addStyleTag({
        content:
          '*,*::before,*::after {animation:none !important;transition:none !important}',
      });
      await page.locator('header summary').click();
      await expect(
        page.getByRole('navigation', { name: 'Principal' }),
      ).toBeVisible();
      await noOverflow(page);
      if (route.slug === 'landing')
        for (const el of await page
          .locator('.hero h1,.hero .lead,.hero .button')
          .all()) {
          await expect(el).toBeVisible();
          await expect(el).toHaveCSS('opacity', '1');
        }
    },
  );
}
