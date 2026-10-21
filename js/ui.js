'use strict';
// Grensesnitt: input, HUD, minikart, menyer og hovedløkka.
const mini = $('mini'), mctx = mini.getContext('2d');
const pv = $('preview'), pctx = pv.getContext('2d');
let miniL = null, last = 0;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privat modus: ingen lagring */ } }
};
look.lack = clamp(+store.get('mj-lack') || 0, 0, LACK.length - 1);
look.neon = clamp(+(store.get('mj-neon') ?? 0), 0, NEON.length - 1);
const RANKS = [[12000, 'Legenden fra Karl Johan'], [8000, 'Kongen av Grønland'], [5000, 'Respektert bror'],
  [2500, 'Lokal kjendis'], [1000, 'Moped-legende'], [0, 'Søndagssjåfør']];
const hiscore = () => +store.get('mj-hi') || 0;
const fmt = n => Math.round(n).toLocaleString('nb-NO');
const show = (id, on) => $(id).classList.toggle('hidden', !on);

// ---------- Input ----------
const KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right', Space: 'drift', ShiftLeft: 'nos', ShiftRight: 'nos', KeyH: 'horn' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) { input[k] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyM') toggleMusic();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'Enter' && (state === 'menu' || state === 'over')) start();
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) input[k] = 0; });
addEventListener('blur', () => { for (const k in input) input[k] = 0; });
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const set = v => e => { e.preventDefault(); input[k] = v; b.classList.toggle('on', !!v); };
  b.addEventListener('pointerdown', set(1));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(0));
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
  pctx.translate(pv.width / 2, pv.height / 2 + 6); pctx.scale(3.6, 3.6);
  const car = { x: 0, y: 0, drawA: -0.25 + Math.sin(T * 0.9) * 0.25, color: LACK[look.lack][1], kind: 'player', brake: 0 };
  const neon = NEON[look.neon][1];
  if (neon) {
    pctx.save(); pctx.globalCompositeOperation = 'lighter'; pctx.rotate(car.drawA); pctx.scale(1.5, 0.85);
    World.drawGlow(pctx, neon, 34, 0, 0, 1 + Math.sin(T * 6) * 0.06); pctx.restore();
  }
  drawCar(pctx, car, T, { rims: true, kidney: true });
}

// ---------- HUD og minikart ----------
const hudC = {};
function setT(id, v) { if (hudC[id] !== v) { hudC[id] = v; $(id).textContent = v; } }
function setW(id, f) { const v = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; if (hudC[id] !== v) { hudC[id] = v; $(id).style.width = v; } }
function hud() {
  const p = G.p, m = G.mission;
  setT('score', fmt(G.score));
  setT('combo', G.combo > 1 ? '×' + G.combo : '');
  setT('speed', Math.round(p.speed * KMH) + ' km/t');
  setW('nos', G.nos);
  const mins = 21 * 60 + Math.min(G.time, NIGHT) / NIGHT * 360;
  setT('clock', String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(mins % 60)).padStart(2, '0'));
  setT('district', World.district(p.x, p.y));
  setT('mission', !m ? '' : m.stage === 'pickup' ? `Hent ${m.name} ved ${m.at.sign.toLowerCase()}en på ${m.at.name}`
    : `Kjør ${m.name} til ${m.to.name} · ${Math.ceil(m.t)} s`);
  setT('wanted', G.wanted ? '🚨'.repeat(G.wanted) : '');
  setT('prikker', 'PRIKKER ' + '●'.repeat(Math.min(G.prikker, MAX_PRIKKER)) + '○'.repeat(Math.max(0, MAX_PRIKKER - G.prikker)));
  const b = G.bust > 0.05;
  if (hudC.bust !== b) { hudC.bust = b; show('bust', b); }
  setW('bustbar', G.bust / 1.6);
}
function drawMini() {
  if (!miniL) return;
  const { s, ox, oy } = miniL, d = DPR, P = o => [o.x * s + ox, o.y * s + oy];
  const blob = (o, r, col) => { const [x, y] = P(o); mctx.fillStyle = col; mctx.beginPath(); mctx.arc(x, y, r * d, 0, 7); mctx.fill(); };
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.drawImage(miniL.c, 0, 0);
  for (const ch of G.chains) blob(ch, 1.3, '#f5c542');
  for (const c of G.police) blob(c, 2.6, c.siren && Math.floor(T * 6) % 2 ? '#ff4040' : '#4d8dff');
  const ob = objective();
  if (ob) blob(ob, 3.5 + Math.sin(T * 6), ob.col);
  const [x, y] = P(G.p);
  mctx.save(); mctx.translate(x, y); mctx.rotate(G.p.a); mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.moveTo(5 * d, 0); mctx.lineTo(-3.5 * d, -3.5 * d); mctx.lineTo(-3.5 * d, 3.5 * d); mctx.closePath(); mctx.fill();
  mctx.restore();
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  const small = matchMedia('(max-width:640px)').matches;
  mini.width = Math.round((small ? 120 : 190) * DPR); mini.height = Math.round((small ? 90 : 140) * DPR);
  miniL = World.miniLayer(mini.width, mini.height);
}
addEventListener('resize', resize);

// ---------- Skjermer ----------
function start() {
  Sfx.init();
  if (document.activeElement) document.activeElement.blur();
  newGame(); state = 'play';
  show('menu', false); show('over', false); show('pause', false); show('hud', true);
  for (const k in hudC) delete hudC[k];
  msg('Natta er ung!<small>Samle respekt før klokka slår 03:00</small>');
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
  if (G.score > prev) store.set('mj-hi', G.score);
  $('overTitle').textContent = reason === 'time' ? 'Klokka er 03:00 – natta er over' : 'Lappen ryker! 8 prikker';
  $('overScore').textContent = fmt(G.score);
  $('overRank').textContent = RANKS.find(r => G.score >= r[0])[1];
  $('overStats').innerHTML = `Gullkjeder: ${s.chains} · Kompiser kjørt: ${s.kompis} · Driftpoeng: ${fmt(s.drift)}<br>` +
    `Rista av purken: ${s.escapes} · Tatt: ${s.busts} · Prikker: ${Math.min(G.prikker, MAX_PRIKKER)}/${MAX_PRIKKER}`;
  $('hiOver').textContent = G.score > prev ? '★ NY REKORD! ★' : 'Rekord: ' + fmt(prev);
  show('hud', false); show('bust', false); show('over', true);
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
    const n = dt > 0.018 ? 2 : 1;
    for (let k = 0; k < n && state === 'play'; k++) update(dt / n);
    if (state === 'play') {
      const p = G.p;
      const siren = G.police.reduce((m, c) => c.siren ? Math.max(m, 1 - dist(c, p) / 1600) : m, 0);
      const skid = G.drifting ? Math.min(1, Math.abs(p.lat) / 300) : p.brake && p.fwd > 220 ? 0.5 : 0;
      Sfx.update(Math.min(1, p.speed / 720), input.gas, skid, siren);
      hud();
    }
  } else if (state !== 'pause') attract(dt);
  if (state !== 'pause') render();
  if (state === 'play') drawMini();
  if (state === 'menu') drawPreview();
  requestAnimationFrame(loop);
}

buildPickers(); resize(); newGame(); toMenu();
$('start').onclick = start; $('again').onclick = start; $('toMenu').onclick = toMenu;
$('resume').onclick = togglePause; $('musicBtn').onclick = toggleMusic; mini.onclick = togglePause;
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
