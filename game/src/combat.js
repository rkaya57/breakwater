// Hits and damage. A shot is a ray: the map grid stops it, and each body is tested zone by zone (a head
// sphere, then chest, stomach and legs boxes that shrink with a crouch). Damage falls off with range,
// multiplies on the head, is cut by armour, and a kill pays the killer by the weapon that made it.
import { HITZONE, ZONE_MULT, MOVE } from './config.js';
import { raycast } from './map.js';

const hit = { actor: null, zone: -1, t: 0 };

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx; const ly = oy - cy; const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

// One axis of the slab test: narrows [span.t0, span.t1] and reports whether anything is left.
const span = { t0: 0, t1: Infinity };
function slab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d; let b = (hi - o) / d;
  if (a > b) { const s = a; a = b; b = s; }
  if (a > span.t0) span.t0 = a;
  if (b < span.t1) span.t1 = b;
  return span.t0 <= span.t1;
}

function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  span.t0 = 0; span.t1 = Infinity;
  if (!slab(ox, dx, minX, maxX) || !slab(oy, dy, minY, maxY) || !slab(oz, dz, minZ, maxZ)) return Infinity;
  return span.t0;
}

// Body zones as [zone, half width, bottom, top] for a standing body; a crouch scales them down.
const BODY = [[HITZONE.CHEST, 0.26, 1.08, 1.5], [HITZONE.STOMACH, 0.23, 0.8, 1.08], [HITZONE.LEGS, 0.2, 0, 0.8]];
const bodyHit = { t: 0, zone: -1 };

function testBody(actor, ox, oy, oz, dx, dy, dz) {
  const s = actor.eye / MOVE.eye;
  const x = actor.x; const y = actor.y; const z = actor.z;
  let best = raySphere(ox, oy, oz, dx, dy, dz, x, y + actor.eye + 0.06, z, 0.17);
  let zone = best < Infinity ? HITZONE.HEAD : -1;
  for (let i = 0; i < BODY.length; i += 1) {
    const [z2, half, y0, y1] = BODY[i];
    const t = rayBox(ox, oy, oz, dx, dy, dz, x - half, y + y0 * s, z - half, x + half, y + y1 * s, z + half);
    if (t < best) { best = t; zone = z2; }
  }
  if (zone < 0) return null;
  bodyHit.t = best; bodyHit.zone = zone;
  return bodyHit;
}

// Traces one bullet. Returns the shared hit record: actor (or null for the map), zone and distance.
export function traceShot(state, shooter, ox, oy, oz, dx, dy, dz, range) {
  const wall = raycast(ox, oy, oz, dx, dy, dz, range);
  hit.actor = null; hit.zone = -1; hit.t = wall;
  for (const a of state.actors) {
    if (!a.alive || a === shooter) continue;
    const r = testBody(a, ox, oy, oz, dx, dy, dz);
    if (r && r.t < hit.t) { hit.actor = a; hit.zone = r.zone; hit.t = r.t; }
  }
  return hit;
}

const dmgOut = { damage: 0, armorLoss: 0 };
export function computeDamage(weapon, zone, distance, target) {
  let dmg = weapon.damage * Math.pow(weapon.falloff, distance / 10);
  dmg *= zone === HITZONE.HEAD ? weapon.headMult : ZONE_MULT[zone];
  let armorLoss = 0;
  const armored = target.armor > 0 && zone !== HITZONE.LEGS && (zone !== HITZONE.HEAD || target.helmet);
  if (armored) {
    const reduced = dmg * weapon.armorPen;
    armorLoss = (dmg - reduced) * 0.5;
    dmg = reduced;
  }
  dmgOut.damage = Math.round(dmg); dmgOut.armorLoss = armorLoss;
  return dmgOut;
}

// Applies damage from any source; a kill is credited, paid and announced.
export function applyDamage(state, target, amount, armorLoss, attacker, weaponName, zone, killReward) {
  if (!target.alive || amount <= 0) return false;
  if (attacker && attacker !== target && attacker.team === target.team) return false; // no friendly fire
  const taken = Math.min(target.health, amount);
  target.health -= amount;
  target.armor = Math.max(0, target.armor - armorLoss);
  if (attacker) {
    attacker.roundDamage += taken;
    target.lastHurtBy = attacker;
    target.lastHurtYaw = Math.atan2(attacker.x - target.x, attacker.z - target.z);
  }
  target.hurtTime = state.time;
  state.events.emit('hurt', { actor: attacker, target, value: taken, x: target.x, y: target.y + (zone === HITZONE.HEAD ? target.eye : 1.1), z: target.z, flag: zone === HITZONE.HEAD });
  if (target.health > 0) return false;

  target.health = 0;
  target.alive = false;
  target.deaths += 1;
  target.deathTime = state.time;
  target.scoped = false;
  if (attacker && attacker !== target) {
    attacker.kills += 1;
    attacker.roundKills += 1;
    attacker.money = Math.min(attacker.money + killReward, 12000);
  }
  if (target.hasBomb) {
    target.hasBomb = false;
    const b = state.bomb;
    b.state = 'dropped'; b.carrier = null; b.x = target.x; b.y = target.y; b.z = target.z;
    state.events.emit('bombDropped', { actor: target, x: target.x, y: target.y, z: target.z });
  }
  state.events.emit('kill', { actor: attacker, target, text: weaponName, flag: zone === HITZONE.HEAD, x: target.x, y: target.y, z: target.z });
  return true;
}
