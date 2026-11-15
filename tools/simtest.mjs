// Headless check of the simulation: plays a bots-only match with a seed and prints how each round ended.
// Run: node tools/simtest.mjs [seed]
import { STEP } from '../game/src/config.js';
import { createState } from '../game/src/state.js';
import { startMatch } from '../game/src/round.js';
import { stepSim } from '../game/src/sim.js';

const seed = Number(process.argv[2] ?? 7);
const state = createState(seed, -1);
const log = [];
state.events.emit = ((orig) => (type, f) => {
  if (type === 'roundEnd') log.push(`round ${state.round}: ${['SJ', 'TW'][f.value]} (${f.text}) at ${(115 - state.roundClock).toFixed(0)}s, bomb ${state.bomb.state}${state.bomb.site ? ' ' + state.bomb.site : ''}`);
  if (type === 'kill') kills.push(`${f.actor ? f.actor.name : 'world'} > ${f.target.name} [${f.text}${f.flag ? ' HS' : ''}]`);
  orig(type, f);
})(state.events.emit);
const kills = [];
startMatch(state);
let steps = 0;
while (state.phase !== 'over' && steps < 60 * 60 * 30) { stepSim(state, STEP); steps += 1; }
console.log(log.join('\n'));
console.log('score', state.score, 'steps', steps, 'kills', kills.length);
console.log(kills.slice(0, 12).join('\n'));
console.log(state.actors.map((a) => `${a.name}:${a.kills}/${a.deaths} $${a.money}`).join('  '));
