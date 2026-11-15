// Third-person soldiers, modelled from capsules and blocks in each team's colours: Saltjackers in rust work
// jackets and knit caps, Tidewardens in teal shells and helmets. Legs swing with speed, the body
// lowers in a crouch, the gun follows the aim, and the fallen topple over. Visuals only: hits are
// tested against the simulation's hit zones, which these shapes are built to match.
import * as THREE from 'three';
import { TEAMS, TEAM } from './config.js';

const WEAPON_LEN = { pistol: 0.32, smg: 0.55, rifle: 0.85, sniper: 1.1, melee: 0.4 };

function part(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// A limb segment hanging down from its pivot: a capsule of radius r and length len.
function limb(mat, r, len) {
  const g = new THREE.Group();
  g.add(part(cap(r, len), mat, 0, -len / 2, 0));
  return g;
}

// The carried gun, modelled pointing down -z from the grip at the origin, 0.8 m long; scaled per weapon.
function carriedGun(dark, tan) {
  const g = new THREE.Group();
  g.add(part(boxG(0.07, 0.11, 0.42), dark, 0, 0.02, -0.16), part(boxG(0.06, 0.07, 0.22), tan, 0, -0.01, 0.13),
    part(boxG(0.045, 0.16, 0.07), dark, 0, -0.1, -0.22), part(boxG(0.04, 0.1, 0.05), dark, 0, -0.07, -0.02),
    part(boxG(0.03, 0.04, 0.18), dark, 0, 0.09, -0.14), part(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 8), dark, 0, 0.03, -0.5));
  g.children[5].rotation.x = Math.PI / 2;
  return g;
}

function buildSoldier(team) {
  const t = TEAMS[team];
  const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const cloth = mat(t.cloth);
  const trousers = mat(team === TEAM.ATK ? 0x3f3a31 : 0x232f3a);
  const vest = mat(t.vest, 0.75);
  const trim = mat(t.trim, 0.6, { emissive: t.trim, emissiveIntensity: 0.18 });
  const skin = mat(0xc8916b, 0.8);
  const dark = mat(0x1d1f22, 0.5, { metalness: 0.5 });
  const boot = mat(0x2a221c, 0.7);
  const webbing = mat(team === TEAM.ATK ? 0x5a4a35 : 0x3a4a48, 0.8);
  const tan = mat(0x8a7350, 0.7);

  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // turn to the yaw first, then topple in the body's own frame
  const body = new THREE.Group(); // everything above the hips, lowered by a crouch
  root.add(body);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = limb(trousers, 0.095, 0.3);
    hip.position.set(side * 0.12, 0.82, 0);
    hip.add(part(boxG(0.08, 0.12, 0.12), webbing, side * 0.09, -0.2, 0)); // thigh pouch
    const knee = limb(trousers, 0.085, 0.26);
    knee.position.set(0, -0.46, 0);
    knee.add(part(boxG(0.15, 0.1, 0.06), dark, 0, -0.02, -0.08)); // knee pad
    knee.add(part(boxG(0.15, 0.11, 0.27), boot, 0, -0.38, -0.05));
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee });
  }
  // torso: hips, jacket, plate carrier with magazine pouches, belt, pack and radio
  body.add(part(boxG(0.42, 0.22, 0.25), trousers, 0, 0.92, 0));
  body.add(part(cap(0.2, 0.22), cloth, 0, 1.24, 0));
  body.add(part(boxG(0.44, 0.4, 0.3), vest, 0, 1.28, 0));
  body.add(part(boxG(0.47, 0.07, 0.32), trim, 0, 1.08, 0));
  for (const x of [-0.13, 0, 0.13]) body.add(part(boxG(0.1, 0.13, 0.06), webbing, x, 1.2, -0.17));
  body.add(part(boxG(0.36, 0.38, 0.16), team === TEAM.ATK ? tan : vest, 0, 1.3, 0.22)); // pack
  const antenna = part(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), dark, 0.13, 1.66, 0.25);
  body.add(antenna);
  for (const side of [-1, 1]) body.add(part(new THREE.SphereGeometry(0.1, 10, 8), cloth, side * 0.25, 1.44, 0)); // shoulders
  body.add(part(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), skin, 0, 1.52, 0)); // neck

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(part(new THREE.SphereGeometry(0.14, 16, 12), skin, 0, 0, 0));
  if (team === TEAM.DEF) {
    // ballistic helmet with ear cups, a visor strip and a night-vision mount
    head.add(part(new THREE.SphereGeometry(0.168, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), vest, 0, 0.015, 0));
    head.add(part(boxG(0.25, 0.055, 0.04), trim, 0, -0.01, -0.14));
    head.add(part(boxG(0.05, 0.06, 0.05), dark, 0, 0.09, -0.15));
    for (const side of [-1, 1]) head.add(part(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), dark, side * 0.15, -0.03, 0));
    head.children[head.children.length - 1].rotation.z = Math.PI / 2;
    head.children[head.children.length - 2].rotation.z = Math.PI / 2;
  } else {
    // knit cap with a folded brim, goggles and a scarf over the mouth
    head.add(part(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), cloth, 0, 0.03, 0));
    head.add(part(new THREE.CylinderGeometry(0.158, 0.158, 0.06, 16), trim, 0, 0.04, 0));
    head.add(part(boxG(0.24, 0.05, 0.05), dark, 0, 0.02, -0.12));
    head.add(part(boxG(0.25, 0.1, 0.1), webbing, 0, -0.07, -0.08));
  }
  body.add(head);

  // arms and gun hang from a shoulder pivot that pitches with the aim
  const aim = new THREE.Group();
  aim.position.set(0, 1.42, 0);
  const glove = mat(0x26231f, 0.8);
  const armR = limb(cloth, 0.065, 0.24); armR.position.set(0.24, 0, 0); armR.rotation.set(0.75, 0, -0.15);
  const foreR = limb(cloth, 0.055, 0.2); foreR.position.set(0, -0.3, 0); foreR.rotation.x = 0.75;
  foreR.add(part(new THREE.SphereGeometry(0.05, 8, 6), glove, 0, -0.27, 0));
  armR.add(foreR);
  const armL = limb(cloth, 0.065, 0.24); armL.position.set(-0.24, 0, 0); armL.rotation.set(1.05, 0, 0.55);
  const foreL = limb(cloth, 0.055, 0.24); foreL.position.set(0, -0.3, 0); foreL.rotation.set(0.45, 0, 0.2);
  foreL.add(part(new THREE.SphereGeometry(0.05, 8, 6), glove, 0, -0.3, 0));
  armL.add(foreL);
  aim.add(armR, armL);
  const gun = carriedGun(dark, tan);
  gun.position.set(0.1, -0.12, -0.4);
  aim.add(gun);
  body.add(aim);

  root.traverse((o) => { o.userData.team = team; });
  return { root, body, legs, head, aim, gun, fallen: 0, phase: 0 };
}

export function createSoldiers(scene, state) {
  const views = state.actors.map((a) => {
    const v = buildSoldier(a.team);
    scene.add(v.root);
    return v;
  });

  function update(alpha, dt, kindOf) {
    for (let i = 0; i < state.actors.length; i += 1) {
      const a = state.actors[i];
      const v = views[i];
      v.root.visible = !a.isPlayer;
      if (a.isPlayer) continue;
      const x = a.px + (a.x - a.px) * alpha;
      const y = a.py + (a.y - a.py) * alpha;
      const z = a.pz + (a.z - a.pz) * alpha;
      v.root.position.set(x, y, z);
      v.root.rotation.y = a.yaw;

      if (!a.alive) {
        v.fallen = Math.min(1, v.fallen + dt * 3);
        v.root.rotation.x = -v.fallen * Math.PI / 2 * 0.96;
        v.root.position.y = y + 0.12 * v.fallen;
        continue;
      }
      v.fallen = 0;
      v.root.rotation.x = 0;
      const crouch = 1 - (a.eye - 1.08) / (1.62 - 1.08);
      v.body.position.y = -crouch * 0.5;
      v.phase += dt * a.speed * 2.1;
      const swing = Math.sin(v.phase) * Math.min(1, a.speed / 3) * 0.7;
      v.legs[0].hip.rotation.x = swing - crouch * 1.2;
      v.legs[1].hip.rotation.x = -swing - crouch * 1.2;
      v.legs[0].knee.rotation.x = Math.max(0, -swing) * 0.9 + crouch * 2.1;
      v.legs[1].knee.rotation.x = Math.max(0, swing) * 0.9 + crouch * 2.1;
      v.legs[0].hip.position.y = 0.82 - crouch * 0.5;
      v.legs[1].hip.position.y = 0.82 - crouch * 0.5;
      v.aim.rotation.x = a.pitch;
      v.head.rotation.x = a.pitch * 0.5;
      const len = WEAPON_LEN[kindOf(a)] ?? 0.6;
      v.gun.scale.z = len / 0.8;
    }
  }

  return { update, views };
}
