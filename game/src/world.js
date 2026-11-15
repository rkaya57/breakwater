// The harbour scene, built from the map grid: pier and asphalt floors, warehouses grouped by building,
// shipping containers, crates, the pump machinery, railings over the water, cranes and ships on the
// horizon, sodium lamps and the dusk sky. Every solid you see is a cell the simulation collides with.
import * as THREE from 'three';
import { COLS, ROWS, KIND, kindAt, cellX, cellZ, zoneRects, SPOTS } from './map.js';
import { CELL } from './config.js';
import { createRng } from './rng.js';

const WALL_H = 5.2;

// A box whose UVs repeat once per `tile` metres on every face, so one texture fits any size.
function tiledBox(w, h, d, tile) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[face][0] / tile, uv.getY(i) * dims[face][1] / tile);
    }
  }
  return geo;
}

function mesh(geo, mat, x, y, z, shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadows; m.receiveShadow = true;
  return m;
}

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.55, 0.16, 0.82).normalize() } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zenith = vec3(0.10, 0.15, 0.30);
        vec3 band = vec3(0.98, 0.58, 0.36);
        vec3 horizon = vec3(1.0, 0.78, 0.55);
        vec3 col = mix(horizon, band, smoothstep(0.0, 0.08, h));
        col = mix(col, zenith, smoothstep(0.08, 0.6, h));
        float sun = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0, 0.62, 0.3) * pow(sun, 18.0) * 0.6 + vec3(1.0, 0.85, 0.6) * pow(sun, 900.0) * 2.0;
        float streak = sin(vDir.x * 9.0 + vDir.z * 4.0) * 0.5 + 0.5;          // thin cloud bands
        col = mix(col, vec3(0.86, 0.45, 0.42), smoothstep(0.06, 0.2, h) * smoothstep(0.32, 0.16, h) * streak * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
}

function water() {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float time;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        world.y += sin(world.x * 0.35 + time * 1.1) * 0.08 + cos(world.z * 0.27 + time * 0.8) * 0.08;
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float time;
      varying vec3 vWorld;
      void main() {
        float ripple = sin(vWorld.x * 1.7 + time * 1.9) * sin(vWorld.z * 1.3 - time * 1.4);
        float glint = smoothstep(0.82, 1.0, ripple) * smoothstep(-40.0, 60.0, vWorld.z);
        vec3 deep = vec3(0.04, 0.17, 0.21);
        vec3 lit = vec3(0.35, 0.36, 0.33);
        vec3 col = mix(deep, lit, 0.25 + ripple * 0.12) + vec3(1.0, 0.62, 0.32) * glint * 0.55;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 500, 60, 60), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -1.3;
  return m;
}

// Groups wall cells into buildings so each building gets one facade material.
function buildingIds() {
  const ids = new Int16Array(COLS * ROWS).fill(-1);
  let next = 0;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (kindAt(c, r) !== KIND.WALL || ids[r * COLS + c] >= 0) continue;
      const stack = [[c, r]];
      ids[r * COLS + c] = next;
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (kindAt(nx, ny) === KIND.WALL && ids[ny * COLS + nx] < 0) { ids[ny * COLS + nx] = next; stack.push([nx, ny]); }
        }
      }
      next += 1;
    }
  }
  return ids;
}

function exposed(c, r) {
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
    const k = kindAt(c + dc, r + dr);
    if (k !== KIND.WALL && k !== KIND.VOID) return true;
  }
  return false;
}

function buildWalls(group, tex, rng) {
  const ids = buildingIds();
  const facades = [
    new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: tex.darkConcrete, roughness: 0.9 }),
  ];
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.8 });
  const glassLit = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 1.1 });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.2, metalness: 0.6 });
  const pane = new THREE.PlaneGeometry(1.1, 1.3);
  for (let r = 0; r < ROWS; r += 1) {
    let c = 0;
    while (c < COLS) {
      if (kindAt(c, r) !== KIND.WALL || !exposed(c, r)) { c += 1; continue; }
      const id = ids[r * COLS + c];
      let end = c;
      while (end + 1 < COLS && kindAt(end + 1, r) === KIND.WALL && exposed(end + 1, r) && ids[r * COLS + end + 1] === id) end += 1;
      const w = (end - c + 1) * CELL;
      const x = (cellX(c) + cellX(end)) / 2; const z = cellZ(r);
      const height = WALL_H + (id % 3) * 0.8;
      group.add(mesh(tiledBox(w, height, CELL, 4), facades[id % facades.length], x, height / 2, z));
      group.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.22, CELL + 0.12), trim, x, height + 0.11, z, false));
      c = end + 1;
    }
  }
  // windows on faces that look onto the playable floor
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    if (kindAt(c, r) !== KIND.WALL) continue;
    for (const [dc, dr, rot] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      if (kindAt(c + dc, r + dr) !== KIND.FLOOR || !rng.chance(0.28)) continue;
      const m = new THREE.Mesh(pane, rng.chance(0.4) ? glassLit : glassDark);
      m.position.set(cellX(c) + dc * 1.01, 3.3, cellZ(r) + dr * 1.01);
      m.rotation.y = rot;
      group.add(m);
    }
  }
}

function runs(kind, fn) {
  for (let r = 0; r < ROWS; r += 1) {
    let c = 0;
    while (c < COLS) {
      if (kindAt(c, r) !== kind) { c += 1; continue; }
      let end = c;
      while (end + 1 < COLS && kindAt(end + 1, r) === kind) end += 1;
      fn(c, end, r);
      c = end + 1;
    }
  }
}

function buildProps(group, tex, rng) {
  const containerMats = tex.containers.map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.65, metalness: 0.35 }));
  runs(KIND.CONTAINER, (c0, c1, r) => {
    const w = (c1 - c0 + 1) * CELL - 0.1;
    group.add(mesh(tiledBox(w, 2.6, 1.95, 2.6), containerMats[(c0 * 3 + r) % containerMats.length], (cellX(c0) + cellX(c1)) / 2, 1.3, cellZ(r)));
  });
  const crate = new THREE.MeshStandardMaterial({ map: tex.planks, roughness: 0.85 });
  const crateGeo = new THREE.BoxGeometry(1.96, 0.86, 1.96);
  const stackGeo = new THREE.BoxGeometry(1.7, 1.02, 1.7);
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    const k = kindAt(c, r);
    if (k === KIND.CRATE) {
      const m = mesh(crateGeo, crate, cellX(c), 0.43, cellZ(r));
      m.rotation.y = rng.range(-0.04, 0.04);
      group.add(m);
    } else if (k === KIND.STACK) {
      group.add(mesh(new THREE.BoxGeometry(1.96, 0.88, 1.96), crate, cellX(c), 0.44, cellZ(r)));
      const top = mesh(stackGeo, crate, cellX(c) + rng.range(-0.1, 0.1), 0.88 + 0.51, cellZ(r) + rng.range(-0.1, 0.1));
      top.rotation.y = rng.range(-0.3, 0.3);
      group.add(top);
    }
  }
  // the pump: a steel skid, two tanks and a pipe manifold over cells (30..31, 9..10)
  const steel = new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.5, metalness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x8e4a33, roughness: 0.62, metalness: 0.35 });
  const px = (cellX(30) + cellX(31)) / 2; const pz = (cellZ(9) + cellZ(10)) / 2;
  group.add(mesh(new THREE.BoxGeometry(3.9, 0.4, 3.9), steel, px, 0.2, pz));
  for (const dx of [-0.95, 0.95]) {
    const tank = mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.9, 20), paint, px + dx, 1.35, pz);
    group.add(tank);
    group.add(mesh(new THREE.SphereGeometry(0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, px + dx, 2.3, pz));
    for (const y of [0.75, 1.95]) group.add(mesh(new THREE.TorusGeometry(0.86, 0.035, 6, 24), steel, px + dx, y, pz, false).rotateX(Math.PI / 2));
  }
  const pipe = new THREE.CylinderGeometry(0.16, 0.16, 3.9, 10);
  const p1 = mesh(pipe, steel, px, 1.9, pz + 1.3); p1.rotation.z = Math.PI / 2; group.add(p1);
  const p2 = mesh(pipe, steel, px, 0.9, pz - 1.3); p2.rotation.z = Math.PI / 2; group.add(p2);
}

function buildFloors(group, tex) {
  const asphalt = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95 });
  tex.asphalt.repeat.set(COLS / 2, ROWS / 2);
  const width = (COLS - 1) * CELL; const depth = ROWS * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), asphalt);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cellX(1) - CELL / 2 + width / 2, 0, 0);
  floor.receiveShadow = true;
  group.add(floor);
  const pier = new THREE.MeshStandardMaterial({ map: tex.pier, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
  const pierZones = ['Crane Yard', 'Breakwater', 'Long Corner', 'Saltjacker Slip', 'Tidewarden Dock', 'Pump House'];
  for (const z of zoneRects()) {
    if (!pierZones.includes(z.name)) continue;
    const w = z.x1 - z.x0; const d = z.z1 - z.z0;
    const map = tex.pier.clone(); map.repeat.set(w / 6, d / 6); map.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pier.clone());
    m.material.map = map;
    m.rotation.x = -Math.PI / 2;
    m.position.set((z.x0 + z.x1) / 2, 0.005, (z.z0 + z.z1) / 2);
    m.receiveShadow = true;
    group.add(m);
  }
  // the quay wall dropping into the water along the west pier and behind both spawns
  const quay = new THREE.MeshStandardMaterial({ map: tex.darkConcrete, roughness: 0.95 });
  group.add(mesh(tiledBox(0.6, 1.6, ROWS * CELL, 3), quay, cellX(1) - CELL / 2 - 0.3, -0.8, 0, false));
  // site letters painted on the ground
  for (const [site, color] of [['A', 'rgba(242,193,78,0.7)'], ['B', 'rgba(242,193,78,0.7)']]) {
    const p = SPOTS.plant[site];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshStandardMaterial({ map: tex.letter(site, color), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.012, p.z);
    m.receiveShadow = true;
    group.add(m);
  }
}

function buildRails(group) {
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9a632, roughness: 0.6, metalness: 0.4 });
  const post = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6);
  runs(KIND.RAIL, (c0, c1, r) => { // horizontal rails
    if (c0 === c1) return;
    const x0 = cellX(c0) - 1; const x1 = cellX(c1) + 1; const z = cellZ(r) + (r === 0 ? 0.8 : -0.8);
    for (let x = x0; x <= x1 + 0.01; x += 2) group.add(mesh(post, yellow, x, 0.52, z, false));
    for (const y of [0.55, 1.02]) group.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 0.06), yellow, (x0 + x1) / 2, y, z, false));
  });
  // the long western railing along column 1
  const x = cellX(1) - 0.8;
  let r0 = 0;
  while (r0 < ROWS && kindAt(1, r0) !== KIND.RAIL) r0 += 1;
  let r1 = r0;
  while (r1 + 1 < ROWS && kindAt(1, r1 + 1) === KIND.RAIL) r1 += 1;
  const z0 = cellZ(r0) - 1; const z1 = cellZ(r1) + 1;
  for (let z = z0; z <= z1 + 0.01; z += 2) group.add(mesh(post, yellow, x, 0.52, z, false));
  for (const y of [0.55, 1.02]) group.add(mesh(new THREE.BoxGeometry(0.06, 0.06, z1 - z0), yellow, x, y, (z0 + z1) / 2, false));
}

function crane(group, x, z, rot, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
  const c = new THREE.Group();
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) c.add(mesh(new THREE.BoxGeometry(0.6, 22, 0.6), mat, dx, 11, dz, true));
  for (const y of [7, 14, 21]) {
    c.add(mesh(new THREE.BoxGeometry(6.6, 0.4, 0.4), mat, 0, y, -3, false));
    c.add(mesh(new THREE.BoxGeometry(6.6, 0.4, 0.4), mat, 0, y, 3, false));
  }
  c.add(mesh(new THREE.BoxGeometry(1.2, 1.4, 40), mat, 0, 23, 6, true));
  c.add(mesh(new THREE.BoxGeometry(4, 3, 4), mat, 0, 25, -4, true));
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 14, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  cable.position.set(0, 16, 18);
  c.add(cable);
  c.position.set(x, -1.3, z);
  c.rotation.y = rot;
  group.add(c);
}

function ship(group, x, z, rot, hull, tex) {
  const s = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: hull, roughness: 0.7 });
  s.add(mesh(new THREE.BoxGeometry(60, 7, 12), hullMat, 0, 2, 0, false));
  s.add(mesh(new THREE.BoxGeometry(10, 9, 10), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 }), 22, 9, 0, false));
  const mats = tex.containers.map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.7 }));
  for (let i = 0; i < 6; i += 1) for (let k = 0; k < 2; k += 1) {
    s.add(mesh(new THREE.BoxGeometry(6, 2.6, 2.4), mats[(i + k * 2) % mats.length], -22 + i * 6.5, 6.8 + k * 2.6, (i % 2 ? -2.5 : 2.5), false));
  }
  s.position.set(x, -1.3, z);
  s.rotation.y = rot;
  group.add(s);
}

function lamps(group) {
  const pole = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.5 });
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  const lightCone = new THREE.ConeGeometry(2.4, 5.8, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const places = [[3, 10], [36, 10], [20, 14], [25, 34], [4, 24], [35, 26], [10, 3], [30, 4]];
  places.forEach(([c, r], i) => {
    const x = cellX(c) + (c < 20 ? -0.7 : 0.7); const z = cellZ(r);
    group.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), pole, x, 3, z, true));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), bulb);
    head.position.set(x, 6, z);
    group.add(head);
    group.add(mesh(lightCone, coneMat, x, 3.1, z, false)); // the lamp's haze
    if (i < 4) { // only a few real lights; the rest glow
      const light = new THREE.PointLight(0xffa54a, 22, 18, 1.6);
      light.position.set(x, 5.6, z);
      group.add(light);
    }
  });
  // string lights over the fish market
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc66b }), 60);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 60; i += 1) {
    const t = (i % 20) / 19; const line = Math.floor(i / 20);
    const z = cellZ(8 + line * 7) + Math.sin(t * Math.PI) * 0.4;
    m.makeTranslation(cellX(16) - 1 + t * 16, 4.2 - Math.sin(t * Math.PI) * 0.9, z);
    bulbs.setMatrixAt(i, m);
  }
  group.add(bulbs);
  // awnings over the market stalls
  const cloth = [0x2f7a83, 0xc4932c, 0xa8432c];
  [[18, 10], [21, 13], [17, 17], [22, 20], [19, 24]].forEach(([c, r], i) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 2.2), new THREE.MeshStandardMaterial({ color: cloth[i % 3], roughness: 0.9 }));
    a.position.set(cellX(c), 2.5, cellZ(r));
    a.rotation.z = 0.12;
    a.castShadow = true;
    group.add(a);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 5), pole, cellX(c) + dx * 0.95, 1.25, cellZ(r) + dz * 0.95, false));
  });
}

function signs(group, tex) {
  const list = [
    ['CRANE YARD', 'SITE A', 3.5, 6, 'S'], ['PUMP HOUSE', 'SITE B', 29.5, 6, 'S'], ['FISH MARKET', 'MID', 15, 11, 'E'],
    ['CULVERT', 'B LONG', 32, 24, 'E'], ['NET LOFT', 'A SHORT', 11, 19, 'N'], ['BREAKWATER', 'A LONG', 6, 22, 'W'],
    ['ICE HOUSE', 'B SHORT', 25, 12, 'N'], ['SALTJACKER SLIP', '', 8, 33, 'N'], ['TIDEWARDEN DOCK', '', 14, 2, 'E'],
  ];
  const faces = { S: [0, 1, 0], N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };
  list.forEach(([text, sub, c, r, f], i) => {
    const [dx, dz, rot] = faces[f];
    const sign = tex.sign(text, sub, i % 2 ? '#1f4d55' : '#2a2d33', i % 2 ? '#f2e6c9' : '#f2c14e');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 }));
    m.position.set(cellX(Math.floor(c)) + (c % 1) * CELL + dx * 1.02, 3.6, cellZ(r) + dz * 1.02);
    m.rotation.y = rot;
    group.add(m);
  });
}

// `tex` is the painted texture set (textures.js), handed in by the caller; the renderer prefilters
// the dusk sky into the environment map every glossy surface reflects.
export function createWorld(scene, tex, renderer) {
  const rng = createRng(4242);
  const group = new THREE.Group();
  scene.add(group);

  scene.background = new THREE.Color(0xf0a070);
  scene.fog = new THREE.Fog(0xd98d6a, 40, 170);
  const sky = skyDome();
  group.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0.03).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();
  const sea = water();
  group.add(sea);

  const hemi = new THREE.HemisphereLight(0xffd2b0, 0x3a4a56, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb27a, 2.6);
  sun.position.set(-38, 26, 52);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 50, bottom: -50, near: 1, far: 160 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  buildFloors(group, tex);
  buildWalls(group, tex, rng);
  buildProps(group, tex, rng);
  buildRails(group);
  lamps(group);
  signs(group, tex);
  crane(group, -52, -6, 0, 0xd9a632);
  crane(group, -52, 22, 0, 0xc04a2c);
  crane(group, 12, -60, Math.PI / 2, 0x2f7a83);
  ship(group, -10, 56, 0.05, 0x2c3e5c, tex);
  ship(group, 30, -58, Math.PI - 0.08, 0x8a2f24, tex);

  return {
    group,
    update(time) { sea.material.uniforms.time.value = time; },
  };
}
