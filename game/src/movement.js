// Movement for every actor alike: acceleration and friction on the ground, little control in the air,
// crouching, walking, gravity, stepping onto crates and sliding along walls on the map grid.
import { MOVE } from './config.js';
import { blocked, groundHeight } from './map.js';
import { currentWeapon } from './state.js';

function topSpeed(actor) {
  const weapon = currentWeapon(actor);
  let speed = MOVE.runSpeed * (weapon ? weapon.def.speed : 1);
  if (actor.scoped) speed *= 0.55;
  if (actor.crouching) speed *= MOVE.crouchMult;
  else if (actor.walking) speed *= MOVE.walkMult;
  return speed;
}

function tryMove(actor, nx, nz) {
  const feet = actor.y;
  const stepUp = actor.onGround ? MOVE.stepUp : 0.05;
  if (!blocked(nx, actor.z, MOVE.radius, feet, stepUp)) actor.x = nx;
  else actor.vx = 0;
  if (!blocked(actor.x, nz, MOVE.radius, feet, stepUp)) actor.z = nz;
  else actor.vz = 0;
}

export function stepMovement(actor, dt, frozen) {
  actor.px = actor.x; actor.py = actor.y; actor.pz = actor.z;
  if (!actor.alive) return;

  actor.crouching = actor.wantCrouch;
  actor.walking = actor.wantWalk && !actor.crouching;
  const targetEye = actor.crouching ? MOVE.crouchEye : MOVE.eye;
  actor.eye += (targetEye - actor.eye) * Math.min(1, MOVE.crouchRate * dt);

  let wx = frozen ? 0 : actor.wishX;
  let wz = frozen ? 0 : actor.wishZ;
  const wishLen = Math.hypot(wx, wz);
  if (wishLen > 1) { wx /= wishLen; wz /= wishLen; }
  const max = topSpeed(actor);

  if (actor.onGround) {
    // friction first, then accelerate toward the wished velocity
    const speed = Math.hypot(actor.vx, actor.vz);
    if (speed > 0) {
      const drop = Math.max(speed - MOVE.friction * dt * (wishLen > 0.01 ? 0.35 : 1), 0) / speed;
      actor.vx *= drop; actor.vz *= drop;
    }
    const tx = wx * max; const tz = wz * max;
    const dx = tx - actor.vx; const dz = tz - actor.vz;
    const gap = Math.hypot(dx, dz);
    if (gap > 0) {
      const accel = Math.min(gap, MOVE.groundAccel * dt);
      actor.vx += (dx / gap) * accel; actor.vz += (dz / gap) * accel;
    }
    if (actor.wantJump && !frozen && !actor.crouching) {
      actor.vy = MOVE.jumpSpeed;
      actor.onGround = false;
    }
  } else {
    actor.vx += wx * MOVE.airAccel * dt;
    actor.vz += wz * MOVE.airAccel * dt;
    const speed = Math.hypot(actor.vx, actor.vz);
    const cap = Math.max(max, MOVE.runSpeed);
    if (speed > cap) { actor.vx *= cap / speed; actor.vz *= cap / speed; }
  }

  tryMove(actor, actor.x + actor.vx * dt, actor.z + actor.vz * dt);

  const ground = groundHeight(actor.x, actor.z, MOVE.radius, actor.y + (actor.onGround ? MOVE.stepUp : 0));
  if (actor.onGround && actor.y - ground > 0.02) actor.onGround = false; // walked off a ledge
  if (!actor.onGround) {
    actor.vy -= MOVE.gravity * dt;
    actor.y += actor.vy * dt;
    if (actor.y <= ground) { actor.y = ground; actor.vy = 0; actor.onGround = true; }
  } else {
    actor.y = ground;
  }
  actor.speed = Math.hypot(actor.vx, actor.vz);
}

// Keeps living actors from standing inside one another.
export function separate(actors) {
  const min = MOVE.radius * 2;
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < actors.length; j += 1) {
      const b = actors[j];
      if (!b.alive || Math.abs(a.y - b.y) > 1.2) continue;
      const dx = b.x - a.x; const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2;
      const nx = dx / d; const nz = dz / d;
      if (!blocked(a.x - nx * push, a.z - nz * push, MOVE.radius, a.y, 0.05)) { a.x -= nx * push; a.z -= nz * push; }
      if (!blocked(b.x + nx * push, b.z + nz * push, MOVE.radius, b.y, 0.05)) { b.x += nx * push; b.z += nz * push; }
    }
  }
}
