'use strict';
// Grensesnitt: input, HUD, butikken, menyer og hovedløkka.
const pv = $('preview'), pctx = pv.getContext('2d');
const shopBtn = document.querySelector('#touch [data-k=shop]');
let last = 0;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privat modus: ingen lagring */ } }
};
look.lack = clamp(+store.get('mj-lack') || 0, 0, LACK.length - 1);
look.neon = clamp(+(store.get('mj-neon') ?? 0), 0, NEON.length - 1);
const RANKS = [[15000, 'Legenden fra Karl Johan'], [9000, 'Kongen av Grønland'], [5000, 'Byens største sjarmør'],
  [2500, 'Respektert bror'], [1000, 'Lokal kjendis'], [0, 'Søndagssjåfør']];
const hiscore = () => +store.get('mj2-hi') || 0;
const fmt = n => Math.round(n).toLocaleString('nb-NO');
const show = (id, on) => $(id).classList.toggle('hidden', !on);

// ---------- Input ----------
const HOLD = { ArrowRight: 'gas', KeyD: 'gas', ArrowLeft: 'brake', KeyA: 'brake', ShiftLeft: 'nos', ShiftRight: 'nos' };
addEventListener('keydown', e => {
  const k = HOLD[e.code];
  if (k) { input[k] = 1; e.preventDefault(); }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (state === 'play') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') laneChange(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') laneChange(1);
    else if (e.code === 'Space' || e.code === 'KeyH') honk();
    else if (e.code === 'KeyE') openShop();
  } else if (state === 'shop' && (e.code === 'KeyE' || e.code === 'Escape')) return closeShop();
  if (e.code === 'KeyM') toggleMusic();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'Enter' && (state === 'menu' || state === 'over')) start();
});
addEventListener('keyup', e => { const k = HOLD[e.code]; if (k) input[k] = 0; });
addEventListener('blur', () => { for (const k in input) input[k] = 0; });
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); b.classList.add('on');
    if (k in input) input[k] = 1;
    else if (state === 'play') { if (k === 'up') laneChange(-1); else if (k === 'down') laneChange(1); else if (k === 'horn') honk(); else if (k === 'shop') openShop(); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, e => { e.preventDefault(); b.classList.remove('on'); if (k in input) input[k] = 0; });
});
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Meny: lakk, neon og forhåndsvisning ----------
function buildPickers() {
  const mk = (el, list, key) => list.forEach(([n, c], i) => {
    const b = document.createElement('button');
    b.className = 'sw'; b.title = n; b.setAttribute('aria-label', n);
    b.style.background = c || 'repeating-linear-gradient(45deg,#333 0 4px,#111 4px 8px)';
    b.onclick = () => { look[key] = i; store.set('mj-' + key, i); refreshPickers(); };
    el.appendChild(b);
  });
  mk($('pickColor'), LACK, 'lack');
  mk($('pickGlow'), NEON, 'neon');
  refreshPickers();
}
function refreshPickers() {
  $('pickColor').querySelectorAll('.sw').forEach((b, i) => b.classList.toggle('on', i === look.lack));
  $('pickGlow').querySelectorAll('.sw').forEach((b, i) => b.classList.toggle('on', i === look.neon));
}
function drawPreview() {
  pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
  pctx.fillStyle = 'rgba(255,255,255,0.06)'; pctx.fillRect(40, pv.height - 34, pv.width - 80, 3);
  pctx.translate(pv.width / 2, pv.height - 34); pctx.scale(2.3, 2.3);
  const car = { x: 0, y: 0, type: 'bmw', kind: 'player', color: LACK[look.lack][1], driver: true, wheelA: T * 5, rock: Math.sin(T * 3) * 0.5, fog: 0 };
  const neon = NEON[look.neon][1];
  if (neon) { pctx.globalCompositeOperation = 'lighter'; drawGlow(pctx, neon, 60, 0, -2, 1.6, 0.3); pctx.globalCompositeOperation = 'source-over'; }
  drawSideCar(pctx, car, 0, T);
}

// ---------- HUD ----------
const hudC = {};
function setT(id, v) { if (hudC[id] !== v) { hudC[id] = v; $(id).textContent = v; } }
function setW(id, f) { const v = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; if (hudC[id] !== v) { hudC[id] = v; $(id).style.width = v; } }
function hintText() {
  const p = G.p;
  if (G.atShop) return isTouch() ? 'Trykk HANDLE for å handle 🛒' : 'Trykk E for å handle 🛒';
  if (G.action) return G.owned.cam ? '📹 Kameraet går …' : '♥ Bilen gynger … ♥';
  if (p.passenger) return G.wanted ? 'Rist av purken først!' : 'Parker inntil fortauet (øverste fil) og stopp ♥';
  if (G.date) return 'Kjør inn til fortauet og stopp, så hopper hun inn';
  if (G.gummi <= 0) return 'Plukk opp gummi på veien før du tuter på damene';
  return `Tut på damene på fortauet (${isTouch() ? 'TUT' : 'Mellomrom'})`;
}
function radarText() {
  if (!G.owned.radar) return '';
  const p = G.p, cam = Street.camsIn(p.x, p.x + 1600).find(x => !G.camsHit.has(x));
  if (cam !== undefined) return `📡 Fotoboks om ${Math.round((cam - p.x) * 0.25)} m`;
  return G.traffic.some(c => c.kind === 'police' && !c.chase && c.x > p.x && c.x - p.x < 1600) ? '📡 Purken foran!' : '';
}
function hud() {
  const p = G.p;
  setT('score', fmt(G.score));
  setT('combo', G.combo > 1 ? '×' + G.combo : '');
  setT('kr', fmt(G.kr) + ' kr');
  setT('gummiN', String(G.gummi));
  setT('speed', Math.round(Math.abs(p.v) * KMH) + ' km/t');
  setW('nos', G.nos);
  setT('clock', clockStr());
  setT('district', district(p.x));
  setT('hint', hintText());
  setT('wanted', G.wanted ? '🚨'.repeat(G.wanted) : '');
  setT('prikker', 'PRIKKER ' + '●'.repeat(Math.min(G.prikker, MAX_PRIKKER)) + '○'.repeat(Math.max(0, MAX_PRIKKER - G.prikker)));
  setT('owned', SHOP.filter(s => s.once && G.owned[s.id]).map(s => s.icon).join(' '));
  setT('radar', radarText());
  const b = G.bust > 0.05;
  if (hudC.bust !== b) { hudC.bust = b; show('bust', b); }
  setW('bustbar', G.bust / 1.6);
  const sh = !!G.atShop;
  if (hudC.shop !== sh) { hudC.shop = sh; shopBtn.classList.toggle('hidden', !sh); }
}

// ---------- Butikken ----------
function openShop() {
  if (state !== 'play' || !G.atShop) return;
  state = 'shop'; Sfx.silence(); renderShop(); show('shop', true);
  $('msg').classList.remove('show');
}
function closeShop() { state = 'play'; show('shop', false); }
function renderShop() {
  $('wallet').textContent = `Du har ${fmt(G.kr)} kr · ${G.gummi} gummi`;
  $('shopList').innerHTML = SHOP.map(it => {
    const owned = it.once && G.owned[it.id], broke = G.kr < it.price;
    return `<div class="item"><div class="ic">${it.icon}</div><div class="tx"><b>${it.name}</b><small>${it.desc}</small></div>` +
      `<button data-id="${it.id}" ${owned || broke ? 'disabled' : ''}>${owned ? 'Kjøpt ✓' : fmt(it.price) + ' kr'}</button></div>`;
  }).join('');
}
$('shopList').addEventListener('click', e => {
  const id = e.target.dataset && e.target.dataset.id, it = SHOP.find(s => s.id === id);
  if (!it || G.kr < it.price || (it.once && G.owned[id])) return;
  G.kr -= it.price; Sfx.kaching();
  if (id === 'gummi') G.gummi += 3; else if (id === 'nos') G.nos = 1; else G.owned[id] = true;
  renderShop();
});

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  SC = Math.min(H / VH, W / 760); VW = W / SC; OY = (H - VH * SC) / 2;
}
addEventListener('resize', resize);

// ---------- Skjermer ----------
function start() {
  Sfx.init();
  if (document.activeElement) document.activeElement.blur();
  newGame(); state = 'play';
  show('menu', false); show('over', false); show('pause', false); show('shop', false); show('hud', true);
  for (const k in hudC) delete hudC[k];
  msg('Natta er ung!<small>Plukk opp gummi og tut på damene</small>');
}
function toMenu() {
  state = 'menu';
  show('over', false); show('hud', false); show('menu', true);
  $('hiMenu').textContent = hiscore() ? 'Rekord: ' + fmt(hiscore()) : '';
}
function gameOver(reason) {
  state = 'over'; Sfx.silence();
  $('msg').classList.remove('show');
  const prev = hiscore(), s = G.stats;
  if (G.score > prev) store.set('mj2-hi', G.score);
  $('overTitle').textContent = reason === 'time' ? 'Klokka er 03:00 – natta er over' : 'Lappen ryker! 8 prikker';
  $('overScore').textContent = fmt(G.score);
  $('overRank').textContent = RANKS.find(r => G.score >= r[0])[1];
  $('overStats').innerHTML = `Damer med på tur: ${s.dates} · Gummi plukket: ${s.gummi} · Gullkjeder: ${s.chains}<br>` +
    `Tjent: ${fmt(s.earned)} kr · Nesten-treff: ${s.near} · Rista av purken: ${s.escapes} · Tatt: ${s.busts}`;
  $('hiOver').textContent = G.score > prev ? '★ NY REKORD! ★' : 'Rekord: ' + fmt(prev);
  show('hud', false); show('bust', false); show('shop', false); show('over', true);
}
function togglePause() {
  if (state === 'play') { state = 'pause'; show('pause', true); Sfx.silence(); }
  else if (state === 'pause') { state = 'play'; show('pause', false); }
}
function toggleMusic() {
  const on = Sfx.toggleMusic();
  if (state === 'play') msg(on ? 'Musikk på' : 'Musikk av');
  $('musicBtn').textContent = 'MUSIKK: ' + (on ? 'PÅ' : 'AV');
}
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

// ---------- Hovedløkka ----------
function loop(ts) {
  const dt = Math.min(0.033, Math.max(0, (ts - last) / 1000));
  last = ts; T += dt;
  if (state === 'play') {
    update(dt);
    if (state === 'play') {
      const p = G.p, siren = G.traffic.reduce((m, c) => c.siren ? Math.max(m, 1 - Math.abs(c.x - p.x) / 1600) : m, 0);
      Sfx.update(Math.min(1, Math.abs(p.v) / 760), input.gas && !G.action ? 1 : 0, p.brake && p.v > 250 ? 0.4 : 0, siren);
      hud();
    }
  } else if (state === 'menu' || state === 'over') attract(dt);
  if (state !== 'pause' && state !== 'shop') render();
  if (state === 'menu') drawPreview();
  requestAnimationFrame(loop);
}

buildPickers(); resize(); newGame(); toMenu();
$('start').onclick = start; $('again').onclick = start; $('toMenu').onclick = toMenu;
$('resume').onclick = togglePause; $('musicBtn').onclick = toggleMusic; $('shopDone').onclick = closeShop;
$('clock').onclick = togglePause;
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
