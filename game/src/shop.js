// Buying: the same rules for the player's buy menu and the bots' shopping. Items are bought in spawn
// during the buy window; a new gun replaces the one in its slot.
import { WEAPONS, GRENADES, GEAR, RULES, TEAM } from './config.js';
import { SPOTS } from './map.js';
import { weaponState } from './state.js';

export function priceOf(id) {
  return (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).price;
}

export function nameOf(id) {
  return (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).name;
}

function inBuyZone(actor) {
  const spawn = SPOTS.spawns[actor.team][0];
  return Math.hypot(actor.x - spawn.x, actor.z - spawn.z) < 14;
}

export function buyOpen(state, actor) {
  if (!actor.alive || !inBuyZone(actor)) return false;
  if (state.phase === 'freeze') return true;
  return state.phase === 'live' && RULES.roundTime - state.roundClock < RULES.buyWindow - RULES.freezeTime;
}

// Why an item cannot be bought right now, or '' when it can.
export function buyBlocker(state, actor, id) {
  if (!buyOpen(state, actor)) return 'Buy time is over';
  if (actor.money < priceOf(id)) return 'Not enough money';
  if (WEAPONS[id]) {
    const held = WEAPONS[id].slot === 1 ? actor.primary : actor.secondary;
    if (held && held.def.id === id) return 'Already carried';
  } else if (GRENADES[id]) {
    const total = actor.nades.frag + actor.nades.smoke + actor.nades.flash;
    if (actor.nades[id] >= GRENADES[id].max) return 'Carrying the most';
    if (total >= 4) return 'Grenade belt full';
  } else if (id === 'kit') {
    if (actor.team !== TEAM.DEF) return 'Tidewardens only';
    if (actor.kit) return 'Already carried';
  } else if (id === 'vest') {
    if (actor.armor >= 100) return 'Already carried';
  } else if (id === 'helmet') {
    if (actor.armor >= 100 && actor.helmet) return 'Already carried';
  }
  return '';
}

export function buy(state, actor, id) {
  const reason = buyBlocker(state, actor, id);
  if (reason) return reason;
  let price = priceOf(id);
  if (WEAPONS[id]) {
    const w = weaponState(id);
    if (WEAPONS[id].slot === 1) { actor.primary = w; actor.wantSlot = 'primary'; } else { actor.secondary = w; actor.wantSlot = 'secondary'; }
  } else if (GRENADES[id]) {
    actor.nades[id] += 1;
  } else if (id === 'kit') {
    actor.kit = true;
  } else if (id === 'vest') {
    actor.armor = 100;
  } else if (id === 'helmet') {
    if (actor.armor >= 100) price = 350; // only the helmet is missing
    actor.armor = 100; actor.helmet = true;
  }
  actor.money -= price;
  state.events.emit('buy', { actor, text: id });
  return '';
}

// Bot shopping: full buy when the money is there, a force or an eco when it is not.
export function botShop(state, actor) {
  const atk = actor.team === TEAM.ATK;
  const want = [];
  const m = actor.money;
  if (!actor.primary) {
    if (m >= 3700) want.push(state.rng.chance(0.18) && m >= 5700 ? 'harpoon' : atk ? 'marlin' : state.rng.pick(['marlin', 'gull']));
    else if (m >= 2200 && state.round > 1) want.push('wasp');
  }
  want.push(m >= 3000 ? 'helmet' : 'vest');
  if (!atk) want.push('kit');
  want.push(state.rng.pick(['smoke', 'flash', 'frag']), state.rng.pick(['flash', 'smoke']));
  if (!actor.primary && m < 2200 && m >= 700) want.unshift('brute');
  for (const id of want) {
    if (priceOf(id) <= actor.money) buy(state, actor, id);
  }
  if (actor.primary) actor.wantSlot = 'primary';
}
