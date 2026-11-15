// Sound, synthesised with WebAudio at play time: no audio files. Every gun has its own thump, body
// and crack; footsteps, reloads, grenades, the charge's quickening beep and a ship's horn that opens
// each round. Sounds are placed by distance and side relative to the listener.
import { WEAPONS } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  const listener = { x: 0, z: 0, yaw: 0 };
  let ringing = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < data.length; i += 1) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // gain and pan for a sound at (x, z); null when too far to hear
  function place(x, z, range) {
    const dx = x - listener.x; const dz = z - listener.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return null;
    const right = Math.cos(listener.yaw) * dx - Math.sin(listener.yaw) * dz;
    return { gain: 1 / (1 + d * 0.09), pan: d < 0.5 ? 0 : Math.max(-0.85, Math.min(0.85, right / d)) };
  }

  function out(gain, pan) {
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p); p.connect(master);
    return g;
  }

  function burst(dest, t, dur, type, freq, q, peak) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  function tone(dest, t, dur, type, f0, f1, peak) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function gunshot(id, x, z, mine) {
    const p = mine ? { gain: 1, pan: 0 } : place(x, z, 90);
    if (!p) return;
    const s = WEAPONS[id].sound;
    const t = ctx.currentTime;
    const dest = out(p.gain * (mine ? 0.8 : 1), p.pan);
    if (s.body > 0) {
      tone(dest, t, 0.18 * s.body + 0.05, 'sine', 160 * s.pitch, 40, 0.9 * s.body);
      burst(dest, t, 0.22 * s.body + 0.06, 'lowpass', 1800 * s.pitch, 0.7, 0.9);
      burst(dest, t, 0.05, 'highpass', 3000, 0.5, 0.7 * s.crack * (mine ? 1 : p.gain));
      if (!mine) burst(dest, t + 0.06, 0.5, 'lowpass', 500, 0.5, 0.25 * s.body); // harbour echo
    } else {
      burst(dest, t, 0.12, 'bandpass', 900, 1.5, 0.5); // a swung hook
    }
  }

  function onEvent(e, player) {
    if (!ctx) return;
    const mine = e.actor === player;
    const t = ctx.currentTime;
    switch (e.type) {
      case 'shot': gunshot(e.text, e.x, e.z, mine); break;
      case 'swing': gunshot('gaff', e.x, e.z, mine); break;
      case 'step': {
        const p = mine ? { gain: 0.35, pan: 0 } : place(e.x, e.z, e.flag ? 22 : 8);
        if (p) burst(out(p.gain * (e.flag ? 0.5 : 0.18), p.pan), t, 0.07, 'bandpass', 600 + Math.random() * 300, 1.2, 0.8);
        break;
      }
      case 'reload': {
        const p = mine ? { gain: 0.6, pan: 0 } : place(e.x, e.z, 14);
        if (!p) break;
        const d = out(p.gain, p.pan);
        burst(d, t + 0.15, 0.05, 'highpass', 2500, 2, 0.6);
        burst(d, t + e.value * 0.55, 0.06, 'bandpass', 1500, 3, 0.7);
        burst(d, t + e.value * 0.9, 0.05, 'highpass', 3000, 2, 0.8);
        break;
      }
      case 'dry': if (mine) burst(out(0.5, 0), t, 0.03, 'highpass', 4000, 2, 0.8); break;
      case 'hurt':
        if (e.actor === player && e.target !== player) {
          const d = out(0.5, 0);
          if (e.flag) { tone(d, t, 0.25, 'sine', 2200, 2100, 0.4); tone(d, t, 0.2, 'sine', 3300, 3200, 0.2); } else tone(d, t, 0.06, 'square', 900, 700, 0.15);
        } else if (e.target === player) {
          burst(out(0.7, 0), t, 0.12, 'lowpass', 400, 1, 0.9);
        }
        break;
      case 'kill': if (e.actor === player) tone(out(0.4, 0), t, 0.35, 'triangle', 660, 990, 0.3); break;
      case 'throw': if (mine) burst(out(0.4, 0), t, 0.25, 'bandpass', 700, 0.8, 0.5); break;
      case 'bounce': { const p = place(e.x, e.z, 25); if (p) tone(out(p.gain * 0.5, p.pan), t, 0.07, 'triangle', 380, 300, 0.4); break; }
      case 'detonate': {
        const p = place(e.x, e.z, 120);
        if (!p) break;
        const d = out(p.gain, p.pan);
        if (e.text === 'smoke') burst(d, t, 2.2, 'bandpass', 1400, 0.4, 0.5);
        else { burst(d, t, 0.9, 'lowpass', 900, 0.5, 1.2); tone(d, t, 0.6, 'sine', 90, 30, 1); }
        break;
      }
      case 'explode': { const d = out(1, 0); burst(d, t, 2.5, 'lowpass', 600, 0.4, 1.6); tone(d, t, 1.6, 'sine', 70, 22, 1.2); break; }
      case 'beep': { const p = place(e.x, e.z, 60); if (p) tone(out(p.gain * 0.5, p.pan), t, 0.08, 'square', 1950, 1950, 0.18); break; }
      case 'plantStart': case 'defuseStart': { const p = place(e.actor.x, e.actor.z, 30); if (p) for (let i = 0; i < 4; i += 1) tone(out(p.gain * 0.3, p.pan), t + i * 0.18, 0.05, 'square', 1200 + i * 120, 1200 + i * 120, 0.12); break; }
      case 'roundStart': case 'live': {
        const d = out(0.35, 0); // a ship's horn across the water
        for (const f of [98, 147]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.3); g.gain.setValueAtTime(0.25, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
          o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(t + 1.9);
          if (e.type === 'live') break;
        }
        break;
      }
      case 'roundEnd': {
        const win = e.value === player.team;
        const notes = win ? [523, 659, 784, 1047] : [440, 392, 349, 262];
        const d = out(0.3, 0);
        notes.forEach((f, i) => tone(d, t + i * 0.14, 0.4, 'triangle', f, f, 0.35));
        break;
      }
      default:
    }
  }

  function update(player) {
    listener.x = player.x; listener.z = player.z; listener.yaw = player.yaw;
    if (!ctx) return;
    // the ringing of a flash fades with the blindness
    if (player.blind > 0.3 && !ringing) {
      ringing = ctx.createOscillator(); ringing.frequency.value = 3600;
      const g = ctx.createGain(); g.gain.value = 0.05;
      ringing.connect(g); g.connect(master); ringing.start();
      ringing.gain = g;
    } else if (ringing) {
      ringing.gain.gain.value = Math.min(0.05, player.blind * 0.02);
      if (player.blind <= 0.05) { ringing.stop(); ringing = null; }
    }
  }

  return { ensure, onEvent, update };
}
