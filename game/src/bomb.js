// The objective: the Saltjackers carry a limpet charge to the Crane Yard (A) or the Pump House (B) and
// plant it; the Tidewardens stop them or defuse it before it blows. Planting and defusing are held
// actions that a step, a jump or a hit-flinch cancels.
import { RULES, ECONOMY, TEAM, BOT } from './config.js';
import { siteAt } from './map.js';
import { makeNoise } from './state.js';
import { applyDamage } from './combat.js';

export function giveBomb(state, actor) {
  const b = state.bomb;
  for (const a of state.actors) a.hasBomb = false;
  b.state = 'carried'; b.carrier = actor; b.site = null; b.plantProgress = 0; b.defuseProgress = 0; b.defuser = null;
  actor.hasBomb = true;
}

function canPlant(actor) {
  return actor.alive && actor.hasBomb && actor.onGround && actor.speed < 0.6 && siteAt(actor.x, actor.z) !== null;
}

function updateCarried(state, dt) {
  const b = state.bomb;
  const a = b.carrier;
  if (!a || !a.alive) return;
  b.x = a.x; b.y = a.y; b.z = a.z;
  a.using = a.wantUse && canPlant(a);
  if (a.using) {
    if (b.plantProgress === 0) {
      state.events.emit('plantStart', { actor: a, x: a.x, y: a.y, z: a.z });
      makeNoise(state, a.x, a.z, BOT.hearRange.plant, a.team, 'plant');
    }
    b.plantProgress += dt;
    if (b.plantProgress >= RULES.plantTime) {
      b.state = 'planted';
      b.site = siteAt(a.x, a.z);
      b.timer = RULES.bombTime;
      b.nextBeep = 0;
      b.carrier = null;
      a.hasBomb = false;
      a.using = false;
      a.money = Math.min(ECONOMY.max, a.money + ECONOMY.plantBonus);
      state.events.emit('planted', { actor: a, x: b.x, y: b.y, z: b.z, text: b.site });
      const intel = state.intel[TEAM.DEF];
      intel.x = b.x; intel.z = b.z; intel.time = state.time; intel.site = b.site;
    }
  } else {
    b.plantProgress = 0;
  }
}

function updateDropped(state) {
  const b = state.bomb;
  for (const a of state.actors) {
    if (!a.alive || a.team !== TEAM.ATK) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1.1 && Math.abs(a.y - b.y) < 1.2) {
      giveBomb(state, a);
      state.events.emit('bombPicked', { actor: a });
      return;
    }
  }
}

function updatePlanted(state, dt) {
  const b = state.bomb;
  b.timer -= dt;
  b.nextBeep -= dt;
  if (b.nextBeep <= 0) {
    const frac = Math.max(0, b.timer / RULES.bombTime);
    b.nextBeep = 0.12 + 0.9 * frac * frac;
    state.events.emit('beep', { x: b.x, y: b.y, z: b.z, value: frac });
  }
  // whoever holds use on the charge is defusing it; the first to start keeps it
  let defuser = b.defuser;
  if (defuser && !(defuser.alive && defuser.wantUse && Math.hypot(defuser.x - b.x, defuser.z - b.z) < 1.6 && defuser.onGround)) {
    defuser.using = false;
    defuser = null;
  }
  if (!defuser) {
    for (const a of state.actors) {
      if (a.alive && a.team === TEAM.DEF && a.wantUse && a.onGround && Math.hypot(a.x - b.x, a.z - b.z) < 1.6) { defuser = a; break; }
    }
    if (defuser) {
      b.defuseProgress = 0;
      state.events.emit('defuseStart', { actor: defuser, flag: defuser.kit });
      makeNoise(state, b.x, b.z, BOT.hearRange.defuse, TEAM.DEF, 'defuse');
    }
  }
  b.defuser = defuser;
  if (defuser) {
    defuser.using = true;
    defuser.vx = 0; defuser.vz = 0;
    b.defuseProgress += dt;
    const need = defuser.kit ? RULES.defuseKitTime : RULES.defuseTime;
    if (b.defuseProgress >= need) {
      b.state = 'defused';
      defuser.using = false;
      defuser.money = Math.min(ECONOMY.max, defuser.money + ECONOMY.defuseBonus);
      state.events.emit('defused', { actor: defuser, x: b.x, y: b.y, z: b.z });
      return;
    }
  } else {
    b.defuseProgress = 0;
  }
  if (b.timer <= 0) {
    b.state = 'exploded';
    if (b.defuser) b.defuser.using = false;
    state.events.emit('explode', { x: b.x, y: b.y, z: b.z });
    for (const a of state.actors) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (!a.alive || d > RULES.explosionRadius) continue;
      const dmg = RULES.explosionDamage * (1 - d / RULES.explosionRadius) ** 0.8;
      applyDamage(state, a, Math.round(a.armor > 0 ? dmg * 0.75 : dmg), 0, null, 'Limpet Charge', 1, 0);
    }
  }
}

export function updateBomb(state, dt) {
  const b = state.bomb;
  for (const a of state.actors) if (b.state !== 'planted' && !a.hasBomb) a.using = false;
  if (b.state === 'carried') updateCarried(state, dt);
  else if (b.state === 'dropped') updateDropped(state);
  else if (b.state === 'planted') updatePlanted(state, dt);
}
