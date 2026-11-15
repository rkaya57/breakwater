// Weapon handling for every actor: switching, reloading, scoping, the trigger, spread and recoil.
// The camera shows the recoil kick and bullets leave along the kicked view, so a spray climbs unless
// it is pulled down, and moving or jumping widens the spread until the shooter stops.
import { MOVE, BOT, GRENADE_ORDER } from './config.js';
import { currentWeapon, makeNoise } from './state.js';
import { traceShot, computeDamage, applyDamage } from './combat.js';
import { throwGrenade } from './grenades.js';

const DEG = Math.PI / 180;
const dir = { x: 0, y: 0, z: 0 };

function viewDir(yaw, pitch, out) {
  out.x = -Math.sin(yaw) * Math.cos(pitch);
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * Math.cos(pitch);
  return out;
}

// Current cone half-angle (radians) for the weapon in hand.
export function spreadOf(actor) {
  const w = currentWeapon(actor);
  if (!w || w.def.kind === 'melee') return 0;
  const d = w.def;
  let s = d.kind === 'sniper' && !actor.scoped ? d.unscopedSpread : d.spread;
  const top = MOVE.runSpeed * d.speed;
  const moving = Math.max(0, (actor.speed / top - MOVE.accurateBelow) / (1 - MOVE.accurateBelow));
  s += d.moveSpread * Math.min(1, moving);
  if (!actor.onGround) s += d.jumpSpread;
  if (actor.crouching && actor.onGround) s *= 0.72;
  s += Math.min(actor.shotsFired, 10) * d.spread * 0.35;
  return s;
}

function hasNades(actor) {
  return actor.nades.frag + actor.nades.smoke + actor.nades.flash > 0;
}

function nextNade(actor, from) {
  const start = GRENADE_ORDER.indexOf(from);
  for (let i = 1; i <= GRENADE_ORDER.length; i += 1) {
    const type = GRENADE_ORDER[(start + i) % GRENADE_ORDER.length];
    if (actor.nades[type] > 0) return type;
  }
  return from;
}

function selectSlot(state, actor, slot) {
  if (slot === 'primary' && !actor.primary) return;
  if (slot === 'nade') {
    if (!hasNades(actor)) return;
    actor.nadeType = actor.slot === 'nade' || actor.nades[actor.nadeType] === 0 ? nextNade(actor, actor.nadeType) : actor.nadeType;
  } else if (slot === actor.slot) {
    return;
  }
  actor.slot = slot;
  actor.switchTimer = slot === 'secondary' ? 0.32 : 0.48;
  actor.reloadTimer = 0;
  actor.scoped = false;
  actor.shotsFired = 0;
  state.events.emit('switch', { actor, text: slot });
}

export function bestSlot(actor) {
  return actor.primary ? 'primary' : 'secondary';
}

function startReload(state, actor, w) {
  if (actor.reloadTimer > 0 || w.mag >= w.def.mag || w.reserve <= 0 || w.def.kind === 'melee') return;
  actor.reloadTimer = w.def.reload;
  actor.scoped = false;
  state.events.emit('reload', { actor, value: w.def.reload, x: actor.x, y: actor.y, z: actor.z });
  makeNoise(state, actor.x, actor.z, BOT.hearRange.reload, actor.team, 'reload');
}

function fireBullet(state, actor, w) {
  const def = w.def;
  w.mag -= 1;
  actor.cooldown = 60 / def.rpm;
  const spread = spreadOf(actor);
  const angle = state.rng() * Math.PI * 2;
  const radius = Math.sqrt(state.rng()) * spread;
  const yaw = actor.yaw + actor.punchYaw + Math.cos(angle) * radius / Math.max(0.2, Math.cos(actor.pitch));
  const pitch = actor.pitch + actor.punchPitch + Math.sin(angle) * radius;
  viewDir(yaw, pitch, dir);
  const ox = actor.x; const oy = actor.y + actor.eye; const oz = actor.z;
  const h = traceShot(state, actor, ox, oy, oz, dir.x, dir.y, dir.z, 120);
  const t = h.t;
  state.events.emit('shot', {
    actor, x: ox, y: oy, z: oz, x2: ox + dir.x * t, y2: oy + dir.y * t, z2: oz + dir.z * t,
    text: def.id, flag: h.actor !== null, value: t,
  });
  if (h.actor) {
    const target = h.actor; const zone = h.zone;
    const dmg = computeDamage(def, zone, t, target);
    applyDamage(state, target, dmg.damage, dmg.armorLoss, actor, def.name, zone, def.kill);
  } else if (t < 120) {
    state.events.emit('impact', { actor, x: ox + dir.x * t, y: oy + dir.y * t, z: oz + dir.z * t, x2: dir.x, y2: dir.y, z2: dir.z });
  }
  // recoil: follow the weapon's pattern, a little noisier while moving
  const kick = def.pattern[Math.min(actor.shotsFired, def.pattern.length - 1)];
  const sway = 1 + Math.min(1, actor.speed / 3) * 0.6;
  actor.punchPitch += kick[1] * DEG * sway * state.rng.range(0.9, 1.1);
  actor.punchYaw += kick[0] * DEG * sway + state.rng.range(-0.12, 0.12) * DEG;
  actor.shotsFired += 1;
  actor.sinceShot = 0;
  if (def.kind === 'sniper') actor.scoped = false;
  makeNoise(state, actor.x, actor.z, BOT.hearRange.shot, actor.team, 'shot');
}

function swing(state, actor, w) {
  actor.cooldown = 60 / w.def.rpm;
  viewDir(actor.yaw, actor.pitch, dir);
  const ox = actor.x; const oy = actor.y + actor.eye; const oz = actor.z;
  const h = traceShot(state, actor, ox, oy, oz, dir.x, dir.y, dir.z, w.def.range);
  state.events.emit('swing', { actor, flag: h.actor !== null });
  if (h.actor) {
    const dmg = computeDamage(w.def, h.zone, 0, h.actor);
    applyDamage(state, h.actor, dmg.damage, dmg.armorLoss, actor, w.def.name, h.zone, w.def.kill);
  }
}

export function updateWeapons(state, actor, dt, frozen) {
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.switchTimer = Math.max(0, actor.switchTimer - dt);
  actor.sinceShot += dt;
  if (!actor.alive) return;

  if (actor.wantSlot) { selectSlot(state, actor, actor.wantSlot); actor.wantSlot = ''; }
  if (actor.slot === 'nade' && !hasNades(actor)) selectSlot(state, actor, bestSlot(actor));
  const w = currentWeapon(actor);

  // the kick settles back once the trigger rests
  const def = w ? w.def : null;
  const interval = def ? 60 / def.rpm : 0.2;
  if (actor.sinceShot > interval * 1.1) {
    const k = Math.min(1, (def ? def.recover : 8) * dt);
    actor.punchPitch -= actor.punchPitch * k;
    actor.punchYaw -= actor.punchYaw * k;
    if (actor.sinceShot > 0.4) actor.shotsFired = 0;
  }

  if (actor.reloadTimer > 0) {
    actor.reloadTimer -= dt;
    if (actor.reloadTimer <= 0 && w) {
      const take = Math.min(w.def.mag - w.mag, w.reserve);
      w.mag += take; w.reserve -= take;
      actor.reloadTimer = 0;
    }
  }

  if (w && actor.wantReload) startReload(state, actor, w);
  actor.wantReload = false;
  if (actor.wantScope) {
    if (w && w.def.kind === 'sniper' && actor.reloadTimer <= 0 && actor.switchTimer <= 0) {
      actor.scoped = !actor.scoped;
      state.events.emit('scope', { actor, flag: actor.scoped });
    }
    actor.wantScope = false;
  }

  const pulled = actor.trigger && !frozen && actor.switchTimer <= 0 && actor.reloadTimer <= 0 && actor.cooldown <= 0 && !actor.using;
  if (pulled) {
    if (actor.slot === 'nade') {
      if (!actor.triggerHeld) {
        throwGrenade(state, actor, actor.nadeType);
        actor.nades[actor.nadeType] -= 1;
        actor.cooldown = 0.7;
        if (actor.nades[actor.nadeType] === 0) {
          if (hasNades(actor)) actor.nadeType = nextNade(actor, actor.nadeType);
          else selectSlot(state, actor, bestSlot(actor));
        }
      }
    } else if (w.def.kind === 'melee') {
      swing(state, actor, w);
    } else if (w.def.auto || !actor.triggerHeld) {
      if (w.mag > 0) fireBullet(state, actor, w);
      else if (!actor.triggerHeld) {
        state.events.emit('dry', { actor });
        startReload(state, actor, w);
      }
    }
  }
  actor.triggerHeld = actor.trigger;
  if (w && w.mag === 0 && w.reserve > 0 && actor.reloadTimer <= 0 && actor.sinceShot > 0.25 && w.def.kind !== 'melee') startReload(state, actor, w);
}
