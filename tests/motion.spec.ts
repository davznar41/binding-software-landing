import {
  test,
  expect,
  chromium,
  firefox,
  webkit,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence = process.env.EVIDENCE_DIR || 'artifacts/quality';
const engines = { chromium, firefox, webkit };
type MotionAudit = {
  starts: { name: string; target: string; pseudo: string; time: number }[];
  cls: number | null;
};
type AuditWindow = Window & typeof globalThis & { motionAudit: MotionAudit };

async function settle(page: Page, selector: string) {
  await page
    .locator(selector)
    .evaluate((el) =>
      scrollTo(
        0,
        el.getBoundingClientRect().top +
          scrollY -
          document.querySelector('header')!.getBoundingClientRect().height -
          24,
      ),
    );
  await expect
    .poll(
      () =>
        page.locator(selector).evaluate((el) => {
          const t = getComputedStyle(el).transform;
          return t === 'none' ? 0 : Math.abs(new DOMMatrix(t).m42);
        }),
      { timeout: 3000 },
    )
    .toBeLessThan(0.1);
}

for (const [name, engine] of Object.entries(engines))
  for (const width of [320, 390, 1440]) {
    test(`${name}: movimiento progresivo, teclado y fallback ${width}px`, async () => {
      const browser = await engine.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'no-preference',
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const audit: MotionAudit = { starts: [], cls: null };
        (window as AuditWindow).motionAudit = audit;
        document.addEventListener('animationstart', (event) =>
          audit.starts.push({
            name: event.animationName,
            target: (event.target as Element).className,
            pseudo: event.pseudoElement,
            time: performance.now(),
          }),
        );
        if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
          audit.cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              const shift = e as PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
              };
              if (!shift.hadRecentInput) audit.cls! += shift.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        }
      });
      await page.goto('http://127.0.0.1:4322/');
      await page.evaluate(() => document.fonts.ready);
      const support = await page.evaluate(() => ({
        view: CSS.supports('animation-timeline', 'view()'),
        trigger: CSS.supports(
          'animation-trigger',
          '--binding-solutions play-once',
        ),
      }));
      const initialValues = await page
        .locator('.result-value,.saving-amount')
        .allTextContents();
      const visible = await page
        .locator(
          '.hero h1,.hero .lead,.hero-actions,.solutions-panel,.step-number,.economic-impact',
        )
        .evaluateAll((els) =>
          els.every((el) => {
            const s = getComputedStyle(el);
            return (
              s.opacity === '1' &&
              s.visibility === 'visible' &&
              s.display !== 'none'
            );
          }),
        );
      expect(visible).toBe(true);
      await settle(page, '.solutions-panel');
      await settle(page, '#proceso ol');
      await page.waitForTimeout(900);
      await expect
        .poll(() =>
          page.locator('.step-number').evaluateAll((els) =>
            Math.max(
              ...els.map((el) => {
                const t = getComputedStyle(el).transform;
                return t === 'none' ? 0 : Math.abs(new DOMMatrix(t).m42);
              }),
            ),
          ),
        )
        .toBeLessThan(0.1);
      await settle(page, '.economic-impact');
      const beforeReturn = await page.evaluate(
        () => (window as AuditWindow).motionAudit.starts.length,
      );
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      await settle(page, '.solutions-panel');
      await page.waitForTimeout(650);
      const audit = await page.evaluate(
        () => (window as AuditWindow).motionAudit,
      );
      if (support.trigger) {
        expect(audit.starts.length).toBe(beforeReturn);
        expect(
          audit.starts.filter((s) => s.name === 'solutions-arrive'),
        ).toHaveLength(1);
      }
      expect(
        await page.locator('.result-value,.saving-amount').allTextContents(),
      ).toEqual(initialValues);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (audit.cls !== null) expect(audit.cls).toBeLessThan(0.01);
      await page.locator('.integration-brands a').first().focus();
      await expect(page.locator('.integration-brands a').first()).toHaveCSS(
        'outline-width',
        '3px',
      );
      await expect(page.locator('.solutions-panel')).toHaveCSS(
        'transform',
        'none',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0,
      );
      for (const route of ['/', '/accesibilidad/']) {
        await page.goto('http://127.0.0.1:4322' + route);
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        // WebKit Windows de este entorno no alcanza enlaces con Tab/Alt+Tab desde
        // BODY. Se verifica su activación/foco explícito, sin atribuirle un recorrido
        // inicial de Tab superado. Chromium/Firefox sí verifican el acceso inicial.
        if (name === 'webkit')
          await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
        else await page.keyboard.press('Tab');
        await expect(
          page.getByRole('link', { name: 'Saltar al contenido' }),
        ).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('main')).toBeFocused();
        if (width < 961) {
          await page.locator('summary').focus();
          await page.keyboard.press('Enter');
          await expect(page.locator('.mobile-panel')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.locator('summary')).toBeFocused();
        }
        if (width === 390 && name !== 'chromium') {
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          await mkdir(evidence, { recursive: true });
          await writeFile(
            `${evidence}/axe-${name}-${route === '/' ? 'landing' : 'accesibilidad'}.json`,
            JSON.stringify(
              { violations: axe.violations, incomplete: axe.incomplete },
              null,
              2,
            ),
          );
          expect(axe.violations).toEqual([]);
        }
      }
      await page.goto('http://127.0.0.1:4322/');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation:none!important;transition:none!important}',
      });
      await page.locator('.solutions-panel').scrollIntoViewIfNeeded();
      await expect(page.locator('.solutions-panel')).toHaveCSS(
        'transform',
        'none',
      );
      expect(await page.locator('.solutions-panel').innerText()).toContain(
        'Servicios complementarios',
      );
      await mkdir(evidence, { recursive: true });
      await writeFile(
        `${evidence}/motor-${name}-${width}.json`,
        JSON.stringify(
          {
            engine: name,
            version: browser.version(),
            width,
            support,
            audit,
            initialValues,
            keyboardInitialTab:
              name === 'webkit'
                ? 'No validado: limitación de WebKit Windows; activación y foco explícito comprobados'
                : 'Tab inicial y salto comprobados',
          },
          null,
          2,
        ),
      );
      await browser.close();
    });
  }

test('CSS de scroll sin JS, valores estables y contexto antes de las métricas', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 900 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/');
  await settle(page, '.solutions-panel');
  await expect(page.locator('.identity-proposition')).toBeVisible();
  const order = await page.evaluate(() => {
    const context = document.querySelector('.results-context')!,
      metrics = document.querySelector('.operational-results')!;
    return Boolean(
      context.compareDocumentPosition(metrics) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(order).toBe(true);
  await page.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mobile-panel')).toBeVisible();
  expect(
    await page
      .locator('header')
      .evaluate((el) => el.classList.contains('menu-enhanced')),
  ).toBe(false);
  await context.close();
});
