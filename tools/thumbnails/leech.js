/* Draw the animated Leech explorer thumbnail from the explorer's own model.

   The picture cuts between three still views of all 196,560 balls, the
   explorer's 30-fold, 36-fold and 42-fold presets, holding each for 1 s.
   Every ball is a white disc of radius 1.2 px on black, drawn at 240 px so
   the 120 px thumbnail stays sharp on a high-density screen. A lone ball is
   at least 60% white, and where balls pile up the disc grows brighter with the
   log of the count. Each view fills the circle on its own, so a cut never
   changes the size of the picture.

   Three frames of 240 px greys make a small GIF, so the script writes one
   with its own encoder and needs only Node. */
'use strict';

const fs = require('fs'), path = require('path');
const E8 = require('../../app/e8/model.js');
const Leech = require('../../app/leech/lattice.js');
const Frame = require('../../app/leech/frame.js');
const LeechScenes = require('../../app/leech/scenes.js');

const VIEWS = ['rot30', 'rot36', 'rot42'], HOLD = 100; // hundredths of a second
const SIZE = 240, RADIUS = 1.2, SUPER = 4, FLOOR = 0.6, MAX_BYTES = 300 * 1024;
const SQRT8 = Math.sqrt(8);
const data = Leech.build();
const scenes = LeechScenes.build({ Leech: Leech, Frame: Frame, E8: E8, data: data });

// Splat every ball as a disc on a grid SUPER times finer, then average down.
function render(id) {
  const scene = scenes.find(item => item.id === id);
  if (!scene || scene.window !== 24) throw new Error('no 24-dimensional scene ' + id);
  const frame = Frame.complete(scene.rows);
  const xs = new Float64Array(Leech.COUNT), ys = new Float64Array(Leech.COUNT);
  let reach = 0;
  for (let i = 0; i < Leech.COUNT; i++) {
    let x = 0, y = 0;
    for (let k = 0; k < 24; k++) { const value = data.coords[i * 24 + k] / SQRT8; x += frame[0][k] * value; y += frame[1][k] * value; }
    xs[i] = x; ys[i] = y; reach = Math.max(reach, Math.hypot(x, y));
  }
  const big = SIZE * SUPER, centre = big / 2, r = RADIUS * SUPER, span = Math.ceil(r);
  const scale = (centre - (RADIUS + 2) * SUPER) / reach, count = new Float32Array(big * big);
  for (let i = 0; i < Leech.COUNT; i++) {
    const px = centre + xs[i] * scale, py = centre - ys[i] * scale;
    for (let Y = Math.floor(py - span); Y <= Math.ceil(py + span); Y++) {
      for (let X = Math.floor(px - span); X <= Math.ceil(px + span); X++) {
        if ((X + 0.5 - px) ** 2 + (Y + 0.5 - py) ** 2 <= r * r) count[Y * big + X]++;
      }
    }
  }
  const covered = Array.from(count).filter(value => value > 0).sort((a, b) => a - b);
  const ref = Math.log(1 + covered[Math.floor(covered.length * 0.995)]);
  const pixels = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (Math.hypot(x - SIZE / 2 + 0.5, y - SIZE / 2 + 0.5) > SIZE / 2 - 1) continue;
      let sum = 0;
      for (let j = 0; j < SUPER; j++) {
        for (let i = 0; i < SUPER; i++) {
          const value = count[(y * SUPER + j) * big + x * SUPER + i];
          if (value) sum += Math.max(FLOOR, Math.min(1, Math.log(1 + value) / ref));
        }
      }
      pixels[y * SIZE + x] = Math.round(255 * Math.pow(sum / (SUPER * SUPER), 0.75));
    }
  }
  return pixels;
}

// LZW-compress one frame of 8-bit palette indices into GIF sub-blocks.
function lzw(pixels) {
  const clear = 256, end = 257, out = [];
  let codeSize = 9, next = 258, dict = new Map(), bits = 0, held = 0;
  const emit = code => {
    held |= code << bits; bits += codeSize;
    while (bits >= 8) { out.push(held & 255); held >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const key = prefix * 256 + pixels[i];
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); dict = new Map(); next = 258; codeSize = 9; }
    else { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; }
    prefix = pixels[i];
  }
  emit(prefix); emit(end);
  if (bits) out.push(held & 255);
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) blocks.push(Math.min(255, out.length - i), ...out.slice(i, i + 255));
  return blocks;
}

function gif(frames) {
  const word = value => [value & 255, value >> 8];
  const bytes = [...Buffer.from('GIF89a'), ...word(SIZE), ...word(SIZE), 0xf7, 0, 0];
  for (let grey = 0; grey < 256; grey++) bytes.push(grey, grey, grey);
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const pixels of frames) {
    bytes.push(0x21, 0xf9, 4, 0, ...word(HOLD), 0, 0);
    bytes.push(0x2c, 0, 0, 0, 0, ...word(SIZE), ...word(SIZE), 0, 8, ...lzw(pixels), 0);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

const file = gif(VIEWS.map(render));
if (file.length > MAX_BYTES) throw new Error('thumbnail is ' + file.length + ' bytes, over the 300 KB budget');
const output = path.join(__dirname, '../../assets/thumbs/leech.gif');
fs.writeFileSync(output, file);
console.log(output + ' ' + file.length + ' bytes');
