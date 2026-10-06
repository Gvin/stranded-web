// Builds the game, serves it with `vite preview` and screenshots it in headless Chrome, for the ui-verifier agent.
// Run from anywhere: node .claude/scripts/verify-ui.mjs [options]
//
//   --viewports phone,desktop   sizes to check: phone 390×844 with touch, desktop 1280×900 (default: both)
//   --times morning,night       clock times: dawn 06:00, morning 09:00, afternoon 14:00, evening 19:00, night 23:00
//                               (default: morning,night)
//   --weather rainy             weather to force: clear, cloudy, windy, rainy, stormy (default: what the new game rolled)
//   --tabs Explore,Bag          panels to screenshot, or "none" (default: all; desktop always shows Explore)
//   --setup file.mjs            module whose default export changes the saved state before it loads: (state) => void
//   --steps file.mjs            module whose default export drives the page afterwards: async (page, helpers) => void
//   --label hut-night           folder name for this run's screenshots, so several runs can be kept (default: latest)
//   --no-build                  serve the existing dist/ folder as it is
//
// playwright-core is installed once into <temp>/stranded-verify, never into the repo, and drives the installed
// Chrome (or Edge); CHROME_PATH overrides the browser. Screenshots go to <temp>/stranded-verify/shots/<label>, which
// each run with that label empties first: one screen-sized "screen" shot per viewport and time, as the player first
// sees it, then a full-page shot per panel. Full-page shots hide the phone's bottom tab bar and let the desktop's right
// column grow to its full height, so nothing is covered or cut off. Prints a JSON report: screenshots, page and console
// errors, and pages wider than the screen.
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORK_DIR = join(tmpdir(), 'stranded-verify');
const LONG_PRESS_MS = 700;
/** Applied during full-page shots only (see the header). */
const FULL_PAGE_CSS =
  '.tabs--bottom { visibility: hidden !important; } ' +
  '.game__column:last-child { position: static !important; max-height: none !important; overflow: visible !important; }';
const SAVE_KEY = 'stranded.save';
/** The game starts at 07:00 on day 1 (START_HOUR in src/engine/time.ts). */
const START_HOUR = 7;
const TIMES = { dawn: 6, morning: 9, afternoon: 14, evening: 19, night: 23 };
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
};
const TABS = ['Explore', 'Bag', 'Body', 'Craft', 'Journal'];

const log = (...args) => console.error('[verify-ui]', ...args);

function parseArgs(argv) {
  const options = { viewports: ['phone', 'desktop'], times: ['morning', 'night'], tabs: TABS, build: true, label: 'latest' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) {
        throw new Error(`${name} needs a value`);
      }
      return next;
    };
    const list = () =>
      value()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (name === '--viewports') options.viewports = list();
    else if (name === '--times') options.times = list();
    else if (name === '--weather') options.weather = value();
    else if (name === '--tabs') options.tabs = list().filter((t) => t.toLowerCase() !== 'none');
    else if (name === '--setup') options.setup = resolve(value());
    else if (name === '--steps') options.steps = resolve(value());
    else if (name === '--label') options.label = value().replace(/[^A-Za-z0-9_-]/g, '-');
    else if (name === '--no-build') options.build = false;
    else throw new Error(`Unknown option ${name}`);
  }
  for (const v of options.viewports) if (!VIEWPORTS[v]) throw new Error(`Unknown viewport ${v}`);
  for (const t of options.times) if (TIMES[t] === undefined) throw new Error(`Unknown time ${t}`);
  return options;
}

function loadPlaywright() {
  const requireFromWork = createRequire(join(WORK_DIR, 'package.json'));
  try {
    return requireFromWork('playwright-core');
  } catch {
    log('Installing playwright-core into', WORK_DIR);
    mkdirSync(WORK_DIR, { recursive: true });
    if (!existsSync(join(WORK_DIR, 'package.json'))) {
      writeFileSync(join(WORK_DIR, 'package.json'), '{ "private": true }\n');
    }
    execSync('npm install --no-audit --no-fund playwright-core', { cwd: WORK_DIR, stdio: ['ignore', 2, 2] });
    return requireFromWork('playwright-core');
  }
}

async function launchBrowser(chromium) {
  if (process.env.CHROME_PATH) {
    return chromium.launch({ executablePath: process.env.CHROME_PATH });
  }
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('No Chrome or Edge found; set CHROME_PATH to a Chromium-based browser.');
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function startPreview() {
  const port = await freePort();
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  // why: node is started directly (no npm or shell in between), so killing this child stops the server on Windows too.
  const child = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => log(String(chunk).trim()));
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`vite preview exited with code ${child.exitCode}`);
    }
    try {
      if ((await fetch(url)).ok) {
        return { child, url };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('vite preview did not start within 20 seconds');
}

/** Game minutes since the start (07:00 on day 1) at the next given clock hour. */
function timeAt(hour) {
  return ((hour - START_HOUR + 24) % 24) * 60;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.build) {
    log('Building');
    execSync('npm run build', { cwd: ROOT, stdio: ['ignore', 2, 2] });
  }
  const { chromium } = loadPlaywright();
  const setup = options.setup ? (await import(pathToFileURL(options.setup).href)).default : undefined;
  const steps = options.steps ? (await import(pathToFileURL(options.steps).href)).default : undefined;
  const shotsDir = join(WORK_DIR, 'shots', options.label);
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });

  const report = { shotsDir, screenshots: [], errors: [], overflow: [], notes: [] };
  const { child, url } = await startPreview();
  const stopPreview = () => child.exitCode === null && child.kill();
  process.on('exit', stopPreview);
  let browser;
  try {
    browser = await launchBrowser(chromium);
    for (const viewportName of options.viewports) {
      for (const timeName of options.times) {
        const run = `${viewportName}-${timeName}`;
        const context = await browser.newContext(VIEWPORTS[viewportName]);
        const page = await context.newPage();
        page.on('pageerror', (e) => report.errors.push(`${run}: ${String(e)}`));
        page.on('console', (m) => m.type() === 'error' && report.errors.push(`${run}: console: ${m.text()}`));

        await page.goto(url);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        // why: a mouse click on the touch phone makes the page think a hovering mouse is present, which changes :hover styles.
        const press = (locator) => (VIEWPORTS[viewportName].hasTouch ? locator.tap() : locator.click());
        await press(page.getByRole('button', { name: 'Wake up on the beach' }));
        await page.waitForSelector('nav.tabs');

        const save = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY));
        const { state } = save;
        state.time = timeAt(TIMES[timeName]);
        state.environment = { weather: options.weather ?? state.environment.weather, until: state.time + 24 * 60 };
        if (setup) {
          await setup(state, { viewport: viewportName, time: timeName });
        }
        await page.evaluate(([key, json]) => localStorage.setItem(key, json), [SAVE_KEY, JSON.stringify(save)]);
        await page.reload();
        await page.waitForSelector('nav.tabs');
        await page.waitForTimeout(300);

        const helpers = {
          viewport: viewportName,
          time: timeName,
          /** Screenshots the whole page, or only what fits on the screen with `{ fullPage: false }`. */
          async shot(name, { fullPage = true } = {}) {
            const file = join(shotsDir, `${run}-${name}.png`);
            // why: the fixed tab bar would cover content in the middle of a full-page shot, and the sticky column would be cut.
            const style = fullPage ? await page.addStyleTag({ content: FULL_PAGE_CSS }) : undefined;
            await page.screenshot({ path: file, fullPage });
            await style?.evaluate((tag) => tag.remove());
            report.screenshots.push(file);
            const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            if (wide > 1) {
              report.overflow.push(`${run}-${name}: page is ${wide}px wider than the screen`);
            }
            return file;
          },
          /** Opens a panel by its tab label; false when the layout has no such tab (Explore on desktop). */
          async tab(label) {
            const button = page.locator('nav.tabs button', { hasText: label });
            if ((await button.count()) === 0) {
              return false;
            }
            await press(button.first());
            await page.waitForTimeout(150);
            return true;
          },
          /** Presses the first action button with this text: a tap on the phone, a click on desktop. */
          async action(text) {
            await press(page.locator('button.action', { hasText: text }).first());
            await page.waitForTimeout(150);
          },
          /** Opens the details popup of the first action button with this text: a long press on the phone, hovering on desktop. */
          async popup(text) {
            const button = page.locator('button.action', { hasText: text }).first();
            await button.scrollIntoViewIfNeeded();
            if (VIEWPORTS[viewportName].hasTouch) {
              const box = await button.boundingBox();
              const cdp = await page.context().newCDPSession(page);
              const point = { x: box.x + Math.min(30, box.width / 2), y: box.y + box.height / 2 };
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
              await page.waitForTimeout(LONG_PRESS_MS);
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            } else {
              await button.hover();
              await page.waitForTimeout(LONG_PRESS_MS);
            }
          },
          /** Taps (phone) or clicks (desktop) any Playwright locator. */
          press,
          note(text) {
            report.notes.push(`${run}: ${text}`);
          },
        };

        await helpers.shot('screen', { fullPage: false });
        for (const label of options.tabs) {
          if (await helpers.tab(label)) {
            await helpers.shot(label.toLowerCase());
          } else if (label !== 'Explore') {
            helpers.note(`no "${label}" tab`);
          } else if (options.tabs.length === 1) {
            // why: the desktop layout always shows Explore in its own column, so the other panels' shots already contain it.
            await helpers.shot('explore');
          }
        }
        if (steps) {
          await steps(page, helpers);
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    stopPreview();
  }
  writeFileSync(join(shotsDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[verify-ui] failed:', error?.stack ?? error);
  process.exit(1);
});
