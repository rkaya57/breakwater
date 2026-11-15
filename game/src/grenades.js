// Grenades: a lobbed body that bounces off the map grid, then a frag blast, a smoke cloud that blocks
// sight for everyone, or a flash that blinds whoever is looking at it.
import { GRENADES, BOT } from './config.js';
import { kindAt, shotHeight, colOf, rowOf, raycast } from './map.js';
import { makeNoise } from './state.js';
import { applyDamage } from './combat.js';

const POOL = 16;
const fwd = { x: 0, y: 0, z: 0 };

function grenadePool(state) {
  if (state.grenades.length === 0) {
    for (let i = 0; i < POOL; i += 1) state.grenades.push({ active: false, type: '', owner: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, spin: 0 });
  }
  return state.grenades;
}

export function throwGrenade(state, actor, type, power = 1) {
  const g = grenadePool(state).find((n) => !n.active);
  if (!g) return;
  const cp = Math.cos(actor.pitch);
  fwd.x = -Math.sin(actor.yaw) * cp; fwd.y = Math.sin(actor.pitch); fwd.z = -Math.cos(actor.yaw) * cp;
  const speed = 15 * power;
  g.active = true; g.type = type; g.owner = actor;
  g.x = actor.x + fwd.x * 0.4; g.y = actor.y + actor.eye - 0.1; g.z = actor.z + fwd.z * 0.4;
  g.vx = fwd.x * speed + actor.vx * 0.6;
  g.vy = fwd.y * speed + 2.6;
  g.vz = fwd.z * speed + actor.vz * 0.6;
  g.fuse = GRENADES[type].fuse;
  g.spin = 0;
  state.events.emit('throw', { actor, text: type, x: g.x, y: g.y, z: g.z });
}

function solidAt(x, y, z) {
  const c = colOf(x); const r = rowOf(z);
  return kindAt(c, r) !== 0 && y < shotHeight(c, r) + 0.06 || kindAt(c, r) === 7;
}

function moveGrenade(state, g, dt) {
  g.vy -= 15.5 * dt;
  const nx = g.x + g.vx * dt; const ny = g.y + g.vy * dt; const nz = g.z + g.vz * dt;
  let bounced = false;
  if (solidAt(nx, g.y, g.z)) { g.vx *= -0.45; bounced = true; } else g.x = nx;
  if (solidAt(g.x, g.y, nz)) { g.vz *= -0.45; bounced = true; } else g.z = nz;
  const floor = Math.max(0.06, solidAt(g.x, ny, g.z) ? shotHeight(colOf(g.x), rowOf(g.z)) + 0.06 : 0.06);
  if (ny <= floor) {
    g.y = floor;
    if (Math.abs(g.vy) > 1.2) bounced = true;
    g.vy = Math.abs(g.vy) * 0.32;
    g.vx *= 0.62; g.vz *= 0.62;
  } else {
    g.y = ny;
  }
  g.spin += dt * 12;
  if (bounced) {
    state.events.emit('bounce', { x: g.x, y: g.y, z: g.z });
    makeNoise(state, g.x, g.z, BOT.hearRange.bounce, g.owner.team, 'bounce');
  }
}

function lineClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  return raycast(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.05;
}

function detonate(state, g) {
  const def = GRENADES[g.type];
  state.events.emit('detonate', { actor: g.owner, text: g.type, x: g.x, y: g.y, z: g.z });
  makeNoise(state, g.x, g.z, BOT.hearRange.shot, g.owner.team, 'blast');
  if (g.type === 'frag') {
    for (const a of state.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - g.x, a.y + 1 - g.y, a.z - g.z);
      if (d > def.radius || !lineClear(g.x, g.y + 0.2, g.z, a.x, a.y + 1, a.z)) continue;
      const raw = def.damage * (1 - d / def.radius) ** 1.4;
      const dmg = a.armor > 0 ? raw * 0.6 : raw;
      applyDamage(state, a, Math.round(dmg), a.armor > 0 ? raw * 0.2 : 0, g.owner, def.name, 1, 300);
    }
  } else if (g.type === 'smoke') {
    state.smokes.push({ x: g.x, y: Math.max(1.2, g.y), z: g.z, born: state.time, life: def.duration, radius: def.radius });
  } else if (g.type === 'flash') {
    for (const a of state.actors) {
      if (!a.alive) continue;
      const ey = a.y + a.eye;
      const dx = g.x - a.x; const dy = g.y - ey; const dz = g.z - a.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > def.radius || !lineClear(a.x, ey, a.z, g.x, g.y + 0.1, g.z) || smokeBlocks(state, a.x, ey, a.z, g.x, g.y, g.z)) continue;
      const cp = Math.cos(a.pitch);
      const facing = (-Math.sin(a.yaw) * cp * dx + Math.sin(a.pitch) * dy - Math.cos(a.yaw) * cp * dz) / d;
      const strength = Math.max(0.12, (facing + 0.3) / 1.3) * (1 - d / def.radius * 0.6);
      const dur = def.blind * strength;
      if (dur > a.blind) { a.blind = dur; a.blindMax = dur; }
    }
  }
}

export function updateGrenades(state, dt) {
  for (const g of state.grenades) {
    if (!g.active) continue;
    moveGrenade(state, g, dt);
    g.fuse -= dt;
    if (g.fuse <= 0) { g.active = false; detonate(state, g); }
  }
  for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
    if (state.time - state.smokes[i].born > state.smokes[i].life) state.smokes.splice(i, 1);
  }
  for (const a of state.actors) if (a.blind > 0) a.blind = Math.max(0, a.blind - dt);
}

// How grown a smoke is (0..1): it billows out over its first second and thins in its last two.
export function smokeDensity(state, s) {
  const age = state.time - s.born;
  return Math.min(1, age / 1.1) * Math.min(1, (s.life - age) / 2);
}

// Does any smoke cloud sit on the segment a-b? Used for every sight check.
export function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  for (const s of state.smokes) {
    const r = s.radius * smokeDensity(state, s) * 0.92;
    if (r < 0.5) continue;
    let t = len2 > 0 ? ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - s.x; const py = ay + dy * t - s.y; const pz = az + dz * t - s.z;
    if (px * px + py * py * 2.2 + pz * pz < r * r) return true;
  }
  return false;
}
