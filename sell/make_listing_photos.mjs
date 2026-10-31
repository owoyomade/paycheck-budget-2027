// Saves the 12 Etsy listing photos as 2000 x 2000 PNGs in sell/listing-photos/.
// Each photo is sell/listing/studio.html?shot=N, which loads the real app from site/ in phone frames.
// Run with `npm run photos` (uses the Google Chrome already installed on this Mac).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'sell', 'listing-photos');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NAMES = ['hero', 'which-paycheck', 'smooth', 'afford', 'yearly-bills', 'bonus-paychecks', 'year-at-a-glance',
  'easy-setup', 'make-it-yours', 'works-everywhere', 'private', 'how-it-works'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

// A tiny local web server for the project folder, so the studio and the app share one address.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.includes('..') || path.startsWith('/private')) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(5181);

const only = process.argv.slice(2).map(Number).filter(Boolean);
await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
try {
  for (let n = 1; n <= NAMES.length; n++) {
    if (only.length && !only.includes(n)) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 });
    page.on('pageerror', err => console.error(`  photo ${n}:`, err.message));
    try {
      await page.goto(`http://localhost:5181/sell/listing/studio.html?shot=${n}`);
      await page.waitForFunction('window.__ready === true', { timeout: 30000 });
      const file = join(OUT, `${String(n).padStart(2, '0')}-${NAMES[n - 1]}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file.replace(ROOT, ''));
    } catch (err) {
      console.error(`photo ${n} failed: ${err.message}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
