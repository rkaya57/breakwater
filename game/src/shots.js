// Screenshot staging (?shot=assault|buy|defuse|board&seed=N). Each stage builds a match with the game's
// own modules, moves actors into place, fires through the real weapon code, renders twice and
// raises window.__shotReady for the capture tool. Nothing here is drawn that the game cannot draw.
import { STEP, TEAM } from './config.js';
import { cellX, cellZ } from './map.js';
import { weaponState } from './state.js';
import { updateWeapons } from './weapons.js';
import { applyDamage } from './combat.js';
import { giveBomb } from './bomb.js';

function place(a, c, r, lookC, lookR) {
  a.x = cellX(c); a.z = cellZ(r); a.y = 0;
  a.px = a.x; a.pz = a.z; a.py = 0;
  a.vx = 0; a.vz = 0; a.speed = 0;
  if (lookC !== undefined) a.yaw = Math.atan2(-(cellX(lookC) - a.x), -(cellZ(lookR) - a.z));
}

function aimAt(a, x, y, z) {
  const dx = x - a.x; const dy = y - (a.y + a.eye); const dz = z - a.z;
  a.yaw = Math.atan2(-dx, -dz);
  a.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

function arm(a, id, mag) {
  a.primary = weaponState(id);
  if (mag !== undefined) a.primary.mag = mag;
  a.slot = 'primary';
  a.armor = 100; a.helmet = true;
}

function crouch(a) { a.wantCrouch = true; a.crouching = true; a.eye = 1.08; }

function live(state, round, score, clock) {
  state.phase = 'live';
  state.round = round;
  state.score[0] = score[0]; state.score[1] = score[1];
  state.roundClock = clock;
  state.time = 200;
}

function stats(state, rows) {
  state.actors.forEach((a, i) => { const [k, d, m, money] = rows[i % rows.length]; a.kills = k; a.deaths = d; a.mvps = m; a.money = money; });
}

const STAGES = {
  // the cover: pushing out of the Breakwater into the Crane Yard behind a smoke
  assault(ctx) {
    ctx.newMatch(TEAM.ATK);
    const s = ctx.state;
    live(s, 8, [4, 3], 71);
    stats(s, [[9, 4, 2, 2350], [5, 6, 1, 1900], [7, 5, 1, 3100], [3, 6, 0, 800], [6, 5, 1, 4200]]);
    const [me, mate, , , mate2] = s.actors.filter((a) => a.team === TEAM.ATK);
    const enemies = s.actors.filter((a) => a.team === TEAM.DEF);
    place(me, 12, 14); arm(me, 'marlin', 25); me.money = 2350; me.health = 81;
    place(mate, 10, 12, 6, 9); arm(mate, 'marlin'); mate.speed = 3.6;
    place(mate2, 12, 10, 9, 6); arm(mate2, 'wasp'); crouch(mate2);
    place(enemies[0], 6, 13, 12, 14); arm(enemies[0], 'gull');
    place(enemies[1], 3, 7, 12, 14); arm(enemies[1], 'harpoon'); crouch(enemies[1]);
    for (const e of enemies.slice(2)) place(e, 10, 3);
    giveBomb(s, me);
    s.smokes.push({ x: cellX(9), y: 1.4, z: cellZ(7), born: s.time - 4, life: 16, radius: 4.4 });
    // two earlier kills this round, for the feed
    applyDamage(s, enemies[2], 200, 0, mate2, 'Wasp SMG', 0, 600);
    applyDamage(s, s.actors.find((a) => a.team === TEAM.ATK && a.name !== me.name && a !== mate && a !== mate2), 200, 0, enemies[3], 'Gull Carbine', 1, 300);
    aimAt(me, enemies[0].x, enemies[0].y + 1.3, enemies[0].z);
    me.pitch += 0.004;
    ctx.present(STEP);
    me.trigger = true;
    updateWeapons(s, me, STEP, false);
    me.trigger = false;
    ctx.present(0.004);
  },

  // buying in the slip before the round
  buy(ctx) {
    ctx.newMatch(TEAM.ATK);
    const s = ctx.state;
    s.round = 5; s.score[0] = 2; s.score[1] = 2; s.phase = 'freeze'; s.phaseTime = 1.4; s.time = 120;
    const team = s.actors.filter((a) => a.team === TEAM.ATK);
    stats(s, [[6, 3, 1, 4750], [4, 4, 0, 3900], [5, 4, 1, 5200], [2, 4, 0, 3400], [3, 3, 1, 4100]]);
    place(team[0], 22, 31, 14, 31); team[0].money = 4750;
    place(team[1], 20, 30, 24, 31); place(team[2], 18, 32, 12, 31); place(team[3], 21, 33, 18, 30); place(team[4], 16, 31, 8, 30);
    arm(team[2], 'marlin'); arm(team[4], 'wasp');
    giveBomb(s, team[0]);
    ctx.present(STEP);
    ctx.openBuy();
    ctx.present(STEP);
  },

  // a kit defuse in the Pump House with fourteen seconds left
  defuse(ctx) {
    ctx.newMatch(TEAM.DEF);
    const s = ctx.state;
    live(s, 12, [6, 5], 0);
    stats(s, [[11, 7, 3, 3200], [6, 8, 1, 2500], [8, 6, 1, 4100], [4, 7, 0, 1800], [7, 6, 1, 2900]]);
    const team = s.actors.filter((a) => a.team === TEAM.DEF);
    const enemies = s.actors.filter((a) => a.team === TEAM.ATK);
    const me = team[0];
    place(me, 33, 13); arm(me, 'gull'); me.kit = true; me.health = 46; crouch(me);
    const b = s.bomb;
    b.state = 'planted'; b.site = 'B'; b.x = cellX(33) - 0.2; b.z = cellZ(12) - 0.3; b.y = 0; b.timer = 14.2; b.carrier = null;
    for (const a of s.actors) a.hasBomb = false;
    b.defuser = me; b.defuseProgress = 2.2; me.using = true; me.wantUse = true;
    aimAt(me, b.x - 1.6, 0.35, b.z - 3.4);
    place(team[1], 36, 9, 35, 16); arm(team[1], 'marlin'); crouch(team[1]);
    place(team[2], 29, 12, 25, 10); arm(team[2], 'harpoon');
    for (const e of enemies) place(e, 30, 31);
    const deaths = [[team[3], enemies[0], 'Marlin AR', 1], [enemies[1], team[1], 'Marlin AR', 0], [team[4], enemies[2], 'Wasp SMG', 2],
      [enemies[2], me, 'Gull Carbine', 1], [enemies[3], team[2], 'Harpoon .338', 1]];
    for (const [victim, killer, weapon, zone] of deaths) applyDamage(s, victim, 300, 0, killer, weapon, zone, 300);
    s.events.emit('beep', { x: b.x, y: b.y, z: b.z, value: 0.3 });
    ctx.present(STEP);
    ctx.present(STEP);
  },

  // the scoreboard and map overview after a round, from the fish market
  board(ctx) {
    ctx.newMatch(TEAM.ATK);
    const s = ctx.state;
    live(s, 12, [6, 5], 30);
    stats(s, [[14, 8, 4, 6150], [9, 9, 2, 5400], [11, 8, 1, 7300], [6, 10, 1, 4800], [8, 9, 2, 5900],
      [12, 9, 3, 0], [10, 10, 2, 0], [7, 11, 0, 0], [9, 9, 1, 0], [6, 10, 0, 0]]);
    const me = s.player;
    place(me, 23, 26, 17, 9); arm(me, 'marlin');
    me.pitch = 0.08;
    s.phase = 'post'; s.phaseTime = 0.5;
    s.roundWinner = TEAM.ATK; s.roundReason = 'Charge detonated'; s.mvp = me; me.roundKills = 3;
    s.events.emit('roundEnd', { value: TEAM.ATK, text: `Charge detonated` });
    ctx.present(STEP);
    ctx.present(STEP);
  },
};

export function runShot(name, ctx) {
  const stage = STAGES[name] ?? STAGES.assault;
  stage(ctx);
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
