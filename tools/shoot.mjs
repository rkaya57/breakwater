// Captures the store screenshots from the running dev server (node serve.ts --port 8091):
// launches headless Chrome, loads each ?shot= stage at 1280x720, waits for window.__shotReady and
// saves a JPEG under screenshots/. Usage: node tools/shoot.mjs [chromePath]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8091/';
const SHOTS = [['1-assault', 'assault'], ['2-defuse', 'defuse'], ['3-buy', 'buy'], ['4-board', 'board']];
const PORT = 9333;

const profile = mkdtempSync(join(tmpdir(), 'bw-shoot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1;
  pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
mkdirSync('screenshots', { recursive: true });
for (const [file, stage] of SHOTS) {
  await send('Page.navigate', { url: `${BASE}?shot=${stage}&seed=1` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i += 1) {
    await sleep(150);
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true' });
    ready = r.result.value === true;
  }
  if (!ready) throw new Error(`stage ${stage} never became ready`);
  await sleep(300);
  for (const quality of [88, 82, 76, 70]) {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality });
    const buf = Buffer.from(data, 'base64');
    if (buf.length <= 250 * 1024 || quality === 70) {
      writeFileSync(`screenshots/${file}.jpg`, buf);
      console.log(`${file}.jpg  q${quality}  ${(buf.length / 1024).toFixed(0)} KiB`);
      break;
    }
  }
}
ws.close();
chrome.kill();
