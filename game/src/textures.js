// Procedural textures drawn on canvases at load: no image files, no network. Each is seeded, so every
// run paints the same harbour: asphalt, concrete, brick, corrugated container steel, crate planks,
// painted signs and the site letters.
import * as THREE from 'three';
import { createRng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}

function grain(g, w, h, rng, count, alpha, dark = true) {
  for (let i = 0; i < count; i += 1) {
    const v = dark ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rng() * alpha})`;
    g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function asphalt(seed) {
  const rng = createRng(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#3b3a38'; g.fillRect(0, 0, 512, 512);
  grain(g, 512, 512, rng, 9000, 0.35);
  grain(g, 512, 512, rng, 4000, 0.12, false);
  g.strokeStyle = 'rgba(20,20,20,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) { // tar-sealed cracks
    g.beginPath();
    let x = rng() * 512; let y = rng() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 8; k += 1) { x += rng.range(-40, 40); y += rng.range(-40, 40); g.lineTo(x, y); }
    g.stroke();
  }
  return finish(c);
}

function concrete(seed, base) {
  const rng = createRng(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  grain(g, 512, 512, rng, 7000, 0.18);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < 512; y += 128) g.fillRect(0, y, 512, 3);          // pour joints
  for (let x = 0; x < 512; x += 256) g.fillRect(x, 0, 3, 512);
  const grad = g.createLinearGradient(0, 380, 0, 512);                   // grime at the foot of the wall
  grad.addColorStop(0, 'rgba(30,25,20,0)'); grad.addColorStop(1, 'rgba(30,25,20,0.45)');
  g.fillStyle = grad; g.fillRect(0, 380, 512, 132);
  return finish(c);
}

function brick(seed) {
  const rng = createRng(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#5a4a40'; g.fillRect(0, 0, 512, 512);
  const bw = 64; const bh = 24;
  for (let row = 0; row < 512 / bh; row += 1) {
    for (let col = -1; col < 512 / bw + 1; col += 1) {
      const x = col * bw + (row % 2) * bw / 2; const y = row * bh;
      const shade = rng.range(0.75, 1.1);
      g.fillStyle = `rgb(${Math.round(128 * shade)},${Math.round(62 * shade)},${Math.round(46 * shade)})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  grain(g, 512, 512, rng, 5000, 0.2);
  return finish(c);
}

function corrugated(seed, color) {
  const rng = createRng(seed);
  const [c, g] = canvas(512, 256);
  g.fillStyle = color; g.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 16) {
    const grad = g.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0.10)');
    g.fillStyle = grad; g.fillRect(x, 0, 16, 256);
  }
  for (let i = 0; i < 40; i += 1) { // rust streaks
    g.fillStyle = `rgba(110,52,24,${rng() * 0.35})`;
    g.fillRect(rng() * 512, rng() * 60, 2 + rng() * 3, 40 + rng() * 160);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 250, 512, 6);
  grain(g, 512, 256, rng, 2500, 0.2);
  return finish(c);
}

function planks(seed) {
  const rng = createRng(seed);
  const [c, g] = canvas(256, 256);
  for (let i = 0; i < 8; i += 1) {
    const s = rng.range(0.8, 1.1);
    g.fillStyle = `rgb(${Math.round(150 * s)},${Math.round(112 * s)},${Math.round(70 * s)})`;
    g.fillRect(0, i * 32, 256, 31);
    g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, i * 32 + 30, 256, 2);
  }
  g.strokeStyle = 'rgba(60,40,20,0.85)'; g.lineWidth = 14;
  g.strokeRect(7, 7, 242, 242);
  g.beginPath(); g.moveTo(10, 10); g.lineTo(246, 246); g.stroke();
  grain(g, 256, 256, rng, 2500, 0.25);
  return finish(c);
}

function metal(seed) {
  const rng = createRng(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#56636a'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`; g.fillRect(0, y, 256, 1); }
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let x = 16; x < 256; x += 48) for (let y = 16; y < 256; y += 48) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  grain(g, 256, 256, rng, 1500, 0.2);
  return finish(c);
}

// Sets the largest font (from `size` down) at which `text` fits in `maxWidth` pixels.
function fitFont(g, text, pattern, size, maxWidth) {
  let s = size;
  do { g.font = pattern.replace('{}', s); s -= 2; } while (s > 10 && g.measureText(text).width > maxWidth);
}

// A painted sign: text on a coloured board, used for callouts on walls.
function signTexture(text, sub, bg, fg) {
  const [c, g] = canvas(512, 160);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, text, 'bold {}px "Arial Black", Impact, sans-serif', 60, 452);
  g.fillText(text, 256, sub ? 66 : 82);
  if (sub) { fitFont(g, sub, 'bold {}px Arial, sans-serif', 28, 440); g.fillText(sub, 256, 120); }
  for (const [x, y] of [[24, 24], [488, 24], [24, 136], [488, 136]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  grain(g, 512, 160, createRng(text.length * 31), 900, 0.18); // weathering
  return finish(c, false);
}

// A big stencilled site letter for the ground.
function letterTexture(letter, color) {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = color; g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 170px "Arial Black", Impact, sans-serif';
  g.fillText(letter, 128, 140);
  return finish(c, false);
}

export function createTextures() {
  return {
    asphalt: asphalt(11),
    pier: concrete(12, '#77736b'),
    concrete: concrete(13, '#8d8679'),
    darkConcrete: concrete(14, '#5d5a55'),
    brick: brick(15),
    containers: ['#2f7a83', '#a8432c', '#c4932c', '#2d4a6b', '#5b7d3a'].map((col, i) => corrugated(20 + i, col)),
    planks: planks(30),
    metal: metal(31),
    sign: signTexture,
    letter: letterTexture,
  };
}
