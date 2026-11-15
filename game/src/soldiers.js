// Third-person soldiers, styled from simple solids in each team's colours: Saltjackers in rust work
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

function buildSoldier(team) {
  const t = TEAMS[team];
  const cloth = new THREE.MeshStandardMaterial({ color: t.cloth, roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: t.vest, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: t.trim, roughness: 0.6, emissive: t.trim, emissiveIntensity: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8916b, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.5 });

  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // turn to the yaw first, then topple in the body's own frame
  const body = new THREE.Group();   // everything above the hips, lowered by a crouch
  root.add(body);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.82, 0);
    hip.add(part(new THREE.BoxGeometry(0.17, 0.46, 0.2), cloth, 0, -0.23, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    knee.add(part(new THREE.BoxGeometry(0.16, 0.4, 0.18), cloth, 0, -0.2, 0));
    knee.add(part(new THREE.BoxGeometry(0.18, 0.1, 0.28), dark, 0, -0.38, -0.05));
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee });
  }
  body.add(part(new THREE.BoxGeometry(0.46, 0.34, 0.26), cloth, 0, 0.98, 0));
  body.add(part(new THREE.BoxGeometry(0.5, 0.42, 0.32), vest, 0, 1.3, 0));
  body.add(part(new THREE.BoxGeometry(0.52, 0.06, 0.34), trim, 0, 1.14, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(part(new THREE.SphereGeometry(0.15, 14, 10), skin, 0, 0, 0));
  if (team === TEAM.DEF) {
    head.add(part(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), vest, 0, 0.02, 0));
    head.add(part(new THREE.BoxGeometry(0.24, 0.06, 0.04), trim, 0, 0.0, -0.15)); // visor strip
  } else {
    head.add(part(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), cloth, 0, 0.03, 0));
    head.add(part(new THREE.BoxGeometry(0.26, 0.09, 0.08), dark, 0, -0.04, -0.13)); // scarf mask
  }
  body.add(head);

  // arms and gun hang from a shoulder pivot that pitches with the aim
  const aim = new THREE.Group();
  aim.position.set(0, 1.42, 0);
  const armR = part(new THREE.BoxGeometry(0.12, 0.12, 0.5), cloth, 0.2, -0.08, -0.2);
  const armL = part(new THREE.BoxGeometry(0.12, 0.12, 0.55), cloth, -0.12, -0.08, -0.3);
  armL.rotation.y = 0.5;
  aim.add(armR, armL);
  const gun = part(new THREE.BoxGeometry(0.08, 0.12, 0.8), dark, 0.08, -0.06, -0.55);
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
      v.gun.position.z = -0.25 - len / 2;
    }
  }

  return { update, views };
}
