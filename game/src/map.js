// Breakwater, the map: a harbour at dusk on a 40 x 36 grid of 2 m cells. Everything starts solid;
// named zones are carved out as floor, then cover is placed inside them. The grid is the single
// source of truth for collision, bullets, line of sight, navigation, the radar and the callouts.
import { CELL } from './config.js';

export const COLS = 40;
export const ROWS = 36;
export const ORIGIN_X = -COLS * CELL / 2;
export const ORIGIN_Z = -ROWS * CELL / 2;

// Cell kinds. shot: height a bullet must clear; move: height that blocks walking (Infinity: never passable).
export const KIND = { FLOOR: 0, WALL: 1, CONTAINER: 2, CRATE: 3, STACK: 4, MACHINE: 5, RAIL: 6, VOID: 7 };
const KIND_HEIGHT = [
  { shot: 0, move: 0 },
  { shot: 5.2, move: Infinity },
  { shot: 2.6, move: Infinity },
  { shot: 0.86, move: 0.86 },
  { shot: 1.9, move: Infinity },
  { shot: 2.3, move: Infinity },
  { shot: 1.05, move: Infinity },
  { shot: 0, move: Infinity },
];

// Callout zones, carved in order: [name, c0, r0, c1, r1, site]. Later zones win where they overlap.
const ZONES = [
  ['Tidewarden Dock', 15, 1, 24, 4],
  ['North Quay', 4, 2, 14, 5],
  ['Pump Road', 25, 2, 36, 5],
  ['Crane Yard', 2, 6, 13, 14, 'A'],
  ['Pump House', 27, 6, 37, 14, 'B'],
  ['Fish Market', 16, 5, 23, 27],
  ['Loft Stairs', 9, 14, 11, 15],
  ['Net Loft', 9, 16, 16, 18],
  ['Ice House', 24, 9, 26, 11],
  ['Breakwater', 2, 15, 5, 28],
  ['Long Corner', 2, 29, 13, 32],
  ['Market Gate', 18, 27, 21, 28],
  ['Saltjacker Slip', 14, 29, 25, 34],
  ['Culvert Mouth', 26, 29, 32, 32],
  ['Culvert', 33, 15, 37, 32],
];

// Pieces placed after carving: [kind, c0, r0, c1, r1].
const PIECES = [
  // the pier edges: low railings over the water
  [KIND.RAIL, 1, 6, 1, 32], [KIND.VOID, 0, 0, 0, 35],
  [KIND.RAIL, 14, 35, 25, 35], [KIND.RAIL, 15, 0, 24, 0],
  // Crane Yard (A)
  [KIND.WALL, 2, 6, 5, 6], [KIND.CONTAINER, 4, 8, 6, 8], [KIND.CONTAINER, 9, 11, 11, 11], [KIND.CRATE, 7, 12, 7, 12],
  [KIND.CRATE, 12, 7, 12, 7], [KIND.STACK, 3, 13, 3, 13], [KIND.CRATE, 12, 13, 12, 13],
  // Pump House (B): north wall with a door, machinery and crates
  [KIND.WALL, 27, 6, 32, 6], [KIND.MACHINE, 30, 9, 31, 10], [KIND.CRATE, 34, 8, 34, 8], [KIND.STACK, 36, 12, 36, 12],
  [KIND.CRATE, 28, 13, 28, 13], [KIND.CRATE, 37, 15, 37, 15],
  // routes
  [KIND.CONTAINER, 8, 3, 10, 3], [KIND.CONTAINER, 8, 30, 10, 30], [KIND.CRATE, 3, 22, 3, 22], [KIND.STACK, 4, 26, 4, 26],
  [KIND.STACK, 13, 17, 13, 17], [KIND.STACK, 28, 3, 28, 3], [KIND.CRATE, 34, 22, 34, 22], [KIND.STACK, 36, 27, 36, 27],
  [KIND.CRATE, 16, 31, 16, 31], [KIND.CRATE, 23, 32, 23, 32], [KIND.CRATE, 17, 2, 17, 2], [KIND.CRATE, 22, 2, 22, 2],
  // warehouse corners that break the long southern sightline into chicanes
  [KIND.WALL, 12, 29, 13, 30], [KIND.WALL, 26, 31, 27, 32],
  // Fish Market stalls
  [KIND.STACK, 18, 6, 18, 6], [KIND.CRATE, 18, 10, 18, 10], [KIND.CRATE, 21, 13, 21, 13], [KIND.CRATE, 17, 17, 17, 17],
  [KIND.CRATE, 22, 20, 22, 20], [KIND.CRATE, 19, 24, 19, 24], [KIND.CONTAINER, 30, 30, 31, 30],
  // the ice truck splits mid in two lanes, and a crate wall hides the slip from the market
  [KIND.CONTAINER, 19, 21, 21, 21], [KIND.STACK, 19, 30, 20, 30],
];

export const SITE_RECTS = { A: [5, 7, 11, 12], B: [28, 8, 36, 13] };

export function cellX(c) { return ORIGIN_X + (c + 0.5) * CELL; }
export function cellZ(r) { return ORIGIN_Z + (r + 0.5) * CELL; }
export function colOf(x) { return Math.floor((x - ORIGIN_X) / CELL); }
export function rowOf(z) { return Math.floor((z - ORIGIN_Z) / CELL); }
function at(c, r) { return { x: cellX(c), z: cellZ(r), c, r }; }
function spot(c, r, lookC, lookR) {
  return { ...at(c, r), yaw: Math.atan2(-(cellX(lookC) - cellX(c)), -(cellZ(lookR) - cellZ(r))) };
}

// Named places the bots plan with; every one is a floor cell.
export const SPOTS = {
  spawns: [
    [at(17, 32), at(19, 31), at(21, 32), at(22, 30), at(19, 33)],
    [at(17, 3), at(19, 2), at(21, 3), at(20, 4), at(18, 4)],
  ],
  plant: { A: at(8, 9), B: at(33, 12) },
  holds: {
    A: [spot(3, 8, 3, 18), spot(12, 9, 10, 16), spot(8, 7, 10, 15)],
    B: [spot(36, 9, 35, 16), spot(29, 12, 25, 10), spot(33, 9, 27, 10)],
    mid: [spot(21, 6, 20, 26)],
  },
  postPlant: {
    A: [spot(3, 16, 8, 9), spot(11, 15, 8, 9), spot(13, 10, 8, 9)],
    B: [spot(35, 17, 33, 12), spot(26, 10, 33, 12), spot(35, 8, 33, 12)],
  },
  routes: {
    A: [
      { name: 'long', path: [at(4, 31), at(3, 23), at(3, 16)], smoke: at(4, 11), flash: at(4, 12) },
      { name: 'short', path: [at(20, 28), at(20, 19), at(15, 17), at(10, 16)], smoke: at(9, 9), flash: at(10, 12) },
    ],
    B: [
      { name: 'culvert', path: [at(28, 31), at(35, 23), at(35, 16)], smoke: at(35, 11), flash: at(35, 12) },
      { name: 'ice', path: [at(20, 28), at(20, 12), at(25, 10)], smoke: at(30, 12), flash: at(29, 11) },
    ],
  },
  rotate: { A: at(10, 4), B: at(30, 4) },
};

function buildGrid() {
  const kind = new Uint8Array(COLS * ROWS).fill(KIND.WALL);
  const zone = new Int8Array(COLS * ROWS).fill(-1);
  ZONES.forEach(([, c0, r0, c1, r1], index) => {
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { kind[r * COLS + c] = KIND.FLOOR; zone[r * COLS + c] = index; }
  });
  for (const [k, c0, r0, c1, r1] of PIECES) {
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) kind[r * COLS + c] = k;
  }
  return { kind, zone };
}

const GRID = buildGrid();

export function kindAt(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return KIND.VOID;
  return GRID.kind[r * COLS + c];
}
export function shotHeight(c, r) { return KIND_HEIGHT[kindAt(c, r)].shot; }
function moveHeight(c, r) { return KIND_HEIGHT[kindAt(c, r)].move; }
export function walkable(c, r) { return kindAt(c, r) === KIND.FLOOR; }

export function zoneName(x, z) {
  const c = colOf(x); const r = rowOf(z);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return '';
  const index = GRID.zone[r * COLS + c];
  return index >= 0 ? ZONES[index][0] : '';
}

export function siteAt(x, z) {
  const c = colOf(x); const r = rowOf(z);
  for (const site of ['A', 'B']) {
    const [c0, r0, c1, r1] = SITE_RECTS[site];
    if (c >= c0 && c <= c1 && r >= r0 && r <= r1) return site;
  }
  return null;
}

// World-space rectangles of the named zones, for floor paint and the radar.
export function zoneRects() {
  return ZONES.map(([name, c0, r0, c1, r1]) => ({ name, x0: cellX(c0) - CELL / 2, z0: cellZ(r0) - CELL / 2, x1: cellX(c1) + CELL / 2, z1: cellZ(r1) + CELL / 2 }));
}

export function zoneLabels() {
  return ZONES.map(([name, c0, r0, c1, r1, site]) => ({ name, site: site ?? null, x: (cellX(c0) + cellX(c1)) / 2, z: (cellZ(r0) + cellZ(r1)) / 2 }));
}

// Height of the ground under a circle of radius rad at (x, z): the highest walkable top (crates) or 0.
export function groundHeight(x, z, rad, feet) {
  let best = 0;
  const c0 = colOf(x - rad); const c1 = colOf(x + rad);
  const r0 = rowOf(z - rad); const r1 = rowOf(z + rad);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const h = moveHeight(c, r);
      if (h !== Infinity && h > best && h <= feet + 0.05) best = h;
    }
  }
  return best;
}

// Walls of a cell box: does a box of radius rad at (x, z) with feet at y overlap anything that blocks?
export function blocked(x, z, rad, feet, stepUp) {
  const c0 = colOf(x - rad); const c1 = colOf(x + rad);
  const r0 = rowOf(z - rad); const r1 = rowOf(z + rad);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (moveHeight(c, r) > feet + stepUp) return true;
    }
  }
  return false;
}

// Grid ray march (DDA). Returns the distance to the first cell face or top a ray from (ox,oy,oz)
// along the unit direction (dx,dy,dz) hits, or maxDist. The floor (y = 0) counts as a hit too.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
  let c = colOf(ox); let r = rowOf(oz);
  const stepC = dx > 0 ? 1 : -1; const stepR = dz > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tDeltaR = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  const nextX = ORIGIN_X + (c + (dx > 0 ? 1 : 0)) * CELL;
  const nextZ = ORIGIN_Z + (r + (dz > 0 ? 1 : 0)) * CELL;
  let tMaxC = dx !== 0 ? (nextX - ox) / dx : Infinity;
  let tMaxR = dz !== 0 ? (nextZ - oz) / dz : Infinity;
  const tFloor = dy < 0 ? -oy / dy : Infinity;
  let t = 0;
  for (let guard = 0; guard < 128; guard += 1) {
    const tExit = Math.min(tMaxC, tMaxR, maxDist, tFloor);
    const h = shotHeight(c, r);
    if (h > 0) {
      const yIn = oy + dy * t;
      if (yIn <= h) return t;                       // hit a side face
      const yOut = oy + dy * tExit;
      if (yOut <= h) return (h - oy) / dy;          // came down onto the top
    }
    if (tExit >= maxDist) return maxDist;
    if (tExit === tFloor) return tFloor;
    if (tMaxC < tMaxR) { t = tMaxC; tMaxC += tDeltaC; c += stepC; } else { t = tMaxR; tMaxR += tDeltaR; r += stepR; }
  }
  return maxDist;
}
