/**
 * Capture README screenshots from the live app.
 *
 * Prerequisites (once):
 *   bun install
 *   bunx playwright install chromium
 *
 * Usage:
 *   bun run screenshots
 *
 * Writes PNGs to docs/screenshots/. For each configured pattern URL, captures
 * demo mode off (`{pattern}.png`) and demo mode on (`{pattern}-demo.png`).
 * Demo shots use a 180 mm cube and centre the camera on the demo model.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import type { Page } from 'playwright';

const ROOT = path.resolve(import.meta.dir, '..');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const VIEWPORT = { width: 960, height: 680 };
const DEVICE_SCALE_FACTOR = 2;

/** Live app URLs that define the pattern + form state for each README shot. */
const PATTERN_URLS = [
  'https://patterns.cannonbury.co.uk/?t=topographical&bv=bambu-h2c&w=200&h=200&d=200&s=148727&sc=90&oc=1&tls=15&tlt=2&pr=72&er=192&de=1&dm=cube&ds=180&dr=96&fn=',
  'https://patterns.cannonbury.co.uk/?t=perlin&bv=bambu-h2c&w=200&h=200&d=200&th=50&inv=0&s=985961&sc=60&oc=1&pr=72&er=192&de=1&dm=cube&ds=180&dr=96&fn=',
  'https://patterns.cannonbury.co.uk/?t=parallel&bv=bambu-h2c&w=200&h=200&d=200&s=533252&sc=60&oc=2&pers=0.1&htn=perlin&mrgp=8&hsp=10&hmnp=1&hmxp=60&pr=72&er=192&de=1&dm=cube&ds=180&dr=80&fn=',
  'https://patterns.cannonbury.co.uk/?t=worley&bv=bambu-h2c&w=200&h=200&d=200&th=50&inv=0&s=542321&sc=100&pr=72&er=192&de=1&dm=cube&ds=180&dr=96&fn=',
  'https://patterns.cannonbury.co.uk/?t=kintsugi&bv=bambu-h2c&w=200&h=200&d=200&s=542321&sc=60&kcw=2&kcj=1&pr=72&er=192&de=1&dm=cube&ds=180&dr=96&fn='
] as const;

/** Extra settle time after load before centering (ms). Heavier patterns need more. */
const SETTLE_MS: Record<string, number> = {
  topographical: 10000,
  parallel: 12000,
  kintsugi: 9000,
  perlin: 7000,
  worley: 8000
};

const DEFAULT_SETTLE_MS = 8000;
const DEMO_EXTRA_MS = 4000;

const withDemoMode = (rawUrl: string, enabled: boolean): string => {
  const url = new URL(rawUrl);
  url.searchParams.set('de', enabled ? '1' : '0');
  if (enabled) {
    url.searchParams.set('dm', 'cube');
    url.searchParams.set('ds', '180');
    if (!url.searchParams.get('dr')) url.searchParams.set('dr', '96');
  }
  return url.toString();
};

const patternNameFromUrl = (rawUrl: string): string => {
  const type = new URL(rawUrl).searchParams.get('t');
  if (!type) throw new Error(`Missing pattern type (t=) in URL: ${rawUrl}`);
  return type;
};

const clearPointer = async (page: Page) => {
  // Park the cursor away from camera buttons so MUI tooltips are not in the shot.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(500);
};

const centreCamera = async (page: Page, demoMode: boolean) => {
  const label = demoMode ? 'Centre on demo model' : 'Centre on pattern modifier';
  const button = page.getByRole('button', { name: label });
  await button.waitFor({ state: 'visible', timeout: 20000 });
  await button.click();
  await clearPointer(page);
  await page.waitForTimeout(400);
};

const capture = async (page: Page, rawUrl: string, demoMode: boolean) => {
  const name = patternNameFromUrl(rawUrl);
  const fileName = demoMode ? `${name}-demo.png` : `${name}.png`;
  const settleMs = (SETTLE_MS[name] ?? DEFAULT_SETTLE_MS) + (demoMode ? DEMO_EXTRA_MS : 0);
  const url = withDemoMode(rawUrl, demoMode);

  console.log(`capturing ${fileName} …`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(settleMs);
  await centreCamera(page, demoMode);

  const outPath = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: outPath, type: 'png' });
  console.log(`wrote ${outPath}`);
};

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  for (const rawUrl of PATTERN_URLS) {
    await capture(page, rawUrl, false);
    await capture(page, rawUrl, true);
  }

  await browser.close();
  console.log(`Done. ${PATTERN_URLS.length * 2} screenshots in ${OUT_DIR}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
