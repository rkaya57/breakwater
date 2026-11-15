// The HUD: scores, round clock, team pips, health, armour, money, ammunition, grenades, the radar
// and callout, kill feed, hit markers, damage direction, a crosshair that opens with the spread,
// plant and defuse progress, banners, the scope, the flash-blind white-out and the scoreboard.
// It writes to the DOM only when a value changes.
import { TEAMS, TEAM, RULES, GRENADES, GRENADE_ORDER } from './config.js';
import { zoneName, siteAt } from './map.js';
import { currentWeapon } from './state.js';
import { spreadOf } from './weapons.js';
import { buyOpen } from './shop.js';
import { createRadar } from './radar.js';

const $ = (id) => document.getElementById(id);
const NADE_SHORT = Object.fromEntries(GRENADE_ORDER.map((n) => [n, GRENADES[n].name.split(' ')[0]]));

export function createHud(state) {
  const cache = new Map();
  function text(id, value) {
    if (cache.get(id) === value) return;
    cache.set(id, value);
    $(id).textContent = value;
  }
  function toggle(id, on) {
    const key = `${id}?`;
    if (cache.get(key) === on) return;
    cache.set(key, on);
    $(id).hidden = !on;
  }
  function style(id, prop, value) {
    const key = `${id}.${prop}`;
    if (cache.get(key) === value) return;
    cache.set(key, value);
    $(id).style[prop] = value;
  }

  const radar = createRadar($('radar'));
  radar.drawOverview($('overview'));
  for (const [team, id] of [[TEAM.ATK, 'pips-atk'], [TEAM.DEF, 'pips-def']]) {
    for (let i = 0; i < RULES.teamSize; i += 1) $(id).appendChild(document.createElement('i'));
    $(id).style.setProperty('--team', TEAMS[team].ui);
  }
  const feed = [];
  let hitTime = -1; let hitHead = false;
  let hurtTime = -1; let hurtAngle = 0;
  let bannerUntil = 0;
  let killedBy = '';

  function banner(title, sub, color, seconds) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    $('banner').style.setProperty('--accent', color);
    toggle('banner', true);
    bannerUntil = state.time + seconds;
  }

  function addFeed(e) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const killer = e.actor ? `<b style="color:${TEAMS[e.actor.team].ui}">${e.actor.name}</b>` : '';
    row.innerHTML = `${killer}<span class="feed-weapon">${e.text}${e.flag ? ' <em>HEAD</em>' : ''}</span><b style="color:${TEAMS[e.target.team].ui}">${e.target.name}</b>`;
    if (e.actor === state.player || e.target === state.player) row.classList.add('mine');
    $('killfeed').prepend(row);
    feed.push({ row, until: state.time + 7 });
    if (feed.length > 6) feed.shift().row.remove();
  }

  function onEvent(e) {
    const p = state.player;
    switch (e.type) {
      case 'hurt':
        if (e.actor === p && e.target !== p) { hitTime = state.time; hitHead = e.flag; }
        if (e.target === p && e.actor) { hurtTime = state.time; hurtAngle = p.lastHurtYaw; }
        break;
      case 'kill':
        addFeed(e);
        if (e.target === p) killedBy = e.actor ? `Killed by ${e.actor.name} · ${e.text}${e.flag ? ' (headshot)' : ''}` : `Killed by the ${e.text}`;
        break;
      case 'planted': banner(`Charge planted at ${e.text}`, `${RULES.bombTime} seconds to detonation`, '#ff5a3a', 2.5); break;
      case 'bombDropped': if (p.team === TEAM.ATK) banner('Charge dropped', 'Pick it up from the marked spot', '#f2c14e', 2); break;
      case 'roundStart': killedBy = ''; toggle('banner', false); break;
      case 'live': banner('Round live', p.team === TEAM.ATK ? 'Plant the charge at A or B' : 'Hold the Crane Yard and the Pump House', TEAMS[p.team].ui, 1.6); break;
      case 'roundEnd': {
        const mvp = state.mvp ? `MVP ${state.mvp.name} · ${state.mvp.roundKills} kill${state.mvp.roundKills === 1 ? '' : 's'}` : '';
        banner(`${TEAMS[e.value].name} win`, `${e.text}${mvp ? '  —  ' + mvp : ''}`, TEAMS[e.value].ui, RULES.postRound);
        break;
      }
      default:
    }
  }

  const pipEls = [$('pips-atk').children, $('pips-def').children];
  const pipCount = [0, 0];

  function fmtClock(s) {
    const t = Math.ceil(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  function updateScoreboard() {
    const rows = (team) => state.actors.filter((a) => a.team === team).sort((a, b) => b.kills - a.kills).map((a) => `
      <tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}"><td>${a.name}${a.hasBomb ? ' <span class="tag">CHARGE</span>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${'★'.repeat(Math.min(a.mvps, 5))}</td><td>${a.team === state.player.team ? '$' + a.money : ''}</td></tr>`).join('');
    for (const [team, id] of [[TEAM.ATK, 'sb-atk'], [TEAM.DEF, 'sb-def']]) {
      $(id).innerHTML = `<caption style="color:${TEAMS[team].ui}">${TEAMS[team].name} · ${state.score[team]}</caption><tr><th>Player</th><th>K</th><th>D</th><th>MVP</th><th>Money</th></tr>${rows(team)}`;
    }
  }

  function update(viewer, showBoard, camFov) {
    const p = state.player;
    const b = state.bomb;
    text('score-atk', String(state.score[TEAM.ATK]));
    text('score-def', String(state.score[TEAM.DEF]));
    text('clock-round', state.phase === 'freeze' ? 'BUY PHASE' : `ROUND ${state.round}`);
    const planted = b.state === 'planted';
    text('clock-time', planted ? fmtClock(b.timer) : fmtClock(state.phase === 'freeze' ? RULES.freezeTime - state.phaseTime : state.roundClock));
    style('clock', 'color', planted ? '#ff5a3a' : '');
    toggle('clock-bomb', planted);
    const seen = pipCount;
    seen[0] = 0; seen[1] = 0;
    for (const a of state.actors) {
      const pip = pipEls[a.team][seen[a.team]];
      seen[a.team] += 1;
      if (pip && pip.classList.contains('dead') === a.alive) pip.classList.toggle('dead', !a.alive);
    }

    text('hp', String(Math.ceil(viewer.health)));
    text('ar', String(Math.ceil(viewer.armor)));
    style('vitals', 'color', viewer.health <= 25 ? '#ff5a3a' : '');
    text('money-v', viewer.money.toLocaleString('en-US'));
    const w = currentWeapon(viewer);
    if (w) {
      text('wname', w.def.name);
      text('mag', w.def.kind === 'melee' ? '—' : String(w.mag));
      text('reserve', w.def.kind === 'melee' ? '' : `/ ${w.reserve}`);
    } else {
      text('wname', GRENADES[viewer.nadeType].name);
      text('mag', String(viewer.nades[viewer.nadeType]));
      text('reserve', '');
    }
    style('ammo', 'color', w && w.def.kind !== 'melee' && w.mag <= Math.ceil(w.def.mag * 0.2) ? '#ff5a3a' : '');
    let nades = '';
    for (const n of GRENADE_ORDER) if (viewer.nades[n]) nades += `${nades ? '   ' : ''}${NADE_SHORT[n]} ×${viewer.nades[n]}`;
    text('nades', nades);
    toggle('carrier', viewer.hasBomb);
    toggle('reloading', viewer.reloadTimer > 0);

    radar.draw(state, viewer);
    text('callout', zoneName(viewer.x, viewer.z).toUpperCase());

    // crosshair gap follows the real spread cone
    const spread = spreadOf(viewer) + Math.abs(viewer.punchPitch) * 0.15;
    const px = Math.tan(spread) / Math.tan(camFov * Math.PI / 360) * (window.innerHeight / 2);
    style('crosshair', '--gap', `${Math.min(80, 3 + px).toFixed(1)}px`);
    toggle('crosshair', viewer.alive && !viewer.scoped && viewer.slot !== 'melee');
    toggle('scope', viewer.alive && viewer.scoped);
    const hitAge = state.time - hitTime;
    style('hitmarker', 'opacity', hitAge < 0.25 ? String(1 - hitAge / 0.25) : '0');
    style('hitmarker', '--hit', hitHead ? '#ff4b3a' : '#ffffff');
    const hurtAge = state.time - hurtTime;
    style('dmg', 'opacity', hurtAge < 1 ? String(1 - hurtAge) : '0');
    style('dmg', 'transform', `translate(-50%, -50%) rotate(${(-(hurtAngle - p.yaw) + Math.PI) * 180 / Math.PI}deg)`);
    style('flash', 'opacity', viewer.blind > 0 ? String(Math.min(1, viewer.blind / Math.max(0.4, viewer.blindMax * 0.5))) : '0');
    style('hurt-vignette', 'opacity', viewer.alive ? String(Math.max(0, (40 - viewer.health) / 50)) : '0');

    // plant and defuse progress
    let label = ''; let progress = 0;
    if (p.using && p.hasBomb) { label = 'Planting the charge'; progress = b.plantProgress / RULES.plantTime; }
    if (b.defuser === p) { label = p.kit ? 'Defusing (kit)' : 'Defusing'; progress = b.defuseProgress / (p.kit ? RULES.defuseKitTime : RULES.defuseTime); }
    toggle('progress', label !== '');
    if (label) { text('progress-label', label); style('progress-bar', 'width', `${Math.min(100, progress * 100).toFixed(1)}%`); }

    let hint = '';
    if (p.alive && state.phase === 'live' && p.hasBomb && b.state === 'carried' && !p.using) hint = siteAt(p.x, p.z) ? 'Hold E to plant the charge' : '';
    if (p.alive && planted && p.team === TEAM.DEF && Math.hypot(p.x - b.x, p.z - b.z) < 1.6 && b.defuser !== p) hint = 'Hold E to defuse';
    if (p.alive && buyOpen(state, p) && state.phase === 'freeze' && $('buy').hidden) hint = 'Press B to buy · the round starts when the clock runs out';
    text('hint', hint);
    text('spectate', !p.alive && viewer !== p ? `Spectating ${viewer.name}${killedBy ? '  ·  ' + killedBy : ''}` : '');

    if (state.time > bannerUntil) toggle('banner', false);
    for (let i = feed.length - 1; i >= 0; i -= 1) if (state.time > feed[i].until) { feed[i].row.remove(); feed.splice(i, 1); }

    toggle('scoreboard', showBoard);
    if (showBoard) updateScoreboard();
  }

  return { onEvent, update, banner };
}
