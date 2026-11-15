// Raw input: pointer lock, held keys, mouse buttons, accumulated mouse motion and one-shot key presses.
// The controls module turns this into the player's intent.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  const taken = { x: 0, y: 0 };
  const mouse = { left: false, rightPressed: false };

  function locked() { return document.pointerLockElement === canvas; }

  document.addEventListener('pointerlockchange', () => onLockChange(locked()));
  document.addEventListener('mousemove', (e) => {
    if (!locked()) return;
    look.x += e.movementX; look.y += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!locked()) return;
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.rightPressed = true;
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (locked()) pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp'); }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code !== 'ControlLeft')) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.left = false; });

  return {
    keys,
    mouse,
    locked,
    // a refused lock (embedded frame, too soon after Esc) just leaves the game paused
    requestLock() { canvas.requestPointerLock?.()?.catch?.(() => {}); },
    releaseLock() { if (locked()) document.exitPointerLock(); },
    takeLook() {
      taken.x = look.x; taken.y = look.y;
      look.x = 0; look.y = 0;
      return taken;
    },
    // true once per press
    take(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    takeRight() {
      const v = mouse.rightPressed;
      mouse.rightPressed = false;
      return v;
    },
  };
}

// Writes the player's intent from the controls: look, movement relative to the view, and actions.
// Returns this frame's mouse motion.
export function applyControls(input, player, sensitivity, active) {
  const l = input.takeLook();
  if (!active || !player.alive) {
    player.wishX = 0; player.wishZ = 0; player.trigger = false; player.wantUse = false; player.wantJump = false;
    l.x = 0; l.y = 0;
    return l;
  }
  const scale = player.scoped ? 0.32 : 1;
  player.yaw -= l.x * sensitivity * scale;
  player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch - l.y * sensitivity * scale));
  const k = input.keys;
  const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
  player.wishX = -sin * f + cos * s;
  player.wishZ = -cos * f - sin * s;
  player.wantJump = k.has('Space');
  player.wantCrouch = k.has('ControlLeft') || k.has('KeyC');
  player.wantWalk = k.has('ShiftLeft');
  player.wantUse = k.has('KeyE');
  player.trigger = input.mouse.left;
  if (input.takeRight()) player.wantScope = true;
  if (input.take('KeyR')) player.wantReload = true;
  if (input.take('Digit1')) player.wantSlot = 'primary';
  if (input.take('Digit2')) player.wantSlot = 'secondary';
  if (input.take('Digit3')) player.wantSlot = 'melee';
  if (input.take('Digit4') || input.take('KeyG')) player.wantSlot = 'nade';
  if (input.take('WheelUp')) player.wantSlot = player.slot === 'primary' ? 'secondary' : 'primary';
  if (input.take('WheelDown')) player.wantSlot = player.slot === 'secondary' ? 'primary' : 'secondary';
  return l; // the look motion, for the weapon sway
}
