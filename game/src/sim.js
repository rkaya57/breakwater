// One fixed simulation step, in a fixed order: brains decide, bodies move, guns fire, grenades fly,
// the objective ticks and the round referee rules. Rendering never runs in here.
import { MOVE, BOT } from './config.js';
import { makeNoise } from './state.js';
import { updateBots } from './bots.js';
import { stepMovement, separate } from './movement.js';
import { updateWeapons } from './weapons.js';
import { updateGrenades } from './grenades.js';
import { updateBomb } from './bomb.js';
import { updateRound } from './round.js';

function footsteps(state, a, dt) {
  if (!a.alive || !a.onGround) { a.stepDist = 0; return; }
  a.stepDist += a.speed * dt;
  if (a.stepDist < 1.9) return;
  a.stepDist = 0;
  const loud = a.speed > MOVE.runSpeed * MOVE.walkMult * 1.15;
  state.events.emit('step', { actor: a, x: a.x, y: a.y, z: a.z, flag: loud });
  if (loud) makeNoise(state, a.x, a.z, BOT.hearRange.step, a.team, 'step');
}

export function stepSim(state, dt) {
  if (state.phase === 'menu') return;
  state.time += dt;
  const frozen = state.phase === 'freeze' || state.phase === 'over';
  updateBots(state, dt);
  for (const a of state.actors) {
    stepMovement(a, dt, frozen || a.using);
    footsteps(state, a, dt);
  }
  separate(state.actors);
  for (const a of state.actors) updateWeapons(state, a, dt, frozen);
  updateGrenades(state, dt);
  if (state.phase === 'live' || state.phase === 'post') updateBomb(state, dt);
  updateRound(state, dt);
}
