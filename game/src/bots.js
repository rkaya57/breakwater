// Bot brains. Each round the attackers pick a site and two routes, gather at a staging point, then
// execute together behind a smoke and a flash; the defenders spread over held angles and rotate on
// what their team sees and hears. In a fight a bot reacts after a human-like delay, stops to shoot,
// settles its aim over time, fires in bursts and pulls against its own recoil. Bots obey the same
// movement, spread and recoil rules as the player: they only write intent onto their actor.
import { BOT, TEAM, RULES, MOVE } from './config.js';
import { SPOTS, raycast, siteAt, zoneName } from './map.js';
import { findPath } from './nav.js';
import { currentWeapon } from './state.js';
import { smokeBlocks } from './grenades.js';

const TAU = Math.PI * 2;
const SITE_OF_ZONE = { Breakwater: 'A', 'Loft Stairs': 'A', 'Net Loft': 'A', 'North Quay': 'A', Culvert: 'B', 'Ice House': 'B', 'Pump Road': 'B' };

function wrap(a) {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
}

function turnToward(current, target, maxStep) {
  const d = wrap(target - current);
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

function yawTo(a, x, z) { return Math.atan2(-(x - a.x), -(z - a.z)); }

function siteHint(x, z) {
  return siteAt(x, z) ?? SITE_OF_ZONE[zoneName(x, z)] ?? null;
}

function newBrain() {
  return {
    role: '', site: null, route: null, stage: 'stage', hold: null, nade: null,
    path: [], pathIndex: 0, goalKey: '', repath: 0,
    target: null, react: 0, seenFor: 0, errYaw: 0, errPitch: 0, aimHead: true,
    burst: 4, pause: 0, sense: 0, strafe: 1, strafeTimer: 0, crouchShoot: false,
    lastSeenX: 0, lastSeenZ: 0, lastSeenTime: -99, heardX: 0, heardZ: 0, heardTime: -99, heardCheck: 0,
    stuckX: 0, stuckZ: 0, stuckTime: 0, rotateAt: -1, idleYaw: 0, idleTimer: 0, routeStep: 0,
  };
}

// --- round plans

export function planRound(state) {
  const rng = state.rng;
  for (const a of state.actors) if (!a.isPlayer) a.brain = newBrain();

  const site = rng.chance(0.5) ? 'A' : 'B';
  const routes = SPOTS.routes[site];
  const main = rng.pick(routes);
  const alt = routes.find((r) => r !== main);
  state.plan[TEAM.ATK] = { site, main, alt, executeAt: rng.range(14, 26), executing: false };
  const attackers = state.actors.filter((a) => a.team === TEAM.ATK && !a.isPlayer);
  attackers.forEach((a, i) => {
    const b = a.brain;
    b.site = site;
    b.route = i % 3 === 2 ? alt : main;
    b.role = b.route === main ? 'entry' : 'split';
    b.stage = 'stage';
  });
  const thrower = attackers.find((a) => a.brain.route === main && a.nades.smoke > 0);
  if (thrower) thrower.brain.nade = { type: 'smoke', x: main.smoke.x, z: main.smoke.z, done: false };
  const flasher = attackers.find((a) => a !== thrower && a.nades.flash > 0);
  if (flasher) flasher.brain.nade = { type: 'flash', x: flasher.brain.route.flash.x, z: flasher.brain.route.flash.z, done: false };

  const defenders = state.actors.filter((a) => a.team === TEAM.DEF && !a.isPlayer);
  const slots = [['A', 0], ['B', 0], ['A', 1], ['B', 1], ['mid', 0]];
  if (state.playerTeam === TEAM.DEF) slots.splice(0, 1);
  defenders.forEach((d, k) => {
    const b = d.brain;
    const [where, n] = slots[k % slots.length];
    b.site = where === 'mid' ? 'B' : where;
    b.role = where === 'mid' ? 'mid' : 'anchor';
    b.hold = where === 'mid' ? SPOTS.holds.mid[0] : SPOTS.holds[where][(n + rng.int(2)) % SPOTS.holds[where].length];
  });
  state.plan[TEAM.DEF] = { rotating: null };
}

// --- senses

function canSee(state, a, e) {
  const dx = e.x - a.x; const dz = e.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.viewRange) return false;
  if (dist > 3.5 && Math.abs(wrap(yawTo(a, e.x, e.z) - a.yaw)) > BOT.fov) return false;
  const ex = a.x; const ey = a.y + a.eye; const ez = a.z;
  const s = e.eye / MOVE.eye;
  for (let i = 0; i < 3; i += 1) {
    const ty = e.y + (i === 0 ? e.eye + 0.05 : i === 1 ? 1.2 * s : 0.5); // head, chest, knees
    const lx = e.x - ex; const ly = ty - ey; const lz = e.z - ez;
    const len = Math.hypot(lx, ly, lz);
    if (raycast(ex, ey, ez, lx / len, ly / len, lz / len, len) >= len - 0.15 && !smokeBlocks(state, ex, ey, ez, e.x, ty, e.z)) return true;
  }
  return false;
}

function pickTarget(state, a) {
  if (a.blind > 0.5) return null;
  let best = null; let bestScore = Infinity;
  for (const e of state.actors) {
    if (!e.alive || e.team === a.team) continue;
    if (!canSee(state, a, e)) continue;
    const score = Math.hypot(e.x - a.x, e.z - a.z) + Math.abs(wrap(yawTo(a, e.x, e.z) - a.yaw)) * 6 - (e === a.brain.target ? 4 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function listen(state, a, b) {
  for (const n of state.noises) {
    if (n.time <= b.heardCheck || n.team === a.team || n.team < 0) continue;
    if (Math.hypot(n.x - a.x, n.z - a.z) > n.radius) continue;
    if (state.time - n.time < 1.5) { b.heardX = n.x; b.heardZ = n.z; b.heardTime = n.time; }
  }
  b.heardCheck = state.time;
}

function sense(state, a, b) {
  const target = pickTarget(state, a);
  if (target !== b.target) {
    b.target = target;
    if (target) {
      const off = Math.abs(wrap(yawTo(a, target.x, target.z) - a.yaw));
      b.react = state.rng.range(BOT.reaction[0], BOT.reaction[1]) * (off > 0.6 ? 1.35 : 1);
      b.seenFor = 0;
      b.errYaw = state.rng.range(-1, 1) * BOT.aimError[0];
      b.errPitch = state.rng.range(-0.6, 1) * BOT.aimError[0];
      b.aimHead = state.rng.chance(0.55);
      b.crouchShoot = state.rng.chance(0.3);
    }
  }
  if (target) {
    b.lastSeenX = target.x; b.lastSeenZ = target.z; b.lastSeenTime = state.time;
    const intel = state.intel[a.team];
    intel.x = target.x; intel.z = target.z; intel.time = state.time; intel.site = siteHint(target.x, target.z);
  }
  listen(state, a, b);
}

// --- moving

function travel(state, a, b, x, z, key) {
  if (b.goalKey !== key || b.repath <= 0 || b.pathIndex >= b.path.length) {
    if (b.goalKey !== key || b.repath <= 0) {
      b.path = findPath(a.x, a.z, x, z);
      b.pathIndex = 0;
      b.goalKey = key;
      b.repath = 4;
    }
  }
  const dist = Math.hypot(x - a.x, z - a.z);
  if (dist < 0.45) return true;
  while (b.pathIndex < b.path.length) {
    const p = b.path[b.pathIndex];
    if (Math.hypot(p.x - a.x, p.z - a.z) < 0.5 && b.pathIndex < b.path.length - 1) b.pathIndex += 1;
    else break;
  }
  const p = b.path[b.pathIndex];
  const dx = (p ? p.x : x) - a.x; const dz = (p ? p.z : z) - a.z;
  const len = Math.hypot(dx, dz) || 1;
  a.wishX = dx / len; a.wishZ = dz / len;
  return false;
}

function lookAlongMove(a, dt) {
  if (Math.abs(a.wishX) + Math.abs(a.wishZ) < 0.01) return;
  a.yaw = turnToward(a.yaw, Math.atan2(-a.wishX, -a.wishZ), 4 * dt);
  a.pitch += (0 - a.pitch) * Math.min(1, 4 * dt);
}

function lookAt(a, x, z, dt, rate = 4) {
  a.yaw = turnToward(a.yaw, yawTo(a, x, z), rate * dt);
  a.pitch += (0 - a.pitch) * Math.min(1, 4 * dt);
}

function checkStuck(state, a, b, dt) {
  const moving = Math.abs(a.wishX) + Math.abs(a.wishZ) > 0.1;
  if (!moving) { b.stuckTime = 0; b.stuckX = a.x; b.stuckZ = a.z; return; }
  b.stuckTime += dt;
  if (b.stuckTime > 1.2) {
    if (Math.hypot(a.x - b.stuckX, a.z - b.stuckZ) < 0.35) {
      b.repath = 0;
      a.wantJump = true;
      a.wishX += state.rng.range(-0.8, 0.8); a.wishZ += state.rng.range(-0.8, 0.8);
    }
    b.stuckTime = 0; b.stuckX = a.x; b.stuckZ = a.z;
  }
}

// --- fighting

function engage(state, a, b, dt) {
  const t = b.target;
  const w = currentWeapon(a);
  const kind = w ? w.def.kind : 'pistol';
  const dist = Math.hypot(t.x - a.x, t.z - a.z);
  const s = t.eye / MOVE.eye;
  const aimY = t.y + (b.aimHead || kind === 'sniper' ? t.eye + 0.04 : 1.25 * s);
  const ey = a.y + a.eye;
  b.seenFor += dt;
  b.react -= dt;
  const settle = Math.min(1, b.seenFor / BOT.settle);
  const err = BOT.aimError[0] + (BOT.aimError[1] - BOT.aimError[0]) * settle;
  const scale = err / BOT.aimError[0];
  let yaw = yawTo(a, t.x, t.z) + b.errYaw * scale;
  let pitch = Math.atan2(aimY - ey, dist) + b.errPitch * scale;
  yaw -= a.punchYaw * 0.8;
  pitch -= a.punchPitch * 0.8;
  const step = BOT.turnRate * dt * (b.react > 0 ? 0.7 : 1);
  a.yaw = turnToward(a.yaw, yaw, step);
  a.pitch = turnToward(a.pitch, pitch, step);

  // stop to shoot with rifles, strafe with pistols and SMGs up close
  if ((kind === 'smg' || kind === 'pistol') && dist < 14) {
    b.strafeTimer -= dt;
    if (b.strafeTimer <= 0) { b.strafe = -b.strafe; b.strafeTimer = state.rng.range(0.35, 0.8); }
    a.wishX = Math.cos(a.yaw) * b.strafe * 0.6; a.wishZ = -Math.sin(a.yaw) * b.strafe * 0.6;
  }
  a.wantCrouch = b.crouchShoot && kind === 'rifle' && dist > 16;
  if (kind === 'sniper' && !a.scoped && a.switchTimer <= 0 && a.reloadTimer <= 0 && a.cooldown <= 0) a.wantScope = true;
  if (kind === 'melee' && a.secondary) a.wantSlot = a.primary ? 'primary' : 'secondary';

  const off = Math.abs(wrap(yaw - a.yaw)) + Math.abs(pitch - a.pitch);
  const tolerance = Math.max(0.01, Math.atan2(0.22, dist)) * 1.6;
  if (b.react > 0 || off > tolerance) return;
  if (kind === 'sniper' && (a.speed > 0.8 || !a.scoped)) return;
  if (w && w.def.auto) {
    if (b.pause > 0) { b.pause -= dt; return; }
    a.trigger = true;
    if (a.shotsFired >= b.burst) {
      b.pause = state.rng.range(BOT.burstPause[0], BOT.burstPause[1]) * (dist > 20 ? 1.5 : 1);
      b.burst = state.rng.int(BOT.burst[1] - BOT.burst[0] + 1) + BOT.burst[0] + (dist < 8 ? 6 : 0);
      a.trigger = false;
    }
  } else {
    a.trigger = !a.triggerHeld && a.cooldown <= 0;
  }
}

// --- utility

function throwPlanned(state, a, b, dt) {
  const n = b.nade;
  if (!n || n.done) return false;
  if (a.nades[n.type] <= 0) { n.done = true; return false; }
  if (a.slot !== 'nade' || a.nadeType !== n.type) {
    a.nadeType = n.type;
    if (a.slot !== 'nade') a.wantSlot = 'nade';
    return true;
  }
  const dist = Math.hypot(n.x - a.x, n.z - a.z);
  const yaw = yawTo(a, n.x, n.z);
  const pitch = Math.min(0.85, 0.12 + dist * 0.016);
  a.yaw = turnToward(a.yaw, yaw, 6 * dt);
  a.pitch = turnToward(a.pitch, pitch, 6 * dt);
  if (Math.abs(wrap(yaw - a.yaw)) < 0.04 && Math.abs(pitch - a.pitch) < 0.04 && a.switchTimer <= 0 && a.cooldown <= 0) {
    a.trigger = true;
    n.done = true;
    a.wantSlot = a.primary ? 'primary' : 'secondary';
  }
  return true;
}

// --- per-team behaviour

function attackerThink(state, a, b, dt) {
  const bomb = state.bomb;
  const plan = state.plan[TEAM.ATK];
  const liveFor = RULES.roundTime - state.roundClock;
  if (!plan.executing && (liveFor > plan.executeAt || state.roundClock < 40)) plan.executing = true;

  if (bomb.state === 'planted') {
    const spots = SPOTS.postPlant[bomb.site];
    const spot = spots[a.id % spots.length];
    if (state.time - b.heardTime < 2 && Math.hypot(b.heardX - bomb.x, b.heardZ - bomb.z) < 4) {
      if (!travel(state, a, b, bomb.x + 2, bomb.z + 2, 'peek')) lookAt(a, bomb.x, bomb.z, dt);
    } else if (travel(state, a, b, spot.x, spot.z, `post${a.id}`)) {
      lookAt(a, bomb.x, bomb.z, dt, 3);
      a.wantCrouch = true;
    } else lookAlongMove(a, dt);
    return;
  }
  if (bomb.state === 'dropped') {
    let nearest = null; let nd = Infinity;
    for (const m of state.actors) {
      if (m.alive && m.team === TEAM.ATK && !m.isPlayer) { const d = Math.hypot(m.x - bomb.x, m.z - bomb.z); if (d < nd) { nd = d; nearest = m; } }
    }
    if (nearest === a) { travel(state, a, b, bomb.x, bomb.z, 'fetch'); lookAlongMove(a, dt); return; }
  }
  const site = a.hasBomb && plan.executing ? b.site : null;
  if (a.hasBomb && siteAt(a.x, a.z) && (state.time - b.lastSeenTime > 2.5)) {
    const p = SPOTS.plant[siteAt(a.x, a.z)];
    if (travel(state, a, b, p.x, p.z, 'plant')) {
      a.wantUse = true; a.wantCrouch = true;
      a.pitch = turnToward(a.pitch, -0.6, 2 * dt);
      return;
    }
    lookAlongMove(a, dt);
    return;
  }
  const path = b.route.path;
  const stageIndex = path.length - 2;
  if (b.stage === 'stage') {
    const p = path[Math.min(b.routeStep, stageIndex)];
    if (travel(state, a, b, p.x, p.z, `r${b.routeStep}`)) {
      if (b.routeStep < stageIndex) b.routeStep += 1;
      else if (plan.executing) b.stage = 'entry';
      else { lookAt(a, path[stageIndex + 1].x, path[stageIndex + 1].z, dt, 3); return; }
    }
    a.wantWalk = b.routeStep >= stageIndex;
    lookAlongMove(a, dt);
    return;
  }
  if (b.stage === 'entry') {
    const entry = path[path.length - 1];
    if (travel(state, a, b, entry.x, entry.z, 'entry')) b.stage = 'site';
    else { lookAlongMove(a, dt); return; }
  }
  if (throwPlanned(state, a, b, dt)) { a.wishX = 0; a.wishZ = 0; return; }
  // in the site: the carrier heads for the plant, the rest clear corners around it
  const goal = site ? SPOTS.plant[site] : SPOTS.postPlant[b.site][a.id % 3];
  if (travel(state, a, b, goal.x, goal.z, site ? 'plantGo' : `clear${a.id}`)) {
    if (state.time - b.heardTime < 3) lookAt(a, b.heardX, b.heardZ, dt);
    else lookAt(a, SPOTS.rotate[b.site].x, SPOTS.rotate[b.site].z, dt, 2);
  } else lookAlongMove(a, dt);
}

function defenderThink(state, a, b, dt) {
  const bomb = state.bomb;
  if (bomb.state === 'planted') {
    const d = Math.hypot(bomb.x - a.x, bomb.z - a.z);
    if (d < 1.2) { a.wantUse = true; a.wantCrouch = true; lookAt(a, bomb.x, bomb.z + 3, dt); return; }
    travel(state, a, b, bomb.x, bomb.z, 'defuse');
    lookAlongMove(a, dt);
    a.wantWalk = d < 9;
    return;
  }
  const intel = state.intel[TEAM.DEF];
  if (intel.site && state.time - intel.time < 6 && intel.site !== b.site) {
    if (b.rotateAt < 0) b.rotateAt = state.time + state.rng.range(0.6, 2.5);
    if (state.time >= b.rotateAt) {
      b.site = intel.site;
      const holds = SPOTS.holds[b.site];
      b.hold = holds[a.id % holds.length];
      b.rotateAt = -1;
      b.role = 'rotator';
    }
  }
  const h = b.hold;
  if (travel(state, a, b, h.x, h.z, `hold${h.x},${h.z}`)) {
    if (state.time - b.heardTime < 3.5) { lookAt(a, b.heardX, b.heardZ, dt, 3); return; }
    if (state.time - b.lastSeenTime < 3) { lookAt(a, b.lastSeenX, b.lastSeenZ, dt, 3); return; }
    b.idleTimer -= dt;
    if (b.idleTimer <= 0) { b.idleYaw = state.rng.range(-0.35, 0.35); b.idleTimer = state.rng.range(1.5, 3.5); }
    a.yaw = turnToward(a.yaw, h.yaw + b.idleYaw, 1.6 * dt);
    a.pitch += (0 - a.pitch) * Math.min(1, 3 * dt);
    const w = currentWeapon(a);
    if (w && w.mag < w.def.mag * 0.4 && w.reserve > 0) a.wantReload = true;
  } else {
    lookAlongMove(a, dt);
    a.wantWalk = Math.hypot(h.x - a.x, h.z - a.z) < 8;
  }
}

export function updateBots(state, dt) {
  for (const a of state.actors) {
    if (a.isPlayer || !a.alive || !a.brain) continue;
    const b = a.brain;
    a.wishX = 0; a.wishZ = 0; a.trigger = false; a.wantUse = false; a.wantJump = false; a.wantCrouch = false; a.wantWalk = false;
    b.repath -= dt;
    if (state.phase !== 'live') continue;
    b.sense -= dt;
    if (b.sense <= 0) { b.sense = BOT.senseTick; sense(state, a, b); }
    if (b.target && !b.target.alive) b.target = null;
    const held = currentWeapon(a);
    if (b.target && Math.hypot(b.target.x - a.x, b.target.z - a.z) > BOT.engageRange[held ? held.def.kind : 'pistol']) b.target = null;
    if (a.blind > 0.6) { a.yaw += Math.sin(state.time * 3 + a.id) * dt; continue; }
    if (b.target && !a.using) engage(state, a, b, dt);
    else if (a.team === TEAM.ATK) attackerThink(state, a, b, dt);
    else defenderThink(state, a, b, dt);
    checkStuck(state, a, b, dt);
  }
}
