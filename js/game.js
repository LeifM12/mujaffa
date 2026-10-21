'use strict';
// Spillogikk: BMW-en, gummi, damene, butikken, politiet og tegning av gata.
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const NIGHT = 180, MAX_PRIKKER = 8;
const LACK = [['Sort', '#15171c'], ['Hvit', '#e6e7eb'], ['Gull', '#c9a227'], ['Rød', '#a3121b'], ['Blå', '#1d3b8f']];
const NEON = [['Lilla', 'rgba(170,80,255,0.75)'], ['Blå', 'rgba(40,160,255,0.75)'], ['Grønn', 'rgba(40,255,140,0.7)'], ['Rosa', 'rgba(255,60,170,0.75)'], ['Av', null]];
const SHOP = [
  { id: 'gummi', icon: '🛍️', name: 'Gummi 3-pakning', desc: 'Sikkerhet først. +3 gummi', price: 150 },
  { id: 'cam', icon: '📹', name: 'Bilkamera', desc: 'Se actionen på skjermen', price: 1500, once: true },
  { id: 'bass', icon: '🔊', name: 'Bass-anlegg', desc: 'Damene digger bassen: +25 % sjanse', price: 1200, once: true },
  { id: 'felger', icon: '✨', name: 'Gullfelger', desc: '+25 % respekt på alt', price: 900, once: true },
  { id: 'radar', icon: '📡', name: 'Radarvarsler', desc: 'Varsler om fotobokser og purken', price: 800, once: true },
  { id: 'duft', icon: '🌲', name: 'Duftgran', desc: 'Lukter vanilje. +5 % sjanse', price: 100, once: true },
  { id: 'nos', icon: '🔥', name: 'NOS-påfyll', desc: 'Full NOS-tank', price: 250 }
];
const SAY = {
  yes: ['Hei kjekken! 😘', 'Fin bil! 😍', 'Skal vi ta en tur?', 'Endelig en med stil!', 'Ok da, én tur 😏'],
  noGummi: ['Ikke uten gummi! 🙅‍♀️', 'Har du gummi? Nei? Ha det!', 'Sikkerhet først, vennen'],
  no: ['Nei takk!', 'Drøm videre 🙄', 'Kjør videre, kompis', 'Har kjæreste!', 'Kanskje neste gang'],
  fast: ['Hæ?', 'For en råkjører …'],
  bye: ['Ring meg! 📱', 'Det var hyggelig ♥', 'Vi ses, kjekken!', 'Wow 😳'],
  giveUp: ['Typisk …', 'Glem det!'],
  full: ['Bilen er jo full!'],
  men: ['Feil fyr, bror 😅', 'Rått anlegg!', 'Fin bil, mann!', 'Hæ?']
};
const PHYS = { acc: 380, max: 560, nosAcc: 820, nosMax: 760, brake: 950, rev: 150 };
const pick = a => a[Math.random() * a.length | 0];
const input = { gas: 0, brake: 0, nos: 0 };
let state = 'menu', G = null, T = 0, W = 1, H = 1, DPR = 1, SC = 1, VW = 1000, OY = 0;
let look = { lack: 0, neon: 0 };
const isTouch = () => document.body.classList.contains('touch');

function newGame() {
  const p = { x: 260, y: LANES[0], lane: 0, prevLane: 0, v: 0, type: 'bmw', kind: 'player', color: LACK[look.lack][1],
    driver: true, wheelA: 0, rock: 0, tilt: 0, fog: 0, brake: false, passenger: null, rims: null };
  G = { p, seed: Math.random() * 1e6 | 0, time: 0, score: 0, combo: 1, comboT: 0, kr: 500, gummi: 0, prikker: 0,
    wanted: 0, bust: 0, escT: 0, spawnPT: 0, nos: 0.5, owned: {}, traffic: [], peds: [], items: [], parts: [], pops: [],
    flashes: [], spawned: -1, camX: 0, shake: 0, date: null, action: null, parkT: 0, atShop: null, camTip: false,
    camsHit: new Set(), boosting: false, stats: { dates: 0, gummi: 0, chains: 0, earned: 0, escapes: 0, busts: 0, near: 0 } };
  for (let k = 0; k < 6; k++) G.traffic.push(makeTraffic(p.x + 600 + k * 420 + Math.random() * 200, Math.random() * 3 | 0, false));
}

// Nytt stykke gate foran deg: folk på fortauet og ting på veien
function spawnChunk(c) {
  const r = rng(c * 7919 + G.seed), x0 = c * CHUNK;
  if (c === 0) {
    G.items.push({ x: 640, lane: 0, kind: 'gummi', val: 1, ph: 0 });
    const q = Street.makePed(1060, r, 'dame'); q.walk = 0; G.peds.push(q);
  }
  for (let k = 0, n = 2 + (r() * 2 | 0); k < n; k++) G.peds.push(Street.makePed(x0 + 150 + r() * (CHUNK - 300), r, r() < 0.68 ? 'dame' : 'mann'));
  const items = [];
  if (r() < 0.75) items.push(['gummi', 1]);
  if (r() < 0.3) items.push(['gummi', 1]);
  for (let k = 0, n = r() * 3 | 0; k < n; k++) { const q = r(); items.push(['kr', q < 0.6 ? 100 : q < 0.9 ? 200 : 500]); }
  if (r() < 0.5) items.push(['chain', 1]);
  for (const [kind, val] of items) G.items.push({ x: x0 + 100 + r() * (CHUNK - 200), lane: r() * 3 | 0, kind, val, ph: r() * 6 });
}

// ---------- Hendelser ----------
function msg(html) {
  const m = $('msg');
  m.innerHTML = html; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
}
const pop = (x, y, text, color) => G.pops.push({ x, y, text, color, life: 1.5 });
const say = (q, text) => { q.say = text; q.sayT = 2.6; };
function part(x, y, vx, vy, life, size, color, heart = false) {
  if (G.parts.length < 400) G.parts.push({ x, y, vx, vy, life, max: life, size, color, heart });
}
function burst(x, y, n, color, sp, life, size) {
  for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random()); part(x, y, Math.cos(a) * s, Math.sin(a) * s, life, size, color); }
}
function respekt(base, label, x, y, color = '#f5c542') {
  const pts = Math.round(base * G.combo * (G.owned.felger ? 1.25 : 1));
  G.score += pts; G.comboT = 4.5; G.combo = Math.min(5, G.combo + 1);
  pop(x, y, `+${pts} ${label}`, color);
  return pts;
}
function raiseWanted(reason) {
  if (G.wanted >= 3) return;
  G.wanted++; G.escT = 0; G.spawnPT = 1.2;
  msg(`<span style="color:#5b9bff">BLÅLYS!</span><small>${reason}</small>`);
}

function laneChange(d) {
  if (state !== 'play' || G.action) return;
  const p = G.p, nl = clamp(p.lane + d, 0, 2);
  if (nl !== p.lane) { p.prevLane = p.lane; p.lane = nl; }
}

function honk() {
  const p = G.p;
  Sfx.horn();
  if (G.action) return;
  const range = [190, 150, 110][laneIdx(p.y)];
  let q = null;
  for (const o of G.peds) if (o.state === 'idle' && o.cool <= 0 && Math.abs(o.x - p.x) < range && (!q || Math.abs(o.x - p.x) < Math.abs(q.x - p.x))) q = o;
  if (!q) return;
  q.cool = 8;
  if (q.kind === 'mann') return say(q, pick(SAY.men));
  if (p.v > 230) return say(q, pick(SAY.fast));
  if (p.passenger || G.date) return say(q, pick(SAY.full));
  if (G.gummi <= 0) return say(q, pick(SAY.noGummi));
  const chance = 0.5 + (G.owned.bass ? 0.25 : 0) + (G.owned.duft ? 0.05 : 0) + (G.owned.felger ? 0.1 : 0)
    + Math.min(0.15, G.score / 30000) - (G.wanted ? 0.35 : 0);
  if (Math.random() < chance) { say(q, pick(SAY.yes)); q.state = 'walk'; q.wait = 0; G.date = q; Sfx.kiss(); }
  else { say(q, pick(SAY.no)); q.cool = 12; }
}

function collect(it) {
  const p = G.p, y = p.y - 90;
  if (it.kind === 'gummi') { G.gummi++; G.stats.gummi++; pop(it.x, y, '+1 GUMMI', '#7cd3ff'); Sfx.pop(); burst(it.x, LANES[it.lane] - 14, 10, '#7cd3ff', 120, 0.5, 2.5); }
  else if (it.kind === 'kr') { G.kr += it.val; G.stats.earned += it.val; pop(it.x, y, `+${it.val} kr`, '#7dff9b'); Sfx.kaching(); }
  else { respekt(100, 'GULLKJEDE', it.x, y); G.stats.chains++; Sfx.chain(); burst(it.x, LANES[it.lane] - 14, 14, '#f5c542', 140, 0.6, 2.5); }
}

function hit(c, rel) {
  const p = G.p;
  Sfx.crash(Math.min(1, rel / 500)); G.shake = Math.min(14, rel / 35);
  burst((p.x + c.x) / 2, p.y - 30, 12, '#ffd36b', 220, 0.4, 2.5);
  G.combo = 1; G.comboT = 0;
  if (c.kind === 'police') raiseWanted('Du rammet en politibil!');
  else { G.score = Math.max(0, G.score - 25); pop(p.x, p.y - 90, 'Bulk! −25', '#ff6b6b'); }
}

function finishAction() {
  const p = G.p, q = p.passenger;
  G.action = null; p.passenger = null; G.gummi--; G.stats.dates++;
  respekt(400, 'DATE ♥', p.x, p.y - 120, '#ff7ab8');
  Object.assign(q, { state: 'leave', x: p.x - 20, alpha: 0, walk: (Math.random() < 0.5 ? -1 : 1) * 30, cool: 1e9 });
  say(q, pick(SAY.bye));
  Sfx.good();
  if (!G.owned.cam && !G.camTip) { G.camTip = true; msg('♥ ♥ ♥<small>Kjøp bilkamera i butikken for å se actionen 📹</small>'); }
  else msg(pick(['Respekt! ♥', 'Kjekken! ♥', 'Rått! ♥']) + '<small>+1 date · −1 gummi</small>');
}

function escapeCops() {
  const lvl = G.wanted;
  G.wanted = 0; G.escT = 0; G.stats.escapes++;
  for (const c of G.traffic) if (c.kind === 'police') Object.assign(c, { chase: false, siren: false, cruise: 230 });
  const pts = respekt(300 * lvl, 'RISTA AV PURKEN', G.p.x, G.p.y - 120, '#7dff6b');
  msg(`Rista av purken!<small>+${pts} respekt</small>`);
  Sfx.good();
}

function busted() {
  const p = G.p, loss = Math.round(G.kr * 0.3);
  G.prikker += 3; G.kr -= loss; G.stats.busts++;
  G.wanted = 0; G.bust = 0; G.combo = 1; p.v = 0;
  G.traffic = G.traffic.filter(c => c.kind !== 'police');
  if (p.passenger) { const q = p.passenger; p.passenger = null; Object.assign(q, { state: 'leave', x: p.x, alpha: 0, walk: -40, cool: 1e9 }); say(q, 'Jeg drar!'); }
  if (G.date) { G.date.state = 'idle'; G.date = null; }
  Sfx.bad();
  msg(`TATT!<small>+3 prikker · −${loss.toLocaleString('nb-NO')} kr</small>`);
  if (G.prikker >= MAX_PRIKKER) gameOver('lappen');
}

// ---------- Oppdatering ----------
function updatePlayer(dt) {
  const p = G.p, busy = !!G.action;
  const gas = busy ? 0 : input.gas, brk = busy ? 0 : input.brake;
  p.boost = !!(!busy && input.nos && gas && G.nos > 0.02);
  if (p.boost) { G.nos = Math.max(0, G.nos - dt * 0.3); if (!G.boosting) Sfx.nos(); }
  G.boosting = p.boost;
  G.nos = Math.min(1, G.nos + dt * 0.012);
  const max = p.boost ? PHYS.nosMax : PHYS.max;
  if (gas && p.v < max) p.v += (p.boost ? PHYS.nosAcc : PHYS.acc) * dt;
  if (brk) p.v = p.v > 10 ? p.v - PHYS.brake * dt : Math.max(-PHYS.rev, p.v - PHYS.acc * 0.6 * dt);
  if (!gas && !brk) p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), 70 * dt);
  if (p.v > max) p.v -= (p.v - max) * 2 * dt;
  p.brake = !!brk && p.v > 0;
  p.x += p.v * dt;
  if (p.x < 120) { p.x = 120; p.v = Math.max(0, p.v); }
  p.wheelA += p.v * dt / TYPES.bmw.wr;
  p.y += (LANES[p.lane] - p.y) * Math.min(1, dt * 9);
  p.rims = G.owned.felger ? '#f5c542' : null;
  if (p.boost) {
    const s = laneScale(p.y);
    part(p.x - 90 * s, p.y - 10 * s, -260 - Math.random() * 120, (Math.random() - 0.5) * 40, 0.16, 5, Math.random() < 0.5 ? '#ffb347' : '#ffe08a');
  }
}

function updateCollisions(dt) {
  const p = G.p, pl = laneIdx(p.y);
  for (const c of G.traffic) {
    if (c.miss > 0) c.miss -= dt;
    const side = Math.sign(p.x - c.x);
    if (c.side === -1 && side === 1) {
      if (c.kind === 'police' && !c.chase && p.v * KMH > 90) raiseWanted('Purken så deg kjøre for fort!');
      else if (Math.abs(laneIdx(c.y) - pl) === 1 && p.v - c.v > 180 && c.miss <= 0) {
        c.miss = 3; G.stats.near++; respekt(25, 'NESTEN!', c.x, c.y - 80, '#38d9ff');
      }
    }
    c.side = side;
    if (Math.abs(c.y - p.y) > 26) continue;
    const lim = (carLen(p) + carLen(c)) / 2 - 8, dx = c.x - p.x;
    if (Math.abs(dx) >= lim) continue;
    if (Math.abs(p.y - LANES[p.lane]) > 6 && p.prevLane !== p.lane) { p.lane = p.prevLane; hit(c, 140); continue; }
    if (dx > 0) {
      p.x = c.x - lim;
      const rel = p.v - c.v;
      if (rel > 0) { if (rel > 110) hit(c, rel); p.v = c.v - rel * 0.3; c.v += rel * 0.2; c.stun = Math.max(c.stun, 0.6); }
    } else {
      p.x = c.x + lim;
      const rel = c.v - p.v;
      if (rel > 0) { if (rel > 110) hit(c, rel); p.v += rel * 0.5; c.v -= rel * 0.5; }
    }
  }
}

function manageTraffic() {
  const p = G.p, far = G.camX + VW + 1800;
  G.traffic = G.traffic.filter(c => (c.x > G.camX - 900 && c.x < far + 1500) || (c.chase && c.x > G.camX - 2200));
  if (G.traffic.filter(c => !c.chase).length >= 9) return;
  const behind = p.v < 140 && Math.random() < 0.3, lane = Math.random() * 3 | 0;
  const c = makeTraffic(behind ? G.camX - 300 : G.camX + VW + 200 + Math.random() * 1400, lane, !G.wanted && Math.random() < 0.1);
  if (behind) c.cruise = c.v = 330 + Math.random() * 60;
  if (laneFree(c, lane, [...G.traffic, p], 140) && !(behind && Math.abs(LANES[lane] - p.y) < 30)) G.traffic.push(c);
}

function updatePolice(dt) {
  const p = G.p;
  if (!G.wanted) { G.bust = 0; return; }
  const all = [...G.traffic, p], cops = G.traffic.filter(c => c.kind === 'police');
  for (const c of cops) policeChase(c, p, dt, all, G.wanted);
  if (cops.filter(c => Math.abs(c.x - p.x) < 1600).length < G.wanted && (G.spawnPT -= dt) <= 0) {
    G.spawnPT = 2.5;
    const c = makeTraffic(G.camX - 250, Math.random() * 3 | 0, true);
    c.v = p.v + 120; policeChase(c, p, 0, all, G.wanted); G.traffic.push(c);
  }
  const nearest = Math.min(1e9, ...cops.map(c => Math.abs(c.x - p.x)));
  if (nearest > 900) { if ((G.escT += dt) > 4) return escapeCops(); } else G.escT = 0;
  const close = cops.some(c => Math.abs(c.x - p.x) < 190 && Math.abs(c.y - p.y) < 70);
  G.bust = close && Math.abs(p.v) < 110 ? G.bust + dt : Math.max(0, G.bust - dt * 0.6);
  if (G.bust > 1.6) busted();
}

function updatePeds(dt) {
  const p = G.p;
  for (const q of G.peds) {
    if (q.sayT > 0) q.sayT -= dt;
    if (q.cool > 0) q.cool -= dt;
    if (q.state === 'idle' && q.walk) q.x += q.walk * dt;
    else if (q.state === 'walk') {
      const d = p.x - 10 - q.x;
      q.x += clamp(d, -110 * dt, 110 * dt); q.wait += dt;
      if (Math.abs(d) < 16 && laneIdx(p.y) === 0 && Math.abs(p.v) < 30) {
        q.state = 'in'; p.passenger = q; G.date = null; Sfx.door();
        pop(p.x, p.y - 110, 'Hun hoppa inn! ♥', '#ff7ab8');
      } else if (q.wait > 14 || Math.abs(d) > 900) { q.state = 'idle'; q.cool = 15; say(q, pick(SAY.giveUp)); G.date = null; }
    } else if (q.state === 'leave') { q.x += q.walk * dt; q.alpha = Math.min(1, q.alpha + dt * 3); }
  }
  G.peds = G.peds.filter(q => q.state === 'in' || q === G.date || (q.x > G.camX - 300 && q.x < G.camX + VW + 3000));
}

function updateAction(dt) {
  const p = G.p;
  if (p.passenger && !G.action) {
    const parked = laneIdx(p.y) === 0 && Math.abs(p.v) < 12 && !G.wanted;
    G.parkT = parked ? G.parkT + dt : 0;
    if (G.parkT > 0.6) { G.action = { t: 0, dur: 4.5, sq: 0 }; G.parkT = 0; }
  }
  const a = G.action;
  if (a) {
    a.t += dt; p.v = 0;
    p.rock = Math.sin(a.t * 17) * 2.6; p.tilt = Math.sin(a.t * 17 + 1) * 0.012; p.fog = Math.min(1, p.fog + dt * 0.8);
    if ((a.sq -= dt) <= 0) { a.sq = 0.3; Sfx.squeak(); }
    if (Math.random() < dt * 9) part(p.x + (Math.random() - 0.5) * 80, p.y - 70, (Math.random() - 0.5) * 30, -60 - Math.random() * 40, 1.4, 16, Math.random() < 0.5 ? '#ff3fa4' : '#ff7ab8', true);
    if (a.t >= a.dur) finishAction();
  } else { p.rock *= 0.85; p.tilt = 0; p.fog = Math.max(0, p.fog - dt * 0.25); }
}

function update(dt) {
  const p = G.p;
  G.time += dt;
  if (G.time >= NIGHT) return gameOver('time');
  updatePlayer(dt);
  while ((G.spawned + 1) * CHUNK < G.camX + VW + 1500) spawnChunk(++G.spawned);
  updateTraffic(dt, G.traffic, p);
  updatePolice(dt);
  if (state !== 'play') return;
  updateCollisions(dt);
  manageTraffic();
  const pl = laneIdx(p.y), reach = carLen(p) / 2 + 10;
  for (const it of G.items) if (!it.got && it.lane === pl && Math.abs(it.x - p.x) < reach) { it.got = true; collect(it); }
  G.items = G.items.filter(it => !it.got && it.x > G.camX - 400);
  updatePeds(dt);
  updateAction(dt);
  for (const cx of Street.camsIn(p.x - 50, p.x + 50)) {
    if (G.camsHit.has(cx) || Math.abs(cx - p.x) > 40) continue;
    G.camsHit.add(cx);
    const kmh = Math.round(p.v * KMH);
    if (kmh > 80) {
      const bot = Math.min(G.kr, 1500);
      G.prikker++; G.kr -= bot; G.flashes.push({ x: cx, a: 1 }); Sfx.flash();
      msg(`BLITZ! 📸<small>${kmh} km/t i 50-sone · +1 prikk · bot ${bot.toLocaleString('nb-NO')} kr</small>`);
      if (G.prikker >= MAX_PRIKKER) return gameOver('lappen');
    }
  }
  G.atShop = !G.action && pl === 0 && Math.abs(p.v) < 40 ? Street.shopAt(p.x) : null;
  if (G.comboT > 0 && (G.comboT -= dt) <= 0) G.combo = 1;
  tick(dt);
  const lead = 0.38 - 0.16 * clamp(p.v / PHYS.max, 0, 1);
  G.camX = Math.max(0, G.camX + (p.x - VW * lead - G.camX) * Math.min(1, dt * 3));
}

// Partikler, poeng-tekster, blitz og skjelving
function tick(dt) {
  for (const q of G.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  G.parts = G.parts.filter(q => q.life > 0);
  for (const q of G.pops) { q.y -= 34 * dt; q.life -= dt; }
  G.pops = G.pops.filter(q => q.life > 0);
  for (const f of G.flashes) f.a -= dt * 3;
  G.flashes = G.flashes.filter(f => f.a > 0);
  G.shake = Math.max(0, G.shake - dt * 30);
}

// Menyen: gata lever i bakgrunnen mens kameraet glir bortover
function attract(dt) {
  G.camX += 70 * dt;
  while ((G.spawned + 1) * CHUNK < G.camX + VW + 1500) spawnChunk(++G.spawned);
  updateTraffic(dt, G.traffic, G.p);
  manageTraffic();
  for (const q of G.peds) { if (q.sayT > 0) q.sayT -= dt; if (q.state === 'idle' && q.walk) q.x += q.walk * dt; }
  G.peds = G.peds.filter(q => q.x > G.camX - 300);
  tick(dt);
}

// ---------- Tegning ----------
const clockStr = () => {
  const m = 21 * 60 + Math.min(G.time, NIGHT) / NIGHT * 360;
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
};

function drawItem(it, X) {
  const y = LANES[it.lane] - 6, s = laneScale(LANES[it.lane]), b = Math.sin(T * 4 + it.ph) * 2;
  ctx.save(); ctx.translate(X, y + b); ctx.scale(s, s);
  if (it.kind === 'gummi') {
    ctx.fillStyle = '#2b8fd6'; rrect(ctx, -12, -24, 24, 24, 4); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, -12, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(-9.5, -21.5, 19, 19); ctx.setLineDash([]);
  } else if (it.kind === 'kr') {
    ctx.fillStyle = it.val >= 500 ? '#2e6fc1' : it.val >= 200 ? '#3a8f5a' : '#c0603a'; rrect(ctx, -18, -17, 36, 17, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-15, -14.5, 30, 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.val, 0, -8.5);
  } else {
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.ellipse(0, -16, 12, 9, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffe08a'; dot(ctx, 0, -6, 4.5);
  }
  ctx.restore();
}

// Bilkameraet: sensurert «action» i Sims-stil – to hoder, dugg, hjerter og en stor sperre
function drawCamView(x, y, w, h, a) {
  const t = a.t, q = G.p.passenger || {}, bob = Math.sin(t * 17) * 3, lean = Math.min(1, t / 0.8) * 12;
  ctx.save(); ctx.translate(x, y);
  rrect(ctx, 0, 0, w, h, 10); ctx.fillStyle = '#120f1f'; ctx.fill(); ctx.clip();
  ctx.scale(w / 250, h / 165);
  ctx.fillStyle = '#0b1530'; ctx.fillRect(0, 0, 250, 82);
  for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(255,${170 + i * 5},110,0.55)`; dot(ctx, (i * 37 + 10) % 250, 28 + (i * 13) % 40, 2 + i % 3); }
  ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, 250, 12); ctx.fillRect(0, 76, 250, 10);
  ctx.fillStyle = '#222'; ctx.fillRect(110, 12, 30, 11);
  ctx.save(); ctx.translate(125, 23); ctx.rotate(Math.sin(t * 9) * 0.5);
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.stroke();
  if (G.owned.duft) { ctx.fillStyle = '#2f9e44'; ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(-8, 33); ctx.lineTo(8, 33); ctx.fill(); }
  else { ctx.fillStyle = '#eee'; ctx.fillRect(-10, 15, 9, 9); ctx.fillRect(1, 17, 9, 9); ctx.fillStyle = '#111'; dot(ctx, -5.5, 19.5, 1.3); dot(ctx, 5.5, 21.5, 1.3); }
  ctx.restore();
  ctx.fillStyle = '#2a1f33'; rrect(ctx, 26, 72, 84, 100, 14); ctx.fill(); rrect(ctx, 140, 72, 84, 100, 14); ctx.fill();
  const dx = 80 + lean, qx = 170 - lean;
  ctx.fillStyle = '#d9a27a'; dot(ctx, dx, 106 + bob, 19);
  ctx.fillStyle = '#111'; ctx.fillRect(dx - 20, 82 + bob, 40, 10); ctx.fillRect(dx - 2, 88 + bob, 26, 5);
  ctx.fillStyle = '#1b1b1f'; ctx.fillRect(dx - 14, 100 + bob, 30, 7);
  ctx.fillStyle = q.hair || '#f3d27a'; ctx.fillRect(qx - 20, 96 - bob, 40, 46);
  ctx.fillStyle = q.skin || '#f6d3b3'; dot(ctx, qx, 106 - bob, 18);
  ctx.fillStyle = q.hair || '#f3d27a'; ctx.beginPath(); ctx.arc(qx, 102 - bob, 19.5, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
  ctx.font = '18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const hy = 150 - ((t * 40 + i * 30) % 150);
    ctx.globalAlpha = Math.min(1, hy / 60); ctx.fillStyle = i % 2 ? '#ff3fa4' : '#ff7ab8'; ctx.fillText('♥', 30 + i * 38 + Math.sin(t * 3 + i) * 8, hy);
  }
  ctx.globalAlpha = Math.min(0.3, t / 8); ctx.fillStyle = '#e6ecf5';
  for (let i = 0; i < 7; i++) dot(ctx, (i * 41 + t * 12) % 270 - 10, 36 + (i * 23) % 36, 20);
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(125, 124); ctx.rotate(-0.08);
  ctx.fillStyle = '#000'; ctx.fillRect(-100, -16, 200, 32);
  ctx.fillStyle = '#fff'; ctx.font = '900 19px system-ui, sans-serif'; ctx.fillText('SENSURERT', 0, 1);
  ctx.restore();
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff3030'; dot(ctx, 16, 152, 5); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText('REC  CAM 1', 26, 153);
  ctx.textAlign = 'right'; ctx.fillText(clockStr(), 240, 153);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; rrect(ctx, x, y, w, h, 10); ctx.stroke();
}

function render() {
  const p = G.p, play = state === 'play' || state === 'pause' || state === 'shop';
  const shake = (Math.random() - 0.5) * G.shake, camX = G.camX + shake;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0b0c10'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, DPR * (OY + shake * 0.5));
  Street.drawSky(ctx, VW, camX, T);
  Street.drawSkyline(ctx, VW, camX, T);
  Street.drawMid(ctx, VW, camX);
  Street.drawBuildings(ctx, VW, camX, T);
  Street.drawStreet(ctx, VW, camX);
  for (const q of G.peds) { const X = q.x - camX; if (q.state !== 'in' && X > -40 && X < VW + 40) Street.drawPed(ctx, q, X, T); }
  const list = G.items.map(it => ({ y: LANES[it.lane] - 0.5, it })).concat(G.traffic.map(c => ({ y: c.y, c })));
  if (play) list.push({ y: p.y, c: p });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) {
    const X = (d.it || d.c).x - camX;
    if (X < -260 || X > VW + 260) continue;
    if (d.it) drawItem(d.it, X); else drawSideCar(ctx, d.c, X, T);
  }

  ctx.globalCompositeOperation = 'lighter';
  Street.drawLights(ctx, VW, camX, G.flashes);
  for (const c of G.traffic) { const X = c.x - camX; if (X > -400 && X < VW + 300) carLights(ctx, c, X, T); }
  if (play) carLights(ctx, p, p.x - camX, T, NEON[look.neon][1]);
  for (const it of G.items) {
    const X = it.x - camX;
    if (X > -40 && X < VW + 40 && it.kind !== 'kr') drawGlow(ctx, it.kind === 'gummi' ? 'rgba(60,160,255,0.4)' : 'rgba(245,197,66,0.4)', 34, X, LANES[it.lane] - 18);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of G.parts) {
    const X = q.x - camX;
    ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.color;
    if (q.heart) { ctx.font = `${q.size}px system-ui, sans-serif`; ctx.fillText('♥', X, q.y); } else dot(ctx, X, q.y, q.size);
  }
  ctx.globalAlpha = 1;
  for (const q of G.peds) if (q.sayT > 0 && q.state !== 'in') Street.drawBubble(ctx, q.say, q.x - camX, q.y - 72, Math.min(1, q.sayT * 2));
  ctx.font = '900 20px system-ui, sans-serif';
  for (const q of G.pops) {
    const X = q.x - camX;
    ctx.globalAlpha = Math.min(1, q.life * 1.5);
    ctx.fillStyle = '#000'; ctx.fillText(q.text, X + 2, q.y + 2);
    ctx.fillStyle = q.color; ctx.fillText(q.text, X, q.y);
  }
  ctx.globalAlpha = 1;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (play && G.action && G.owned.cam) {
    const w = W < 640 ? 190 : 260, h = w * 0.66;
    drawCamView(W - w - 12, W < 640 ? 150 : 140, w, h, G.action);
  }
}
