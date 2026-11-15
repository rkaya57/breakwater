// The finishing pass. The world and the first-person weapon render into one HDR, multisampled target;
// bright pixels (lamps, lit windows, muzzle flashes, the charge's lamp) are blurred twice at reduced
// resolution into a bloom; then one full-screen shader adds the bloom, tone maps (ACES), grades dusk
// into warm highlights and cool shadows, darkens the corners and adds a whisper of film grain.
import * as THREE from 'three';
import { EXPOSURE } from './config.js';

const FULLSCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D src; uniform float threshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(src, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(threshold, threshold * 2.0, l), 1.0);
  }`;

// Nine-tap separable gaussian; `dir` is one texel along x or y.
const BLUR_FRAG = /* glsl */`
  uniform sampler2D src; uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(src, vUv).rgb * 0.227;
    c += (texture2D(src, vUv + dir * 1.385).rgb + texture2D(src, vUv - dir * 1.385).rgb) * 0.316;
    c += (texture2D(src, vUv + dir * 3.231).rgb + texture2D(src, vUv - dir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`;

const FINAL_FRAG = /* glsl */`
  uniform sampler2D scene; uniform sampler2D bloomA; uniform sampler2D bloomB;
  uniform float exposure; uniform float bloomStrength; uniform float time;
  varying vec2 vUv;
  vec3 aces(vec3 x) { // Narkowicz fit, as close to three's ACES as a post pass needs
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec3 c = texture2D(scene, vUv).rgb;
    c += (texture2D(bloomA, vUv).rgb * 0.6 + texture2D(bloomB, vUv).rgb * 0.4) * bloomStrength;
    c = aces(c * exposure);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, c * vec3(0.92, 1.0, 1.08), (1.0 - smoothstep(0.0, 0.45, l)) * 0.5); // cool the shadows
    c = mix(c, c * vec3(1.06, 1.0, 0.93), smoothstep(0.4, 1.0, l) * 0.5);         // warm the highlights
    c = mix(vec3(l), c, 1.08);                                                      // a touch of saturation
    vec2 d = vUv - 0.5;
    c *= 1.0 - dot(d, d) * 0.55;                                                   // vignette
    c = toSRGB(clamp(c, 0.0, 1.0));
    float n = fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * 0.018;                                                        // film grain
    gl_FragColor = vec4(c, 1.0);
  }`;

function pass(fragmentShader, uniforms) {
  const mat = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return { scene, uniforms: mat.uniforms };
}

export function createPost(renderer) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hdr = { type: THREE.HalfFloatType };
  const main = new THREE.WebGLRenderTarget(1, 1, { ...hdr, samples: 4 });
  const half = new THREE.WebGLRenderTarget(1, 1, hdr);
  const qa = new THREE.WebGLRenderTarget(1, 1, hdr);
  const qb = new THREE.WebGLRenderTarget(1, 1, hdr);
  const ea = new THREE.WebGLRenderTarget(1, 1, hdr);
  const eb = new THREE.WebGLRenderTarget(1, 1, hdr);
  const bright = pass(BRIGHT_FRAG, { src: { value: null }, threshold: { value: 1.1 } });
  const blur = pass(BLUR_FRAG, { src: { value: null }, dir: { value: new THREE.Vector2() } });
  const final = pass(FINAL_FRAG, {
    scene: { value: main.texture }, bloomA: { value: qa.texture }, bloomB: { value: ea.texture },
    exposure: { value: EXPOSURE }, bloomStrength: { value: 0.7 }, time: { value: 0 },
  });
  function setSize(width, height) {
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(width * pr)); const h = Math.max(1, Math.floor(height * pr));
    main.setSize(w, h);
    half.setSize(w >> 1, h >> 1);
    qa.setSize(w >> 2, h >> 2); qb.setSize(w >> 2, h >> 2);
    ea.setSize(w >> 3, h >> 3); eb.setSize(w >> 3, h >> 3);
  }

  function run(p, target) {
    renderer.setRenderTarget(target);
    renderer.render(p.scene, cam);
  }

  // Two blur passes (horizontal into `tmp`, vertical back into `out`) of `input` at `out`'s size.
  function blurInto(input, tmp, out) {
    blur.uniforms.src.value = input.texture;
    blur.uniforms.dir.value.set(1 / out.width, 0);
    run(blur, tmp);
    blur.uniforms.src.value = tmp.texture;
    blur.uniforms.dir.value.set(0, 1 / out.height);
    run(blur, out);
  }

  // drawScene draws everything (world, then weapon) into the bound target.
  function render(drawScene, time) {
    renderer.setRenderTarget(main);
    renderer.clear();
    drawScene();
    bright.uniforms.src.value = main.texture;
    run(bright, half);
    blurInto(half, qb, qa);
    blurInto(qa, eb, ea);
    final.uniforms.time.value = time % 100;
    run(final, null);
  }

  return { setSize, render };
}
