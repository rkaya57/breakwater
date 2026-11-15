// The match state, kept in one place. Systems receive this object and change it; the renderer and the
// HUD only read it. Actors are the five Saltjackers and five Tidewardens, the player among them.
import { RULES, TEAM, BOT, WEAPONS, ECONOMY } from './config.js';
import { createRng } from './rng.js';
import { createEvents } from './events.js';

const NOISE_SLOTS = 48;

export function weaponState(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve };
}

function createActor(id, team, name, isPlayer) {
  return {
    id, team, name, isPlayer,
    alive: true, health: 100, armor: 0, helmet: false, kit: false, money: ECONOMY.start,
    x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, eye: 1.62, onGround: true, crouching: false, walking: false, speed: 0, stepDist: 0,
    // intent, written by the player's controls or a bot's brain, read by movement and weapons
    wishX: 0, wishZ: 0, wantJump: false, wantCrouch: false, wantWalk: false,
    trigger: false, triggerHeld: false, wantReload: false, wantSlot: '', wantUse: false, wantScope: false,
    // weapons
    primary: null, secondary: weaponState('pike'), melee: weaponState('gaff'),
    nades: { frag: 0, smoke: 0, flash: 0 }, nadeType: 'frag',
    slot: 'secondary', switchTimer: 0, reloadTimer: 0, cooldown: 0, scoped: false,
    punchYaw: 0, punchPitch: 0, shotsFired: 0, sinceShot: 1,
    hasBomb: false, using: false,
    blind: 0, blindMax: 0,
    kills: 0, deaths: 0, roundKills: 0, roundDamage: 0, mvps: 0,
    lastHurtBy: null, lastHurtYaw: 0, hurtTime: -10,
    deathTime: 0,
    brain: null,
  };
}

export function createState(seed, playerTeam) {
  const rng = createRng(seed);
  const actors = [];
  let nameIndex = 0;
  for (const team of [TEAM.ATK, TEAM.DEF]) {
    for (let i = 0; i < RULES.teamSize; i += 1) {
      const isPlayer = team === playerTeam && i === 0;
      const name = isPlayer ? 'You' : BOT.names[nameIndex++ % BOT.names.length];
      actors.push(createActor(actors.length, team, name, isPlayer));
    }
  }
  return {
    seed, rng,
    events: createEvents(),
    time: 0,
    phase: 'menu',            // menu, freeze, live, post, over
    phaseTime: 0,
    round: 0,
    roundClock: RULES.roundTime,
    score: [0, 0],
    lossStreak: [0, 0],
    playerTeam,
    actors,
    player: actors.find((a) => a.isPlayer),
    bomb: { state: 'none', carrier: null, x: 0, y: 0, z: 0, site: null, timer: 0, plantProgress: 0, defuseProgress: 0, defuser: null, nextBeep: 0 },
    grenades: [],
    smokes: [],
    noises: Array.from({ length: NOISE_SLOTS }, () => ({ x: 0, z: 0, radius: 0, team: -1, kind: '', time: -99 })),
    noiseHead: 0,
    intel: [{ x: 0, z: 0, time: -99, site: null }, { x: 0, z: 0, time: -99, site: null }], // what each team last learned of the other
    plan: [null, null],
    roundWinner: -1,
    roundReason: '',
    matchWinner: -1,
    mvp: null,
  };
}

// A sound the bots can hear: footsteps, shots, reloads, a plant.
export function makeNoise(state, x, z, radius, team, kind) {
  const n = state.noises[state.noiseHead];
  n.x = x; n.z = z; n.radius = radius; n.team = team; n.kind = kind; n.time = state.time;
  state.noiseHead = (state.noiseHead + 1) % state.noises.length;
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.actors) if (a.alive && a.team === team) n += 1;
  return n;
}

export function currentWeapon(actor) {
  if (actor.slot === 'primary') return actor.primary;
  if (actor.slot === 'secondary') return actor.secondary;
  if (actor.slot === 'melee') return actor.melee;
  return null; // grenade in hand
}
