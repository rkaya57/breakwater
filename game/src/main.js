// Breakwater: boot and the one loop. A fixed 60 Hz simulation (sim.js) is fed by the controls and
// drawn at the display's rate with interpolation; presentation modules hear the simulation only
// through its event ring. ?shot=<name>&seed=N stages a deterministic frame for a screenshot.
import * as THREE from 'three';
import { STEP, TEAM, WEAPONS } from './config.js';
import { createState, currentWeapon } from './state.js';
import { startMatch } from './round.js';
import { stepSim } from './sim.js';
import { buyOpen } from './shop.js';
import { createInput, applyControls } from './input.js';
import { createHud } from './hud.js';
import { createBuyMenu } from './buymenu.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createSoldiers } from './soldiers.js';
import { createWorld } from './world.js';
import { createViewmodel } from './viewmodel.js';
import { createPost } from './post.js';
import { dressHarbour } from './dressing.js';
import { createTextures } from './textures.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const BASE_FOV = 78;
const SENSITIVITY = 0.0022;
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!shotName });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);
const post = createPost(renderer);
post.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);
const textures = createTextures();
const world = createWorld(scene, textures, renderer);
const dressing = dressHarbour(world.group, textures);
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

// everything that belongs to one match, rebuilt when a new match starts
let state = null; let soldiers = null; let viewmodel = null; let effects = null; let hud = null; let buyMenu = null;
let matchGroup = null; let listeners = [];
let buyOpenNow = false; let paused = false;
let accumulator = 0; let last = performance.now(); let shake = 0; let frozen = false;
const look = { dx: 0, dy: 0 };

function newMatch(team, seed) {
  if (matchGroup) scene.remove(matchGroup);
  matchGroup = new THREE.Group();
  scene.add(matchGroup);
  state = createState(seed, team);
  soldiers = createSoldiers(matchGroup, state);
  viewmodel = createViewmodel(team, scene.environment);
  effects = createEffects(matchGroup, state);
  hud = createHud(state);
  buyMenu = createBuyMenu(state, $('buy'), () => setBuy(false));
  listeners = [
    (e) => effects.onEvent(e, state.player),
    (e) => audio.onEvent(e, state.player),
    (e) => hud.onEvent(e),
    (e) => { if (e.actor === viewerOf()) viewmodel.onEvent(e); },
    (e) => { if ((e.type === 'hurt' && e.target === state.player) || e.type === 'explode') shake = Math.min(1, shake + (e.type === 'explode' ? 1 : 0.25)); },
  ];
  startMatch(state);
  accumulator = 0;
}

function viewerOf() {
  const p = state.player;
  if (p.alive || state.phase === 'post' && state.time - p.deathTime < 1.5) return p;
  return state.actors.find((a) => a.alive && a.team === p.team) ?? state.actors.find((a) => a.alive) ?? p;
}

function setBuy(open) {
  buyOpenNow = open;
  $('buy').hidden = !open;
  if (open) { buyMenu.refresh(); input.releaseLock(); } else if (state.phase !== 'over') input.requestLock();
}

function onLockChange(locked) {
  if (shotName || !state) return;
  paused = !locked && !buyOpenNow && state.phase !== 'over';
  $('pause').hidden = !paused;
}

function startFromMenu(team) {
  audio.ensure();
  newMatch(team, Number.isFinite(seedParam) ? seedParam : (Date.now() % 100000) + 1);
  $('menu').hidden = true;
  $('over').hidden = true;
  $('hud').hidden = false;
  input.requestLock();
}

$('play-atk').addEventListener('click', () => startFromMenu(TEAM.ATK));
$('play-def').addEventListener('click', () => startFromMenu(TEAM.DEF));
$('again').addEventListener('click', () => startFromMenu(state.playerTeam));
$('resume').addEventListener('click', () => input.requestLock());

function handleKeys() {
  if (buyOpenNow) {
    buyMenu.handleKeys(input);
    if (!buyOpen(state, state.player)) setBuy(false);
    else buyMenu.refresh();
    return;
  }
  if (input.take('KeyB') && buyOpen(state, state.player)) setBuy(true);
}

function placeCamera(alpha) {
  const v = viewerOf();
  const x = v.px + (v.x - v.px) * alpha;
  const y = v.py + (v.y - v.py) * alpha;
  const z = v.pz + (v.z - v.pz) * alpha;
  const s = shake * shake * 0.04;
  camera.position.set(x + Math.sin(state.time * 61) * s, y + v.eye + Math.sin(state.time * 47) * s, z);
  camera.rotation.set(v.pitch + v.punchPitch, v.yaw + v.punchYaw, Math.sin(state.time * 33) * s * 0.5, 'YXZ');
  const w = currentWeapon(v);
  const fov = v.scoped && w && w.def.scopeFov ? w.def.scopeFov : BASE_FOV;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  return v;
}

function heldId(v) {
  const w = currentWeapon(v);
  return w ? w.def.id : v.nadeType;
}

// Draws one frame from the current state; used by the loop and by screenshot staging.
function present(dt, alpha) {
  state.events.drain(listeners);
  const viewer = placeCamera(alpha);
  soldiers.update(alpha, dt, (a) => (currentWeapon(a) ?? WEAPONS.pike).def.kind);
  soldiers.views[viewer.id].root.visible = false;
  effects.update(dt, state.time);
  world.update(state.time);
  dressing(state.time);
  viewmodel.update(dt, viewer, heldId(viewer), look.dx, look.dy, state.time);
  audio.update(viewer);
  hud.update(viewer, input.keys.has('Tab') || state.phase === 'over' || (shotName === 'board'), camera.fov);
  shake = Math.max(0, shake - dt * 2.5);
  post.render(() => { renderer.render(scene, camera); viewmodel.render(renderer, camera.aspect); }, state.time);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!state || frozen) { if (!state) post.render(() => renderer.render(scene, camera), now / 1000); return; }
  const playing = input.locked() && !paused;
  handleKeys();
  const moved = applyControls(input, state.player, SENSITIVITY, playing && !buyOpenNow);
  look.dx = moved.x; look.dy = moved.y;
  if (!paused || buyOpenNow) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 6) { stepSim(state, STEP); accumulator -= STEP; steps += 1; }
    if (accumulator > STEP * 6) accumulator = 0;
  }
  if (state.phase === 'over' && $('over').hidden) {
    $('over-title').textContent = state.matchWinner === state.player.team ? 'Victory' : 'Defeat';
    $('over-score').textContent = `${state.score[TEAM.ATK]} – ${state.score[TEAM.DEF]}`;
    $('over').hidden = false;
    input.releaseLock();
  }
  present(dt, accumulator / STEP);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

if (shotName) {
  $('menu').hidden = true;
  $('hud').hidden = false;
  frozen = true;
  // staging code is fetched only in screenshot mode, so normal play never loads it
  import('./shots.js').then(({ runShot }) => runShot(shotName, {
    newMatch: (team) => newMatch(team, Number.isFinite(seedParam) ? seedParam : 1),
    get state() { return state; },
    step(n) { for (let i = 0; i < n; i += 1) stepSim(state, STEP); },
    present(dt) { present(dt, 1); },
    openBuy() { buyOpenNow = true; $('buy').hidden = false; buyMenu.refresh(); },
    showMenu() { $('menu').hidden = false; },
    banner: (t, s, c) => hud.banner(t, s, c, 60),
    viewmodel: () => viewmodel,
  }));
}
requestAnimationFrame(frame);
