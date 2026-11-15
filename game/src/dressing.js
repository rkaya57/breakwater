// Harbour dressing: detail that makes the docks feel lived in without touching play. Everything here
// sits on wall faces, in the water or in the sky, never on a walkable cell, so what you see still
// matches what the simulation collides with: roller doors, downpipes, air-conditioning boxes and door
// lamps on the warehouses, puddles that catch the sky, bollards and tyre fenders on the quay, a
// lighthouse with a turning beam, a city skyline across the water and gulls wheeling overhead.
import * as THREE from 'three';
import { COLS, ROWS, KIND, kindAt, cellX, cellZ, ORIGIN_X } from './map.js';
import { CELL } from './config.js';
import { createRng } from './rng.js';

const FACES = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];

function put(group, geo, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

// Fixtures on warehouse faces that look onto the floor, one per chosen face.
function wallFixtures(group, tex, rng) {
  const door = new THREE.MeshStandardMaterial({ map: tex.metal, color: 0x9aa4a8, roughness: 0.55, metalness: 0.6 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x4a5257, roughness: 0.5, metalness: 0.7 });
  const unit = new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.6, metalness: 0.3 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb056, emissiveIntensity: 2.2 });
  const doorGeo = new THREE.BoxGeometry(1.7, 2.6, 0.1);
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 5, 8);
  const unitGeo = new THREE.BoxGeometry(0.9, 0.6, 0.45);
  const fanGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14);
  const lampGeo = new THREE.BoxGeometry(0.22, 0.12, 0.16);
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    if (kindAt(c, r) !== KIND.WALL) continue;
    for (const [dc, dr, rot] of FACES) {
      if (kindAt(c + dc, r + dr) !== KIND.FLOOR) continue;
      const roll = rng();
      const fx = (d) => cellX(c) + dc * (CELL / 2 + d);
      const fz = (d) => cellZ(r) + dr * (CELL / 2 + d);
      if (roll < 0.1) {
        put(group, doorGeo, door, fx(0.05), 1.3, fz(0.05), rot);
        put(group, lampGeo, lamp, fx(0.1), 2.95, fz(0.1), rot);
      } else if (roll < 0.2) {
        const side = rng() < 0.5 ? -0.8 : 0.8;
        put(group, pipeGeo, pipe, fx(0.08) + dr * side, 2.5, fz(0.08) + dc * side);
      } else if (roll < 0.27) {
        put(group, unitGeo, unit, fx(0.24), 3.4, fz(0.24), rot);
        const fan = put(group, fanGeo, pipe, fx(0.47), 3.4, fz(0.47), rot);
        fan.rotation.x = Math.PI / 2;
      }
    }
  }
}

// Shallow standing water: dark, glossy patches that mirror the sky and the lamps.
function puddles(group, rng) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
  const geo = new THREE.CircleGeometry(1, 20);
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    if (kindAt(c, r) !== KIND.FLOOR || rng() > 0.045) continue;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.5 + rng() * 0.6, 0.3 + rng() * 0.5, 1);
    m.rotation.z = rng() * Math.PI;
    m.position.set(cellX(c) + (rng() - 0.5) * 0.8, 0.012, cellZ(r) + (rng() - 0.5) * 0.8);
    m.receiveShadow = true;
    group.add(m);
  }
}

// Bollards along the west quay edge and tyre fenders hanging over the water below them.
function quayside(group) {
  const iron = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.95 });
  const x = ORIGIN_X + CELL - 0.25;
  for (let z = -30; z <= 30; z += 6) {
    put(group, new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), iron, x - 0.2, 0.25, z);
    put(group, new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), iron, x - 0.2, 0.52, z);
    const tyre = put(group, new THREE.TorusGeometry(0.42, 0.16, 8, 16), rubber, x - 0.55, -0.55, z + 3);
    tyre.rotation.y = Math.PI / 2;
    const line = put(group, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), rope, x - 0.45, -0.05, z + 3);
    line.rotation.x = 0.1;
  }
}

// A lighthouse at the end of a stone breakwater out in the bay, its lamp beam turning.
function lighthouse(group) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa8342a, roughness: 0.8 });
  const lh = new THREE.Group();
  lh.position.set(-112, -1.3, 34);
  for (let i = 0; i < 14; i += 1) lh.add(new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 4.4), stone).translateX(i * 4.6 + 2).translateY(0.6));
  for (let i = 0; i < 5; i += 1) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.1 - i * 0.22, 2.32 - i * 0.22, 3.2, 20), i % 2 ? red : white);
    band.position.y = 3.4 + i * 3.2;
    lh.add(band);
  }
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 16), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false }));
  glow.position.y = 19.5;
  lh.add(glow);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 16), red);
  cap.position.y = 21.1;
  lh.add(cap);
  const beamGeo = new THREE.ConeGeometry(4, 60, 20, 1, true);
  beamGeo.translate(0, -30, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 19.5;
  lh.add(beam);
  group.add(lh);
  return beam;
}

// A low city skyline far across the water with a scatter of lit windows; unfogged so it reads as a silhouette.
function skyline(group, rng) {
  const dark = new THREE.MeshBasicMaterial({ color: 0x5a4352, fog: false });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffcf7a, fog: false });
  const win = new THREE.PlaneGeometry(0.9, 1.2);
  for (const [cx, cz, along] of [[-285, 0, [0, 0, 1]], [0, -285, [1, 0, 0]]]) {
    for (let i = -14; i <= 14; i += 1) {
      const w = 6 + rng() * 10; const h = 5 + rng() * 17;
      const x = cx + along[0] * i * 15; const z = cz + along[2] * i * 15;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), dark);
      b.position.set(x, h / 2 - 2, z);
      group.add(b);
      for (let k = 0; k < 4; k += 1) {
        const wm = new THREE.Mesh(win, lit);
        const facing = cx !== 0 ? Math.PI / 2 : 0;
        wm.rotation.y = facing;
        wm.position.set(x + (cx !== 0 ? w / 2 + 0.05 : (rng() - 0.5) * w * 0.8), 2 + rng() * (h - 4), z + (cz !== 0 ? w / 2 + 0.05 : (rng() - 0.5) * w * 0.8));
        group.add(wm);
      }
    }
  }
}

// Gulls: flat V shapes circling high over the docks.
function gulls(group, rng) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1e1b1f, side: THREE.DoubleSide });
  const wing = new THREE.PlaneGeometry(0.7, 0.16).rotateX(-Math.PI / 2);
  const flock = [];
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wing, mat); l.position.x = -0.32; const r = new THREE.Mesh(wing, mat); r.position.x = 0.32;
    g.add(l, r);
    group.add(g);
    flock.push({ g, l, r, radius: 25 + rng() * 40, height: 16 + rng() * 14, speed: 0.08 + rng() * 0.08, phase: rng() * Math.PI * 2, cx: (rng() - 0.5) * 40, cz: (rng() - 0.5) * 40 });
  }
  return flock;
}

// Builds the dressing into `group` (the world's) and returns its per-frame animation.
export function dressHarbour(group, tex) {
  const rng = createRng(7171);
  wallFixtures(group, tex, rng);
  puddles(group, rng);
  quayside(group);
  skyline(group, rng);
  const beam = lighthouse(group);
  const flock = gulls(group, rng);
  return function update(time) {
    beam.rotation.y = time * 0.6;
    for (const b of flock) {
      const a = b.phase + time * b.speed;
      b.g.position.set(b.cx + Math.cos(a) * b.radius, b.height + Math.sin(time * 0.7 + b.phase) * 1.5, b.cz + Math.sin(a) * b.radius);
      b.g.rotation.y = -a;
      const flap = Math.sin(time * 6 + b.phase) * 0.45;
      b.l.rotation.z = 0.25 + flap; b.r.rotation.z = -0.25 - flap;
    }
  };
}
