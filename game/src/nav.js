// Bot navigation: A* over the map's floor cells (8 directions, no corner cutting), then string-pulling
// so a bot walks straight lines between the corners it really has to turn at.
import { COLS, ROWS, walkable, cellX, cellZ, colOf, rowOf } from './map.js';

const N = COLS * ROWS;
const gScore = new Float32Array(N);
const fScore = new Float32Array(N);
const came = new Int32Array(N);
const closed = new Uint8Array(N);
const heap = new Int32Array(N * 8);
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

function heapPush(size, node) {
  let i = size;
  heap[i] = node;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[i]]) break;
    const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
  }
  return size + 1;
}

function heapPop(size) {
  const top = heap[0];
  heap[0] = heap[size - 1];
  let i = 0;
  const n = size - 1;
  for (;;) {
    const l = i * 2 + 1; const r = l + 1;
    let m = i;
    if (l < n && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < n && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m === i) break;
    const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
  }
  return top;
}

function nearestWalkable(c, r) {
  if (walkable(c, r)) return r * COLS + c;
  for (let d = 1; d < 4; d += 1) {
    for (let dr = -d; dr <= d; dr += 1) for (let dc = -d; dc <= d; dc += 1) if (walkable(c + dc, r + dr)) return (r + dr) * COLS + c + dc;
  }
  return -1;
}

// Can a bot walk straight from a to b? Samples the segment every half metre against a padded footprint.
function clearLine(ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / 0.5);
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = ax + (bx - ax) * t; const z = az + (bz - az) * t;
    if (!walkable(colOf(x - 0.42), rowOf(z - 0.42)) || !walkable(colOf(x + 0.42), rowOf(z - 0.42))
      || !walkable(colOf(x - 0.42), rowOf(z + 0.42)) || !walkable(colOf(x + 0.42), rowOf(z + 0.42))) return false;
  }
  return true;
}

// Returns a list of {x, z} waypoints from (sx, sz) to (tx, tz), or an empty list when unreachable.
export function findPath(sx, sz, tx, tz) {
  const start = nearestWalkable(colOf(sx), rowOf(sz));
  const goal = nearestWalkable(colOf(tx), rowOf(tz));
  if (start < 0 || goal < 0) return [];
  closed.fill(0);
  gScore.fill(Infinity);
  const gc = goal % COLS; const gr = (goal / COLS) | 0;
  gScore[start] = 0;
  fScore[start] = Math.hypot(gc - start % COLS, gr - ((start / COLS) | 0));
  came[start] = -1;
  let size = heapPush(0, start);
  while (size > 0) {
    const cur = heapPop(size); size -= 1;
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % COLS; const r = (cur / COLS) | 0;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc; const nr = r + dr;
      if (!walkable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!walkable(c + dc, r) || !walkable(c, r + dr))) continue;
      const next = nr * COLS + nc;
      const g = gScore[cur] + cost;
      if (g < gScore[next]) {
        gScore[next] = g;
        fScore[next] = g + Math.hypot(gc - nc, gr - nr);
        came[next] = cur;
        if (size < heap.length) size = heapPush(size, next);
      }
    }
  }
  if (gScore[goal] === Infinity) return [];
  const cells = [];
  for (let n = goal; n !== -1; n = came[n]) cells.push(n);
  cells.reverse();
  const points = cells.map((n) => ({ x: cellX(n % COLS), z: cellZ((n / COLS) | 0) }));
  points[points.length - 1] = { x: tx, z: tz };
  // string-pull: skip every waypoint the bot can already walk past in a straight line
  const out = [];
  let anchorX = sx; let anchorZ = sz;
  let i = 0;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !clearLine(anchorX, anchorZ, points[j].x, points[j].z)) j -= 1;
    out.push(points[j]);
    anchorX = points[j].x; anchorZ = points[j].z;
    i = j + 1;
  }
  return out;
}
