// Every tunable number of Breakwater in one place: rules, economy, movement, weapons and teams.
// Systems read from here and never hard-code a balance value of their own.

export const STEP = 1 / 60;          // fixed simulation step (seconds)
export const CELL = 2;               // map grid cell size (metres)

export const TEAM = { ATK: 0, DEF: 1 };
export const TEAMS = [
  { name: 'Saltjackers', short: 'SJ', role: 'Attack', cloth: 0x9c4a2a, vest: 0x3b2f27, trim: 0xe08a3c, ui: '#e8833a' },
  { name: 'Tidewardens', short: 'TW', role: 'Defend', cloth: 0x2b5d6b, vest: 0x1f2b33, trim: 0x6fd0d6, ui: '#58c4cc' },
];

export const RULES = {
  roundsToWin: 7,
  teamSize: 5,
  freezeTime: 5,       // buy and look, no movement
  buyWindow: 20,       // seconds after round start the buy menu stays open
  roundTime: 115,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 7,
  defuseKitTime: 3.5,
  postRound: 5,
  explosionRadius: 17,
  explosionDamage: 260,
};

export const ECONOMY = {
  start: 800,
  max: 12000,
  win: 3250,
  winBomb: 3500,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantBonus: 300,     // to the planter
  plantTeamBonus: 800, // to the attackers when a planted round is lost
  defuseBonus: 300,
};

export const MOVE = {
  runSpeed: 5.6,
  walkMult: 0.52,
  crouchMult: 0.36,
  groundAccel: 46,
  friction: 30,
  airAccel: 7,
  jumpSpeed: 5.3,
  gravity: 15.5,
  stepUp: 0.35,
  radius: 0.34,
  height: 1.8,
  crouchHeight: 1.22,
  eye: 1.62,
  crouchEye: 1.08,
  crouchRate: 7,        // how fast the eye eases between standing and crouched
  accurateBelow: 0.34,  // fraction of top speed under which moving spread vanishes
};

// Hitbox zones and their damage multipliers.
export const HITZONE = { HEAD: 0, CHEST: 1, STOMACH: 2, LEGS: 3 };
export const ZONE_MULT = [1, 1, 1.25, 0.75]; // head uses the weapon's own headMult

// Recoil patterns are [yaw, pitch] kicks in degrees per shot; the pattern holds its last entry.
const RIFLE_PATTERN = [[0, 0.6], [0.05, 0.75], [-0.1, 0.9], [0.1, 1], [0.2, 1], [0.3, 0.9], [0.1, 0.7], [-0.4, 0.6],
  [-0.7, 0.4], [-0.6, 0.3], [-0.2, 0.25], [0.5, 0.2], [0.8, 0.15], [0.6, 0.1], [0.1, 0.1], [-0.5, 0.1]];
const SMG_PATTERN = [[0, 0.4], [0.05, 0.45], [-0.05, 0.5], [0.15, 0.5], [0.2, 0.4], [-0.2, 0.35], [-0.35, 0.3],
  [0.1, 0.25], [0.4, 0.2], [0.2, 0.2], [-0.3, 0.15]];
const PISTOL_PATTERN = [[0, 1.4], [0.2, 1.6], [-0.2, 1.8]];

// slot: 1 primary, 2 secondary, 3 melee, 4 grenade.
export const WEAPONS = {
  pike: {
    id: 'pike', name: 'Pike-9', kind: 'pistol', slot: 2, price: 0, kill: 300,
    damage: 30, headMult: 4, armorPen: 0.47, rpm: 380, auto: false, mag: 12, reserve: 36, reload: 2.1,
    spread: 0.006, moveSpread: 0.032, jumpSpread: 0.12, falloff: 0.86, speed: 1, pattern: PISTOL_PATTERN, recover: 9,
    sound: { pitch: 1.25, body: 0.6, crack: 0.8 },
  },
  brute: {
    id: 'brute', name: 'Brute .50', kind: 'pistol', slot: 2, price: 700, kill: 300,
    damage: 54, headMult: 3.9, armorPen: 0.92, rpm: 230, auto: false, mag: 7, reserve: 35, reload: 2.2,
    spread: 0.008, moveSpread: 0.05, jumpSpread: 0.16, falloff: 0.81, speed: 0.98, pattern: [[0, 2.6], [0.3, 2.8]], recover: 6,
    sound: { pitch: 0.8, body: 1, crack: 1 },
  },
  wasp: {
    id: 'wasp', name: 'Wasp SMG', kind: 'smg', slot: 1, price: 1250, kill: 600,
    damage: 26, headMult: 4, armorPen: 0.6, rpm: 820, auto: true, mag: 30, reserve: 120, reload: 2.3,
    spread: 0.009, moveSpread: 0.022, jumpSpread: 0.1, falloff: 0.8, speed: 1, pattern: SMG_PATTERN, recover: 11,
    sound: { pitch: 1.4, body: 0.5, crack: 0.6 },
  },
  marlin: {
    id: 'marlin', name: 'Marlin AR', kind: 'rifle', slot: 1, price: 2700, kill: 300,
    damage: 36, headMult: 4, armorPen: 0.78, rpm: 600, auto: true, mag: 30, reserve: 90, reload: 2.5,
    spread: 0.0035, moveSpread: 0.11, jumpSpread: 0.22, falloff: 0.98, speed: 0.88, pattern: RIFLE_PATTERN, recover: 7.5,
    sound: { pitch: 0.95, body: 0.9, crack: 1 },
  },
  gull: {
    id: 'gull', name: 'Gull Carbine', kind: 'rifle', slot: 1, price: 3000, kill: 300,
    damage: 33, headMult: 4, armorPen: 0.7, rpm: 666, auto: true, mag: 25, reserve: 75, reload: 2.4,
    spread: 0.0028, moveSpread: 0.1, jumpSpread: 0.2, falloff: 0.98, speed: 0.9, pattern: RIFLE_PATTERN.map(([y, p]) => [y * 0.6, p * 0.8]), recover: 8.5,
    sound: { pitch: 1.05, body: 0.75, crack: 1 },
  },
  harpoon: {
    id: 'harpoon', name: 'Harpoon .338', kind: 'sniper', slot: 1, price: 4750, kill: 100,
    damage: 115, headMult: 4, armorPen: 0.97, rpm: 41, auto: false, mag: 5, reserve: 30, reload: 3.6,
    spread: 0.0006, unscopedSpread: 0.075, moveSpread: 0.2, jumpSpread: 0.4, falloff: 0.99, speed: 0.8, scopeFov: 20,
    pattern: [[0, 3.2]], recover: 4, sound: { pitch: 0.65, body: 1.3, crack: 1.4 },
  },
  gaff: {
    id: 'gaff', name: 'Gaff Hook', kind: 'melee', slot: 3, price: 0, kill: 1500,
    damage: 40, headMult: 1.6, armorPen: 0.85, rpm: 120, auto: true, mag: Infinity, reserve: 0, reload: 0, range: 1.7,
    spread: 0, moveSpread: 0, jumpSpread: 0, falloff: 1, speed: 1.08, pattern: [[0, 0]], recover: 10,
    sound: { pitch: 1, body: 0, crack: 0 },
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Barnacle Frag', price: 300, max: 1, fuse: 1.6, damage: 98, radius: 7.5 },
  smoke: { id: 'smoke', name: 'Fogbank Smoke', price: 300, max: 1, fuse: 1.4, duration: 16, radius: 4.4 },
  flash: { id: 'flash', name: 'Gullflash', price: 200, max: 2, fuse: 1.3, blind: 3.2, radius: 30 },
};
export const GRENADE_ORDER = ['frag', 'smoke', 'flash'];

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar Vest', price: 650 },
  helmet: { id: 'helmet', name: 'Vest + Helmet', price: 1000 },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, team: TEAM.DEF },
};

// The buy menu, in the order its keys number it.
export const SHOP = [
  { group: 'Pistols', items: ['brute'] },
  { group: 'SMGs', items: ['wasp'] },
  { group: 'Rifles', items: ['marlin', 'gull', 'harpoon'] },
  { group: 'Gear', items: ['vest', 'helmet', 'kit'] },
  { group: 'Grenades', items: ['frag', 'smoke', 'flash'] },
];

// Bot skill: how fast they notice, turn and settle their aim.
export const BOT = {
  fov: Math.PI * 0.62,          // half-angle of the view cone
  viewRange: 70,
  senseTick: 0.12,
  reaction: [0.24, 0.42],
  turnRate: 5.2,                // rad/s while tracking
  aimError: [0.05, 0.012],      // starting and settled aim error (radians)
  settle: 0.9,                  // seconds to settle from start to best error
  burst: [3, 6],
  burstPause: [0.22, 0.4],
  engageRange: { pistol: 26, smg: 32, rifle: 60, sniper: 80, melee: 4 }, // beyond this a bot keeps to its plan
  hearRange: { shot: 42, step: 13, reload: 8, plant: 26, defuse: 22, bounce: 14 },
  names: ['Brine', 'Corvo', 'Dace', 'Ferro', 'Gannet', 'Hake', 'Ivo', 'Jetty', 'Kestrel', 'Lugger'],
};
