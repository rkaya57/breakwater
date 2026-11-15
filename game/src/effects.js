// Visual effects, all pooled and reused: tracers, muzzle light, impact dust and sparks, bullet marks,
// hit puffs, grenade bodies in flight, smoke clouds, blasts and the limpet charge with its blinking
// light. It reads the simulation's state and events and never changes them.
import * as THREE from 'three';
import { CELL } from './config.js';
import { ORIGIN_X, ORIGIN_Z } from './map.js';
import { smokeDensity } from './grenades.js';

function softTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function spritePool(scene, count, tex, color, blending) {
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending, fog: true }));
    s.visible = false;
    scene.add(s);
    pool.push({ sprite: s, life: 0, max: 1, grow: 1, base: 1, vy: 0, fade: 1 });
  }
  let next = 0;
  return {
    spawn(x, y, z, size, life, grow, vy = 0, opacity = 1) {
      const p = pool[next]; next = (next + 1) % pool.length;
      p.sprite.position.set(x, y, z);
      p.sprite.visible = true;
      p.life = life; p.max = life; p.grow = grow; p.base = size; p.vy = vy; p.fade = opacity;
      p.sprite.scale.setScalar(size);
      p.sprite.material.opacity = opacity;
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.sprite.visible = false; continue; }
        const t = 1 - p.life / p.max;
        p.sprite.scale.setScalar(p.base * (1 + t * p.grow));
        p.sprite.material.opacity = p.fade * (1 - t);
        p.sprite.position.y += p.vy * dt;
      }
    },
  };
}

export function createEffects(scene, state) {
  const soft = softTexture();
  const dust = spritePool(scene, 48, soft, 0xb9aa98, THREE.NormalBlending);
  const sparks = spritePool(scene, 32, soft, 0xffc061, THREE.AdditiveBlending);
  const blood = spritePool(scene, 24, soft, 0x8a1a12, THREE.NormalBlending);
  const blasts = spritePool(scene, 12, soft, 0xffa040, THREE.AdditiveBlending);
  const smokePuffs = spritePool(scene, 24, soft, 0x6d6560, THREE.NormalBlending);

  // tracers: a unit-length bar stretched from muzzle to impact
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  tracerGeo.translate(0, 0, -0.5);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = Array.from({ length: 32 }, () => {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false; scene.add(m);
    return { mesh: m, life: 0 };
  });
  let tracerNext = 0;

  const muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
  scene.add(muzzleLight);
  let muzzleLife = 0;
  const blastLight = new THREE.PointLight(0xff8a3a, 0, 30, 1.6);
  scene.add(blastLight);
  let blastLife = 0;

  // bullet marks on walls and floors
  const MARKS = 160;
  const marks = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0x141210, polygonOffset: true, polygonOffsetFactor: -4, transparent: true, opacity: 0.85 }), MARKS);
  marks.count = 0;
  scene.add(marks);
  let markNext = 0;
  const mtx = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const normal = new THREE.Vector3();
  const forwardZ = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();

  function markNormal(x, y, z, dx, dz) {
    if (y < 0.02) return normal.set(0, 1, 0);
    const fx = ((x - ORIGIN_X) / CELL) % 1; const fz = ((z - ORIGIN_Z) / CELL) % 1;
    const ex = Math.min(fx, 1 - fx); const ez = Math.min(fz, 1 - fz);
    if (ex < ez) return normal.set(dx > 0 ? -1 : 1, 0, 0);
    if (ez < 0.08) return normal.set(0, 0, dz > 0 ? -1 : 1);
    return normal.set(0, 1, 0); // landed on a crate or container top
  }

  // grenades in flight
  const nadeMats = { frag: new THREE.MeshStandardMaterial({ color: 0x55603a }), smoke: new THREE.MeshStandardMaterial({ color: 0x9aa3a8 }), flash: new THREE.MeshStandardMaterial({ color: 0xd7d0b5 }) };
  const nadeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.13, 10);
  const nadeMeshes = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(nadeGeo, nadeMats.frag); m.visible = false; m.castShadow = true; scene.add(m); return m; });

  // smoke clouds: a fixed cluster of billboards per cloud slot
  const CLOUD_SLOTS = 6; const PER_CLOUD = 22;
  const smokeMat = new THREE.SpriteMaterial({ map: soft, color: 0xcfc8c0, transparent: true, depthWrite: false, opacity: 0.9, fog: true });
  const clouds = Array.from({ length: CLOUD_SLOTS }, (_, k) => {
    const g = new THREE.Group();
    const offsets = [];
    for (let i = 0; i < PER_CLOUD; i += 1) {
      const s = new THREE.Sprite(smokeMat.clone());
      const a = i * 2.399 + k; const r = Math.sqrt((i + 0.5) / PER_CLOUD);
      offsets.push([Math.cos(a) * r, ((i * 7) % 5) / 5 - 0.35, Math.sin(a) * r, 0.7 + ((i * 3) % 4) * 0.15]);
      g.add(s);
    }
    g.visible = false;
    scene.add(g);
    return { group: g, offsets };
  });

  // the limpet charge
  const bomb = new THREE.Group();
  bomb.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x3b3f2a, roughness: 0.7 })));
  const bombPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0x0c1410, emissive: 0x33ff88, emissiveIntensity: 0.6 }));
  bombPanel.position.set(0.06, 0.09, 0);
  bomb.add(bombPanel);
  const bombLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.25) }));
  bombLamp.position.set(-0.13, 0.1, 0.07);
  bomb.add(bombLamp);
  const bombLight = new THREE.PointLight(0xff2a1a, 0, 5, 2);
  bombLight.position.set(0, 0.4, 0);
  bomb.add(bombLight);
  bomb.visible = false;
  scene.add(bomb);
  let beepGlow = 0;

  function onEvent(e, player) {
    switch (e.type) {
      case 'shot': {
        const t = tracers[tracerNext]; tracerNext = (tracerNext + 1) % tracers.length;
        const mine = e.actor === player;
        const sx = e.x + (mine ? Math.cos(player.yaw) * 0.18 : 0);
        const sz = e.z + (mine ? -Math.sin(player.yaw) * 0.18 : 0);
        const sy = e.y - (mine ? 0.12 : 0.25);
        pos.set(e.x2, e.y2, e.z2);
        t.mesh.position.set(sx, sy, sz);
        t.mesh.lookAt(pos); t.mesh.rotateY(Math.PI);
        t.mesh.scale.set(1, 1, Math.max(0.1, pos.distanceTo(t.mesh.position)));
        t.mesh.visible = !mine; // your own tracer would read as a beam from the camera
        t.life = 0.05;
        muzzleLight.position.set(sx, sy + 0.1, sz);
        muzzleLight.intensity = mine ? 6 : 10;
        muzzleLife = 0.05;
        break;
      }
      case 'impact': {
        dust.spawn(e.x, e.y, e.z, 0.25, 0.5, 2.5, 0.4, 0.75);
        sparks.spawn(e.x, e.y, e.z, 0.14, 0.08, 0.5);
        markNormal(e.x, e.y, e.z, e.x2, e.z2);
        quat.setFromUnitVectors(forwardZ, normal);
        pos.set(e.x + normal.x * 0.01, e.y + normal.y * 0.01, e.z + normal.z * 0.01);
        mtx.compose(pos, quat, one);
        marks.setMatrixAt(markNext, mtx);
        markNext = (markNext + 1) % MARKS;
        marks.count = Math.min(MARKS, marks.count + 1);
        marks.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'hurt':
        if (e.target !== player) blood.spawn(e.x, e.y, e.z, e.flag ? 0.4 : 0.28, 0.35, 1.8, -0.4, 0.9);
        break;
      case 'detonate':
        if (e.text === 'frag') {
          blasts.spawn(e.x, e.y + 0.4, e.z, 3, 0.35, 1.2);
          for (let i = 0; i < 6; i += 1) smokePuffs.spawn(e.x + (i % 3 - 1) * 0.6, e.y + 0.5 + i * 0.15, e.z + ((i * 2) % 3 - 1) * 0.6, 1.4, 1.6, 1.5, 0.6, 0.8);
          blastLight.position.set(e.x, e.y + 1, e.z); blastLight.intensity = 60; blastLife = 0.25;
        } else if (e.text === 'flash') {
          blasts.spawn(e.x, e.y + 0.2, e.z, 4, 0.2, 0.6);
          blastLight.position.set(e.x, e.y + 0.5, e.z); blastLight.intensity = 90; blastLife = 0.12;
        }
        break;
      case 'explode':
        for (let i = 0; i < 5; i += 1) blasts.spawn(e.x + (i - 2) * 1.2, e.y + 1 + i * 0.6, e.z, 6 + i, 0.8, 1.5);
        for (let i = 0; i < 12; i += 1) smokePuffs.spawn(e.x + Math.sin(i) * 3, e.y + 1 + i * 0.4, e.z + Math.cos(i) * 3, 3, 3, 2, 1.2, 0.7);
        blastLight.position.set(e.x, e.y + 3, e.z); blastLight.intensity = 400; blastLife = 0.6;
        break;
      case 'beep':
        beepGlow = 0.12;
        break;
      default:
    }
  }

  function update(dt, time) {
    dust.update(dt); sparks.update(dt); blood.update(dt); blasts.update(dt); smokePuffs.update(dt);
    for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    muzzleLife -= dt; if (muzzleLife <= 0) muzzleLight.intensity = 0;
    blastLife -= dt; if (blastLife <= 0) blastLight.intensity = 0; else blastLight.intensity *= 0.86;

    for (let i = 0; i < nadeMeshes.length; i += 1) {
      const g = state.grenades[i];
      const m = nadeMeshes[i];
      m.visible = !!g && g.active;
      if (!m.visible) continue;
      m.material = nadeMats[g.type];
      m.position.set(g.x, g.y, g.z);
      m.rotation.set(g.spin, g.spin * 0.6, 0);
    }

    for (let k = 0; k < CLOUD_SLOTS; k += 1) {
      const s = state.smokes[k];
      const cloud = clouds[k];
      cloud.group.visible = !!s;
      if (!s) continue;
      const d = smokeDensity(state, s);
      cloud.group.position.set(s.x, s.y, s.z);
      const r = s.radius * (0.35 + 0.65 * d);
      const opacity = 0.92 * Math.min(1, d * 1.4);
      for (let i = 0; i < PER_CLOUD; i += 1) {
        const sprite = cloud.group.children[i];
        const o = cloud.offsets[i];
        sprite.position.set(o[0] * r, o[1] * r * 0.8 + Math.sin(time * 0.4 + i) * 0.12, o[2] * r);
        sprite.scale.setScalar(o[3] * r * 1.05);
        sprite.material.opacity = opacity;
      }
    }

    const b = state.bomb;
    bomb.visible = b.state === 'planted' || b.state === 'dropped' || b.state === 'defused';
    if (bomb.visible) {
      bomb.position.set(b.x, b.y + 0.08, b.z);
      beepGlow -= dt;
      const on = b.state === 'planted' && beepGlow > 0;
      bombLamp.material.color.setHex(on ? 0xff3a20 : 0x401008);
      bombLight.intensity = on ? 4 : 0;
      bombPanel.material.emissive.setHex(b.state === 'defused' ? 0x3399ff : 0x33ff88);
    }
  }

  return { onEvent, update };
}
