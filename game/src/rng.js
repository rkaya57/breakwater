// Seeded random numbers (mulberry32). The simulation never calls Math.random, so a seed replays a match.

export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}
