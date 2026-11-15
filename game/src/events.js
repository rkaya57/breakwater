// The one-way bridge from simulation to presentation. The simulation emits typed events into a fixed
// ring of reusable records; audio, effects and the HUD drain them once per rendered frame. No event
// allocates: emit() copies its fields into the next slot.

const SIZE = 512;

function blank() {
  return { type: '', actor: null, target: null, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, value: 0, text: '', flag: false };
}

export function createEvents() {
  const ring = Array.from({ length: SIZE }, blank);
  let head = 0;
  let tail = 0;

  function emit(type, fields) {
    const e = ring[head];
    e.type = type;
    e.actor = fields.actor ?? null;
    e.target = fields.target ?? null;
    e.x = fields.x ?? 0; e.y = fields.y ?? 0; e.z = fields.z ?? 0;
    e.x2 = fields.x2 ?? 0; e.y2 = fields.y2 ?? 0; e.z2 = fields.z2 ?? 0;
    e.value = fields.value ?? 0;
    e.text = fields.text ?? '';
    e.flag = fields.flag ?? false;
    head = (head + 1) % SIZE;
    if (head === tail) tail = (tail + 1) % SIZE; // overwrite the oldest when a frame floods the ring
  }

  // Calls each listener for every event emitted since the last drain.
  function drain(listeners) {
    while (tail !== head) {
      const e = ring[tail];
      for (let i = 0; i < listeners.length; i += 1) listeners[i](e);
      tail = (tail + 1) % SIZE;
    }
  }

  return { emit, drain };
}
