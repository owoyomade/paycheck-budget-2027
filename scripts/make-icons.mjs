// Draws the app icon (a ticked calendar page) as PNGs with no image dependencies.
// Run with `npm run icons`; output goes to site/icons/. Keep the shape in step with site/icons/icon.svg.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [0x0d, 0x10, 0x17];
const PAPER = [0xff, 0xff, 0xff];
const COBALT = [0x25, 0x46, 0xf0];
const SS = 4; // supersampling per axis, for smooth edges

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shapes in a 0..40 unit box, matching icon.svg.
function inRoundedRect(u, v, [x, y, w, h], r) {
  if (u < x || u > x + w || v < y || v > y + h) return false;
  const dx = Math.max(x + r - u, 0, u - (x + w - r)), dy = Math.max(y + r - v, 0, v - (y + h - r));
  return dx * dx + dy * dy <= r * r;
}
function nearSegment(u, v, [ax, ay], [bx, by], r) {
  const t = Math.max(0, Math.min(1, ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return (u - ax - t * (bx - ax)) ** 2 + (v - ay - t * (by - ay)) ** 2 <= r * r;
}
const CHECK = [[14, 23.5], [18.5, 27.5], [26, 19.5]];
function sample(u, v, { rounded, scale }) {
  if (rounded && !inRoundedRect(u, v, [0, 0, 40, 40], 10)) return null;
  const cu = 20 + (u - 20) / scale, cv = 20 + (v - 20) / scale;
  if (!inRoundedRect(cu, cv, [9, 10, 22, 21], 3)) return INK;
  if (cv >= 15 && cv <= 16.8) return INK;
  if (nearSegment(cu, cv, CHECK[0], CHECK[1], 1.4) || nearSegment(cu, cv, CHECK[1], CHECK[2], 1.4)) return COBALT;
  return PAPER;
}
function draw(size, opts) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = sample(((px + (sx + 0.5) / SS) / size) * 40, ((py + (sy + 0.5) / SS) / size) * 40, opts);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (py * size + px) * 4;
    if (a) { out[i] = r / a; out[i + 1] = g / a; out[i + 2] = b / a; }
    out[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
  return png(size, out);
}

const dir = new URL('../site/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
// Rounded icons for browsers; full-bleed ones for Android's maskable shape and iOS (which rounds its own corners).
writeFileSync(new URL('icon-192.png', dir), draw(192, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-512.png', dir), draw(512, { rounded: true, scale: 1 }));
writeFileSync(new URL('maskable-512.png', dir), draw(512, { rounded: false, scale: 0.8 }));
writeFileSync(new URL('apple-touch-icon.png', dir), draw(180, { rounded: false, scale: 1 }));
console.log('Icons written to site/icons/');
