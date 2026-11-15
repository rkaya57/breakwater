// Round flow and economy: freeze (buy) -> live -> post -> next round, first team to seven wins.
// A round ends by elimination, the charge going off, a defuse or the clock; then everyone is paid.
import { RULES, ECONOMY, TEAM, TEAMS } from './config.js';
import { SPOTS } from './map.js';
import { aliveCount, weaponState } from './state.js';
import { giveBomb } from './bomb.js';
import { bestSlot } from './weapons.js';
import { botShop } from './shop.js';
import { planRound } from './bots.js';

function resetLoadout(actor) {
  actor.primary = null;
  actor.secondary = weaponState('pike');
  actor.nades.frag = 0; actor.nades.smoke = 0; actor.nades.flash = 0;
  actor.armor = 0; actor.helmet = false; actor.kit = false;
}

function spawn(state, actor, place) {
  actor.x = place.x + state.rng.range(-0.3, 0.3);
  actor.z = place.z + state.rng.range(-0.3, 0.3);
  actor.y = 0;
  actor.px = actor.x; actor.py = 0; actor.pz = actor.z;
  actor.vx = 0; actor.vy = 0; actor.vz = 0;
  actor.yaw = actor.team === TEAM.ATK ? 0 : Math.PI;
  actor.pitch = 0;
  actor.onGround = true;
}

export function startMatch(state) {
  state.round = 0;
  state.score[0] = 0; state.score[1] = 0;
  state.lossStreak[0] = 0; state.lossStreak[1] = 0;
  state.matchWinner = -1;
  for (const a of state.actors) {
    a.money = ECONOMY.start; a.kills = 0; a.deaths = 0; a.mvps = 0;
    a.alive = false; // so the first round hands out the starting loadout
  }
  startRound(state);
}

function startRound(state) {
  state.round += 1;
  state.phase = 'freeze';
  state.phaseTime = 0;
  state.roundClock = RULES.roundTime;
  state.roundWinner = -1;
  state.roundReason = '';
  state.mvp = null;
  for (const g of state.grenades) g.active = false;
  state.smokes.length = 0;
  for (const intel of state.intel) intel.time = -99;

  for (const team of [TEAM.ATK, TEAM.DEF]) {
    const places = SPOTS.spawns[team].slice();
    const members = state.actors.filter((a) => a.team === team);
    members.forEach((a, i) => {
      if (!a.alive) resetLoadout(a);
      a.alive = true; a.health = 100;
      a.roundKills = 0; a.roundDamage = 0;
      a.blind = 0; a.using = false; a.hasBomb = false; a.scoped = false;
      a.punchPitch = 0; a.punchYaw = 0; a.reloadTimer = 0; a.cooldown = 0; a.shotsFired = 0;
      a.lastHurtBy = null; a.hurtTime = -10;
      a.trigger = false; a.wantUse = false; a.wantSlot = '';
      a.slot = bestSlot(a);
      spawn(state, a, places[i % places.length]);
    });
  }
  const attackers = state.actors.filter((a) => a.team === TEAM.ATK);
  giveBomb(state, state.rng.pick(attackers));
  for (const a of state.actors) if (!a.isPlayer) botShop(state, a);
  planRound(state);
  state.events.emit('roundStart', { value: state.round });
}

function endRound(state, winner, reason) {
  const loser = 1 - winner;
  state.phase = 'post';
  state.phaseTime = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const bombWin = reason === 'Charge detonated' || reason === 'Charge defused';
  const lossPay = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * state.lossStreak[loser]);
  const planted = state.bomb.state === 'planted' || state.bomb.state === 'exploded' || state.bomb.state === 'defused';
  for (const a of state.actors) {
    let pay = a.team === winner ? (bombWin ? ECONOMY.winBomb : ECONOMY.win) : lossPay;
    if (a.team === TEAM.ATK && a.team === loser && planted) pay += ECONOMY.plantTeamBonus;
    a.money = Math.min(ECONOMY.max, a.money + pay);
  }
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] = Math.min(4, state.lossStreak[loser] + 1);
  let mvp = null;
  for (const a of state.actors) {
    if (a.team !== winner) continue;
    if (!mvp || a.roundKills > mvp.roundKills || (a.roundKills === mvp.roundKills && a.roundDamage > mvp.roundDamage)) mvp = a;
  }
  state.mvp = mvp;
  if (mvp) mvp.mvps += 1;
  if (state.score[winner] >= RULES.roundsToWin) state.matchWinner = winner;
  state.events.emit('roundEnd', { value: winner, text: reason });
}

export function updateRound(state, dt) {
  state.phaseTime += dt;
  if (state.phase === 'freeze') {
    if (state.phaseTime >= RULES.freezeTime) { state.phase = 'live'; state.phaseTime = 0; state.events.emit('live', {}); }
    return;
  }
  if (state.phase === 'post') {
    if (state.phaseTime >= RULES.postRound) {
      if (state.matchWinner >= 0) { state.phase = 'over'; state.events.emit('matchOver', { value: state.matchWinner }); } else startRound(state);
    }
    return;
  }
  if (state.phase !== 'live') return;

  const bomb = state.bomb;
  if (bomb.state !== 'planted') state.roundClock = Math.max(0, state.roundClock - dt);
  const atk = aliveCount(state, TEAM.ATK);
  const def = aliveCount(state, TEAM.DEF);
  const [sj, tw] = [TEAMS[TEAM.ATK].name, TEAMS[TEAM.DEF].name];
  if (bomb.state === 'exploded') endRound(state, TEAM.ATK, 'Charge detonated');
  else if (bomb.state === 'defused') endRound(state, TEAM.DEF, 'Charge defused');
  else if (def === 0) endRound(state, TEAM.ATK, `${tw} eliminated`);
  else if (bomb.state !== 'planted' && atk === 0) endRound(state, TEAM.DEF, `${sj} eliminated`);
  else if (bomb.state !== 'planted' && state.roundClock <= 0) endRound(state, TEAM.DEF, 'Time ran out');
}
