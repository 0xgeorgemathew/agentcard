/**
 * make-grain.mjs — generate a fine, warm, static film-grain texture.
 *
 * Zero dependencies: encodes an 8-bit RGBA PNG by hand using only Node's
 * `zlib` (for deflate) and a self-contained CRC32. The result is a seamless
 * high-frequency noise that, rendered fullscreen at very low opacity, gives the
 * warm cream canvas a subtle physical tooth — invisible at a glance, perceptible
 * only through the movement of the ambient light.
 *
 *   RGB   — warm near-black ink (the speckle colour)
 *   Alpha — per-pixel pseudo-random noise, full range (final opacity is set in
 *           the GrainOverlay component so it can be tuned without regenerating)
 *
 * Run:  node scripts/make-grain.mjs
 */
import zlib from 'zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets', 'grain.png');

// Square tile — stretched to fill the screen in GrainOverlay. Large enough that
// the upscaling on a portrait phone stays imperceptible at the ~3% render
// opacity the grain is used at.
const W = 256;
const H = 256;

// Warm near-black: the speckles read as faint warm grit on the cream canvas,
// never as cold digital noise.
const R = 42;
const G = 35;
const B = 28;

// ── Deterministic pseudo-random noise (mulberry28) ──────────────────────────
// Seeded so the texture is reproducible across runs.
function mulberry28(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the raw RGBA scanline buffer with a mild horizontal+vertical
// neighbourhood average. This softens single-pixel spikes into fine grain,
// avoiding harsh pixel clusters while staying high-frequency.
const rand = mulberry28(0xc0ffee);
const raw = new Uint8Array(W * H);
for (let i = 0; i < raw.length; i++) raw[i] = (rand() * 256) | 0;

const buf = Buffer.alloc((W * 4 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  buf[p++] = 0; // filter type: None
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // Average this pixel with its right and down neighbours (wrap) for a gentle
    // low-pass that kills isolated 1px spikes without smearing the grain.
    const a = raw[i];
    const b = raw[y * W + ((x + 1) % W)];
    const c = raw[((y + 1) % H) * W + x];
    const m = ((a + b + c) / 3) | 0;
    buf[p++] = R;
    buf[p++] = G;
    buf[p++] = B;
    buf[p++] = m; // alpha carries the noise; full 0..255 range
  }
}

// ── Minimal PNG encoder (RGBA, 8-bit) ───────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const idat = zlib.deflateSync(buf, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes, ${W}x${H} RGBA)`);
