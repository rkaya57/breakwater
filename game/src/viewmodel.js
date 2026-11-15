// The first-person hands and weapons, drawn in their own scene after the world with a cleared depth
// buffer so they never clip into walls. Each weapon is modelled from solids; the rig bobs with the
// stride, sways against the mouse, kicks on each shot, dips through a reload and rises on a switch.
import * as THREE from 'three';
import { TEAMS } from './config.js';

export function createViewmodel(team, environment = null) {
  const scene = new THREE.Scene();
  scene.environment = environment; // the harbour sky, so steel and glass reflect the dusk
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xffd8b8, 0x2a3440, 1.1));
  const key = new THREE.DirectionalLight(0xffb27a, 2.6);
  key.position.set(-1.2, 1.6, 0.8);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6); // cool sky light catching the top edges
  rim.position.set(0.6, 1, -1);
  scene.add(key, rim);

  const rig = new THREE.Group();
  rig.scale.setScalar(0.62);
  scene.add(rig);
  const glove = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  const sleeve = new THREE.MeshStandardMaterial({ color: TEAMS[team].cloth, roughness: 0.85 });
  const handR = new THREE.Group();
  handR.add(box(0.07, 0.08, 0.1, glove, 0, -0.05, 0.02), box(0.09, 0.09, 0.3, sleeve, 0.01, -0.07, 0.22));
  const handL = new THREE.Group();
  handL.add(box(0.07, 0.07, 0.1, glove, 0, 0, 0), box(0.09, 0.09, 0.3, sleeve, -0.02, -0.03, 0.2));
  rig.add(handR, handL);

  const models = buildModels();
  for (const k of Object.keys(models)) { models[k].visible = false; rig.add(models[k]); }
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: starTexture(), color: new THREE.Color(3.4, 2.3, 1.1), // brighter than white, so it blooms
     transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rig.add(flash);
  const flashGlow = flash.clone();
  flashGlow.rotation.z = Math.PI / 4;
  flashGlow.scale.setScalar(0.7);
  rig.add(flashGlow);

  const anim = { kick: 0, kickRot: 0, reload: 0, reloadTotal: 1, raise: 0, bob: 0, swayX: 0, swayY: 0, flash: 0, swing: 0, current: '' };

  function show(id) {
    if (anim.current === id) return;
    if (models[anim.current]) models[anim.current].visible = false;
    anim.current = id;
    models[id].visible = true;
    const pistol = id === 'pike' || id === 'brute';
    const nade = id === 'frag' || id === 'smoke' || id === 'flash';
    handL.visible = !pistol && !nade && id !== 'gaff';
    handL.position.set(-0.02, -0.06, id === 'harpoon' ? -0.42 : id === 'wasp' ? -0.22 : -0.34);
    handR.position.set(0, -0.08, 0.02);
  }

  function onEvent(e) {
    if (e.type === 'shot') {
      anim.kick = Math.min(0.09, anim.kick + (e.text === 'harpoon' ? 0.09 : e.text === 'brute' ? 0.06 : 0.035));
      anim.kickRot = Math.min(0.25, anim.kickRot + (e.text === 'harpoon' ? 0.22 : 0.06));
      anim.flash = 0.05;
      flash.rotation.z += 2.1; // a new star shape each shot
    } else if (e.type === 'reload') {
      anim.reload = e.value; anim.reloadTotal = e.value;
    } else if (e.type === 'switch') {
      anim.raise = 1; anim.reload = 0;
    } else if (e.type === 'swing' || e.type === 'throw') {
      anim.swing = 1;
    }
  }

  function update(dt, player, heldId, lookDX, lookDY, time) {
    show(heldId);
    rig.visible = player.alive && !player.scoped;
    anim.kick = Math.max(0, anim.kick - dt * 0.35);
    anim.kickRot = Math.max(0, anim.kickRot - dt * 1.6);
    anim.raise = Math.max(0, anim.raise - dt * 3);
    anim.reload = Math.max(0, anim.reload - dt);
    anim.flash = Math.max(0, anim.flash - dt);
    anim.swing = Math.max(0, anim.swing - dt * 3.5);
    anim.swayX += (-lookDX * 0.0006 - anim.swayX) * Math.min(1, dt * 8);
    anim.swayY += (lookDY * 0.0006 - anim.swayY) * Math.min(1, dt * 8);
    const moving = player.onGround ? Math.min(1, player.speed / 5) : 0;
    anim.bob += dt * (6 + player.speed * 1.2);
    const bobX = Math.sin(anim.bob) * 0.012 * moving;
    const bobY = Math.abs(Math.cos(anim.bob)) * 0.014 * moving;
    const r = anim.reloadTotal > 0 ? anim.reload / anim.reloadTotal : 0;
    const dip = Math.sin(Math.min(1, r) * Math.PI);
    const crouch = player.crouching ? 0.012 : 0;
    rig.position.set(0.19 + bobX + anim.swayX, -0.2 - bobY - dip * 0.12 - anim.raise * 0.25 + anim.swayY - crouch, -0.46 + anim.kick + anim.swing * -0.12);
    rig.rotation.set(anim.kickRot + dip * 0.5 - anim.raise * 0.6 + anim.swing * -0.5, 0.05 + anim.swayX * 2 + Math.sin(time * 0.9) * 0.004, dip * 0.35 + anim.swing * 0.4);
    const model = models[heldId];
    const tip = model.userData.muzzle;
    flash.position.copy(tip); flashGlow.position.copy(tip);
    flash.visible = anim.flash > 0; flashGlow.visible = anim.flash > 0;
  }

  function render(renderer, aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  return { onEvent, update, render };
}

// Weapon models. Built once per match from solids; the rig above only shows one at a time.

// Parts thicker than a few millimetres get chamfered edges (a rounded section extruded along the
// barrel axis) so the key and rim lights draw a bright line along every edge instead of flat faces.
const geoCache = new Map();
function chamfered(w, h, d) {
  const key = `${w},${h},${d}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const r = Math.min(w, h, d) * 0.18;
  const iw = w / 2 - r; const ih = h / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-iw, -ih - r * 0.0);
  shape.lineTo(iw, -ih); shape.lineTo(iw, ih); shape.lineTo(-iw, ih); shape.lineTo(-iw, -ih);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 1 });
  geo.translate(0, 0, -(d - r * 2) / 2);
  geo.computeVertexNormals();
  geoCache.set(key, geo);
  return geo;
}

function box(w, h, d, mat, x, y, z) {
  const geo = Math.min(w, h, d) > 0.018 ? chamfered(w, h, d) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(r, len, mat, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// A rail: n small teeth along -z from z0, on top of a receiver at height y.
function rail(g, mat, y, z0, n) {
  for (let i = 0; i < n; i += 1) g.add(box(0.032, 0.012, 0.014, mat, 0, y, z0 - i * 0.03));
}

// Iron sights: a rear notch and a front post.
function sights(g, mat, y, zRear, zFront) {
  g.add(box(0.03, 0.03, 0.02, mat, 0, y, zRear), box(0.008, 0.035, 0.012, mat, 0, y + 0.002, zFront));
}

function buildModels() {
  const black = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.4, metalness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.3, metalness: 0.85 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x8f8268, roughness: 0.7 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4325, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3fa7c0, roughness: 0.1, metalness: 0.4, emissive: 0x0b3540 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.75 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.8 });
  const m = {};
  // each model's muzzle is the userData.muzzle point (local), used for the flash
  let g = new THREE.Group();
  g.add(box(0.05, 0.06, 0.24, black, 0, 0.02, -0.08), box(0.045, 0.12, 0.06, black, 0, -0.06, 0.0), box(0.05, 0.02, 0.2, steel, 0, 0.055, -0.08));
  g.add(box(0.012, 0.03, 0.05, black, 0, -0.025, -0.06), box(0.052, 0.025, 0.07, polymer, 0, -0.02, 0.0), box(0.006, 0.03, 0.05, steel, 0.026, 0.05, -0.04));
  sights(g, black, 0.075, 0.0, -0.17);
  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.22);
  m.pike = g;
  g = new THREE.Group();
  g.add(box(0.06, 0.08, 0.3, steel, 0, 0.02, -0.1), box(0.055, 0.14, 0.07, wood, 0, -0.07, 0.01), cyl(0.018, 0.08, steel, 0, 0.02, -0.28));
  g.add(cyl(0.035, 0.07, steel, 0, 0.0, -0.05, 6), box(0.012, 0.035, 0.06, black, 0, -0.035, -0.06));
  for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3; g.add(cyl(0.007, 0.01, brass, Math.cos(a) * 0.022, Math.sin(a) * 0.022, -0.012, 6)); }
  sights(g, black, 0.075, 0.03, -0.24);
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.32);
  m.brute = g;
  g = new THREE.Group();
  g.add(box(0.07, 0.1, 0.38, black, 0, 0, -0.12), box(0.04, 0.2, 0.06, black, 0, -0.14, -0.12), box(0.05, 0.11, 0.06, olive, 0, -0.08, 0.02),
    cyl(0.017, 0.14, steel, 0, 0.01, -0.36), box(0.03, 0.03, 0.22, black, 0, 0.07, -0.08), box(0.05, 0.06, 0.18, olive, 0, -0.01, 0.15));
  rail(g, black, 0.088, -0.0, 6);
  g.add(cyl(0.026, 0.06, black, 0, 0.01, -0.4, 10), box(0.072, 0.05, 0.12, polymer, 0, -0.035, -0.26), box(0.01, 0.03, 0.06, steel, 0.037, 0.02, -0.05));
  sights(g, black, 0.1, 0.05, -0.27);
  g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.44);
  m.wasp = g;
  g = new THREE.Group();
  const mag = box(0.045, 0.2, 0.08, black, 0, -0.13, -0.12); mag.rotation.x = 0.25;
  g.add(box(0.07, 0.11, 0.5, tan, 0, 0, -0.1), box(0.06, 0.08, 0.3, black, 0, 0.01, -0.45), cyl(0.016, 0.22, steel, 0, 0.02, -0.68),
    mag, box(0.05, 0.12, 0.06, black, 0, -0.1, 0.06), box(0.06, 0.1, 0.22, tan, 0, -0.02, 0.25), box(0.03, 0.04, 0.26, black, 0, 0.08, -0.12));
  rail(g, black, 0.105, -0.0, 7);
  g.add(cyl(0.03, 0.07, black, 0, 0.02, -0.8, 6), box(0.012, 0.045, 0.02, black, 0, 0.09, -0.6), box(0.012, 0.035, 0.08, black, 0, -0.075, -0.02),
    box(0.012, 0.035, 0.07, steel, 0.037, 0.03, -0.1), box(0.074, 0.02, 0.26, black, 0, 0.05, -0.45));
  for (let i = 0; i < 4; i += 1) g.add(box(0.075, 0.015, 0.03, black, 0, -0.02, -0.36 - i * 0.06)); // handguard vents
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.8);
  m.marlin = g;
  g = new THREE.Group();
  const mag2 = box(0.045, 0.18, 0.08, black, 0, -0.12, 0.12); mag2.rotation.x = 0.15;
  g.add(box(0.075, 0.12, 0.62, olive, 0, 0, 0.0), cyl(0.017, 0.2, steel, 0, 0.02, -0.4), mag2, box(0.05, 0.12, 0.06, black, 0, -0.1, -0.12),
    box(0.04, 0.06, 0.16, black, 0, 0.1, -0.08), box(0.05, 0.04, 0.03, glass, 0, 0.1, -0.15));
  g.add(cyl(0.025, 0.05, black, 0, 0.02, -0.5, 10), box(0.06, 0.04, 0.14, polymer, 0, -0.08, -0.25), box(0.01, 0.03, 0.08, steel, 0.039, 0.03, 0.05),
    box(0.082, 0.02, 0.1, black, 0, 0.0, 0.22), box(0.04, 0.07, 0.02, black, 0, 0.1, 0.0));
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.52);
  m.gull = g;
  g = new THREE.Group();
  g.add(box(0.07, 0.1, 0.6, wood, 0, -0.01, 0.05), cyl(0.02, 0.6, black, 0, 0.02, -0.55), cyl(0.035, 0.34, black, 0, 0.11, -0.08, 16),
    cyl(0.045, 0.04, black, 0, 0.11, -0.26, 16), cyl(0.042, 0.04, glass, 0, 0.11, 0.1, 16), box(0.04, 0.12, 0.06, black, 0, -0.1, -0.04), box(0.02, 0.02, 0.08, steel, 0.05, 0.04, 0.0));
  g.add(cyl(0.032, 0.09, black, 0, 0.02, -0.86, 8), cyl(0.012, 0.06, steel, 0.05, 0.11, -0.08, 8), box(0.074, 0.03, 0.12, black, 0, 0.0, 0.32),
    box(0.03, 0.05, 0.03, black, 0, 0.06, -0.2), box(0.03, 0.05, 0.03, black, 0, 0.06, 0.04));
  for (let i = 0; i < 5; i += 1) g.add(cyl(0.006, 0.03, brass, 0.038, -0.02, 0.2 - i * 0.025, 6)); // spare rounds on the stock
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.86);
  m.harpoon = g;
  g = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI * 1.3), steel);
  hook.position.set(0, 0.0, -0.32); hook.rotation.y = Math.PI / 2;
  g.add(box(0.035, 0.035, 0.26, wood, 0, 0, -0.02), cyl(0.008, 0.16, steel, 0, 0, -0.22), hook);
  g.userData.muzzle = new THREE.Vector3(0, 0, -0.35);
  m.gaff = g;
  for (const [id, color] of [['frag', 0x55603a], ['smoke', 0x9aa3a8], ['flash', 0xd7d0b5]]) {
    g = new THREE.Group();
    g.add(cyl(0.045, 0.11, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), 0, 0, -0.05, 14), box(0.02, 0.05, 0.03, steel, 0.03, 0.05, -0.02));
    g.userData.muzzle = new THREE.Vector3(0, 0, -0.1);
    m[id] = g;
  }
  return m;
}

// A soft four-pointed muzzle star.
function starTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,230,1)'); glow.addColorStop(0.25, 'rgba(255,200,90,0.8)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = glow;
  g.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4; const r = i % 2 ? 9 : 31;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}

