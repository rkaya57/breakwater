// The buy menu: every item of the shop with its price, numbered for the keyboard and clickable,
// greyed out with the reason when it cannot be bought. Purchases go through shop.buy, the same
// rule the bots shop by.
import { SHOP, WEAPONS, GRENADES } from './config.js';
import { buy, buyBlocker, priceOf, nameOf } from './shop.js';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

function detail(id) {
  const w = WEAPONS[id];
  if (w) return `${w.damage} dmg · ${w.rpm} rpm · ${w.mag} rds`;
  if (GRENADES[id]) return id === 'frag' ? 'Blast, falls off with range' : id === 'smoke' ? `Blocks sight ${GRENADES.smoke.duration}s` : 'Blinds anyone facing it';
  return id === 'kit' ? 'Defuse in half the time' : id === 'helmet' ? 'Armour for the head too' : 'Halves most body damage';
}

export function createBuyMenu(state, root, onClose) {
  const order = SHOP.flatMap((g) => g.items);
  const buttons = new Map();
  root.innerHTML = '';
  const head = document.createElement('header');
  head.innerHTML = '<h2>Requisition</h2><p>Click or press the number. <kbd>B</kbd> or <kbd>Esc</kbd> closes.</p><div class="buy-money">$<b id="buy-money"></b></div>';
  root.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'buy-grid';
  root.appendChild(grid);
  for (const group of SHOP) {
    const col = document.createElement('section');
    col.innerHTML = `<h3>${group.group}</h3>`;
    for (const id of group.items) {
      const n = order.indexOf(id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy-item';
      btn.innerHTML = `<kbd>${LABELS[n]}</kbd><span class="buy-name">${nameOf(id)}</span><span class="buy-price">$${priceOf(id)}</span><span class="buy-detail">${detail(id)}</span><span class="buy-why"></span>`;
      btn.addEventListener('click', () => buy(state, state.player, id));
      col.appendChild(btn);
      buttons.set(id, btn);
    }
    grid.appendChild(col);
  }

  function refresh() {
    document.getElementById('buy-money').textContent = state.player.money.toLocaleString('en-US');
    for (const [id, btn] of buttons) {
      const why = buyBlocker(state, state.player, id);
      btn.disabled = why !== '';
      btn.querySelector('.buy-why').textContent = why;
    }
  }

  // keyboard purchases while the menu is open; returns true when it consumed the frame's input
  function handleKeys(input) {
    KEYS.forEach((code, i) => { if (input.take(code) && order[i]) buy(state, state.player, order[i]); });
    if (input.take('Escape') || input.take('KeyB')) onClose();
  }

  return { refresh, handleKeys };
}
