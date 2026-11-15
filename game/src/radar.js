// The radar: the map grid painted once to an offscreen canvas, then each frame the player's arrow,
// living teammates, enemies someone on the team can see or just heard fire, and the charge.
import { COLS, ROWS, KIND, kindAt, zoneLabels, SITE_RECTS, ORIGIN_X, ORIGIN_Z } from './map.js';
import { CELL, TEAMS } from './config.js';

const PX = 5; // pixels per cell on the base layer
const MINOR = new Set(['Loft Stairs', 'Market Gate', 'Culvert Mouth']); // too small to label on the overview

function paintBase() {
  const c = document.createElement('canvas');
  c.width = COLS * PX; c.height = ROWS * PX;
  const g = c.getContext('2d');
  const colors = { [KIND.FLOOR]: '#4a4d4f', [KIND.WALL]: '#1c1e20', [KIND.CONTAINER]: '#2b3437', [KIND.CRATE]: '#5b4e3c', [KIND.STACK]: '#3d3428', [KIND.MACHINE]: '#3a2d2a', [KIND.RAIL]: '#c9a43c', [KIND.VOID]: '#103038' };
  for (let r = 0; r < ROWS; r += 1) for (let c2 = 0; c2 < COLS; c2 += 1) {
    g.fillStyle = colors[kindAt(c2, r)];
    g.fillRect(c2 * PX, r * PX, PX, PX);
  }
  for (const site of ['A', 'B']) {
    const [c0, r0, c1, r1] = SITE_RECTS[site];
    g.fillStyle = 'rgba(242,193,78,0.18)';
    g.fillRect(c0 * PX, r0 * PX, (c1 - c0 + 1) * PX, (r1 - r0 + 1) * PX);
    g.fillStyle = '#f2c14e'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(site, (c0 + c1 + 1) / 2 * PX, (r0 + r1 + 1) / 2 * PX);
  }
  return c;
}

export function createRadar(canvasEl) {
  const base = paintBase();
  const g = canvasEl.getContext('2d');
  const size = canvasEl.width;
  const scale = PX / CELL; // pixels per metre on the base layer
  const zoom = 1.45;

  const pt = [0, 0]; // reused: the radar draws every frame
  function toBase(x, z) { pt[0] = (x - ORIGIN_X) * scale; pt[1] = (z - ORIGIN_Z) * scale; return pt; }

  function draw(state, viewer) {
    g.save();
    g.clearRect(0, 0, size, size);
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0e2a30'; g.fillRect(0, 0, size, size);
    const [vx, vz] = toBase(viewer.x, viewer.z);
    g.translate(size / 2, size / 2);
    g.scale(zoom, zoom);
    g.translate(-vx, -vz);
    g.drawImage(base, 0, 0);
    const mine = viewer.team;
    for (const a of state.actors) {
      if (!a.alive || a === viewer) continue;
      let shown = a.team === mine;
      if (!shown) {
        shown = a.sinceShot < 1.2;
        for (const m of state.actors) if (m.alive && m.team === mine && m.brain && m.brain.target === a) shown = true;
      }
      if (!shown) continue;
      const [x, z] = toBase(a.x, a.z);
      g.fillStyle = a.team === mine ? TEAMS[mine].ui : '#ff4b3a';
      g.beginPath(); g.arc(x, z, 3.2, 0, Math.PI * 2); g.fill();
      if (a.hasBomb && a.team === mine) { g.strokeStyle = '#ffd36b'; g.lineWidth = 1.5; g.stroke(); }
    }
    const b = state.bomb;
    if (b.state === 'planted' || b.state === 'dropped') {
      const [x, z] = toBase(b.x, b.z);
      g.fillStyle = b.state === 'planted' && Math.floor(state.time * 4) % 2 ? '#ff3a20' : '#ffd36b';
      g.fillRect(x - 3, z - 3, 6, 6);
    }
    // the viewer's arrow
    g.translate(vx, vz);
    g.rotate(-viewer.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(0, 2); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.stroke();
  }

  // The whole map at once, for the scoreboard: zones named, sites marked.
  function drawOverview(canvas) {
    const o = canvas.getContext('2d');
    const s = canvas.width / base.width;
    o.imageSmoothingEnabled = false;
    o.drawImage(base, 0, 0, canvas.width, canvas.height);
    o.fillStyle = 'rgba(233,230,223,0.9)'; o.font = '600 11px system-ui'; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.shadowColor = '#000'; o.shadowBlur = 3;
    for (const z of zoneLabels()) {
      if (z.site || MINOR.has(z.name)) continue;
      const [x, y] = toBase(z.x, z.z);
      o.fillText(z.name.toUpperCase(), x * s, y * s);
    }
  }

  return { draw, drawOverview };
}
