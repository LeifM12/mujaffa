'use strict';
// Spillogikk: tilstand, respekt, oppdrag, politi, partikler, kamera og tegning.
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const KMH = 0.3, NIGHT = 180, MAX_PRIKKER = 8;
const LACK = [['Sort', '#15171c'], ['Hvit', '#e6e7eb'], ['Gull', '#c9a227'], ['Rød', '#a3121b'], ['Blå', '#1d3b8f']];
const NEON = [['Lilla', 'rgba(170,80,255,0.65)'], ['Blå', 'rgba(40,160,255,0.65)'], ['Grønn', 'rgba(40,255,140,0.6)'], ['Rosa', 'rgba(255,60,170,0.65)'], ['Av', null]];
const NAMES = ['Ahmed', 'Jonas', 'Mo', 'Sander', 'Yusuf', 'Emil', 'Ali', 'Kevin', 'Hamza', 'Mathias', 'Omar', 'Jakob'];
const pick = a => a[Math.random() * a.length | 0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const input = { gas: 0, brake: 0, left: 0, right: 0, drift: 0, nos: 0, horn: 0 };
let state = 'menu', G = null, T = 0, W = 1, H = 1, DPR = 1;
let look = { lack: 0, neon: 0 };

function farIntersection(from, min) {
  for (let k = 0; k < 50; k++) {
    const i = Math.random() * World.NX | 0, j = Math.random() * World.NY | 0;
    const p = { x: World.VX[i], y: World.HY[j], i, j };
    if (!from || dist(p, from) > min) return p;
  }
  return { x: World.VX[0], y: World.HY[0], i: 0, j: 0 };
}

function spawnChain() {
  for (;;) {
    const c = World.randomRoadPoint();
    if (!G || !G.p || dist(c, G.p) > 300) return { x: c.x, y: c.y, ph: Math.random() * 6 };
  }
}

function newGame() {
  const p = new Car(World.VX[3] + 60, World.HY[3] + World.LANE, 0, LACK[look.lack][1], 'player');
  G = { p, time: 0, score: 0, combo: 1, comboT: 0, prikker: 0, wanted: 0, lastSeen: 0, seenCD: 0, bust: 0, nos: 0.6,
    chains: [], traffic: [], police: [], skids: [], parts: [], pops: [], drift: 0, driftT: 0, drifting: false,
    mission: null, nextMission: 2, hornHeld: false, boosting: false, shake: 0, rw: null,
    cam: { x: p.x, y: p.y, z: 1 }, stats: { chains: 0, kompis: 0, drift: 0, escapes: 0, busts: 0 } };
  for (let k = 0; k < 14; k++) G.chains.push(spawnChain());
  while (G.traffic.length < 26) {
    const s = farIntersection(p, 250);
    const ds = [0, 1, 2, 3].filter(d => { const ni = s.i + DIRS[d][0], nj = s.j + DIRS[d][1]; return ni >= 0 && ni < World.NX && nj >= 0 && nj < World.NY; });
    G.traffic.push(new Traffic(s.i, s.j, pick(ds)));
  }
  for (let k = 0; k < 5; k++) { const s = farIntersection(p, 1000); G.police.push(new Police(s.x, s.y)); }
  World.HOT.forEach(h => { h.cool = 0; h.cheer = 0; });
  World.CAMS.forEach(c => { c.cool = 0; c.flash = 0; });
}

// ---------- Hendelser ----------
function msg(html) {
  const m = $('msg');
  m.innerHTML = html; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
}
const pop = (x, y, text, color) => G.pops.push({ x, y, text, color, life: 1.4 });
function part(x, y, vx, vy, life, size, color, grow = 0) {
  if (G.parts.length < 450) G.parts.push({ x, y, vx, vy, life, max: life, size, color, grow });
}
function burst(x, y, n, color, sp, life, size) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random());
    part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.5), size, color);
  }
}

function respekt(base, label, x, y, color = '#f5c542') {
  const pts = Math.round(base * G.combo);
  G.score += pts; G.comboT = 4.5; G.combo = Math.min(5, G.combo + 1);
  pop(x, y, `+${pts} ${label}`, color);
  return pts;
}

function raiseWanted(reason) {
  G.lastSeen = 0; G.seenCD = 4;
  if (G.wanted >= 3) return;
  G.wanted++;
  msg(`<span style="color:#5b9bff">BLÅLYS!</span><small>${reason}</small>`);
}

function crash(v) {
  const p = G.p;
  Sfx.crash(Math.min(1, v / 500));
  G.shake = Math.min(14, v / 30);
  burst(p.x + Math.cos(p.a) * 20, p.y + Math.sin(p.a) * 20, 10, '#ffd36b', 220, 0.4, 2.5);
  if (G.drift > 8) pop(p.x, p.y - 30, 'Drift ødelagt', '#ff6b6b');
  G.drift = 0; G.driftT = 0; G.combo = 1; G.comboT = 0;
}

function honk() {
  const p = G.p;
  Sfx.horn();
  for (const h of World.HOT) {
    if (h.cool > 0 || dist(h, p) > 170 || p.speed > 260) continue;
    h.cool = 20; h.cheer = 2.5;
    respekt(150, 'SJOFE!', h.x, h.y - 30, h.col);
    msg(`${pick(['Sjofe den bilen!', 'Respekt, bror!', 'Wolla, for en lyd!', 'Rått anlegg!'])}<small>Folka på ${h.name} digger deg</small>`);
  }
  if (G.seenCD <= 0 && G.police.some(c => c.los && dist(c, p) < 260)) raiseWanted('Tuta på politiet? Seriøst?');
}

function busted() {
  const p = G.p, loss = Math.round(G.score * 0.2);
  G.prikker += 3; G.score -= loss; G.stats.busts++;
  G.wanted = 0; G.bust = 0; G.combo = 1; G.drift = 0;
  Sfx.bad();
  msg(`TATT!<small>+3 prikker · −${loss.toLocaleString('nb-NO')} respekt</small>`);
  if (G.prikker >= MAX_PRIKKER) return gameOver('lappen');
  const s = farIntersection(p, 1200);
  Object.assign(p, { x: s.x + 50, y: s.y + World.LANE, vx: 0, vy: 0, a: 0, drawA: 0 });
  G.rw = null;
  for (const c of G.police) if (dist(c, p) < 900) { const q = farIntersection(p, 1100); Object.assign(c, { x: q.x, y: q.y, vx: 0, vy: 0, pt: null }); }
}

function escapeCops() {
  const lvl = G.wanted;
  G.wanted = 0; G.stats.escapes++;
  const pts = respekt(250 * lvl, 'RISTA AV PURKEN', G.p.x, G.p.y - 40, '#7dff6b');
  msg(`Rista av purken!<small>+${pts} respekt · wolla, de så deg aldri</small>`);
  Sfx.good();
}

// ---------- Oppdatering ----------
function updateMission(dt, p) {
  const m = G.mission;
  if (!m) {
    if ((G.nextMission -= dt) > 0) return;
    G.mission = { stage: 'pickup', at: pick(World.HOT.filter(h => dist(h, p) > 700)), name: pick(NAMES) };
    return;
  }
  if (m.stage === 'pickup') {
    if (dist(m.at, p) < 80 && p.speed < 110) {
      m.to = pick(World.HOT.filter(h => h !== m.at && dist(h, m.at) > 1400));
      m.stage = 'drop';
      m.t = (Math.abs(m.to.x - p.x) + Math.abs(m.to.y - p.y)) / 230 + 12;
      m.at.cheer = 1.5;
      msg(`${m.name} hoppa inn!<small>«Kjør meg til ${m.to.name}, bror!»</small>`);
      Sfx.good();
    }
  } else if (dist(m.to, p) < 90 && p.speed < 140) {
    respekt(400 + Math.round(m.t * 12), 'LEVERT', m.to.x, m.to.y - 30, '#7dff6b');
    G.stats.kompis++; m.to.cheer = 2;
    msg(`Levert!<small>${m.name}: ${pick(['«Respekt, mann!»', '«Wolla, det gikk fort!»', '«Du er rå, bror.»'])}</small>`);
    G.mission = null; G.nextMission = 2.5;
    Sfx.good();
  } else if ((m.t -= dt) <= 0) {
    msg(`For treigt!<small>${m.name} gikk av og tok T-banen</small>`);
    G.mission = null; G.nextMission = 3;
    Sfx.bad();
  }
}

function updateAmbient(dt) {
  const all = [...G.traffic, ...G.police, G.p];
  for (const c of G.traffic) c.update(dt, all);
  for (const c of G.police) { c.think(dt, G.p, state === 'play' ? G.wanted : 0); c.physics(dt, c.siren ? chaseP(G.wanted) : PATROL_P); }
  for (let a = 0; a < G.police.length; a++) for (let b = a + 1; b < G.police.length; b++) {
    const A = G.police[a], Bc = G.police[b], h = carHit(A, Bc);
    if (h) { A.x += h[0] * h[2] / 2; A.y += h[1] * h[2] / 2; Bc.x -= h[0] * h[2] / 2; Bc.y -= h[1] * h[2] / 2; }
  }
}

function update(dt) {
  const p = G.p;
  G.time += dt;
  if (G.time >= NIGHT) return gameOver('time');

  p.throttle = input.gas; p.brake = input.brake; p.steer = input.right - input.left; p.hand = !!input.drift;
  p.boost = !!(input.nos && input.gas) && G.nos > 0.02;
  if (p.boost) { G.nos = Math.max(0, G.nos - dt * 0.33); if (!G.boosting) Sfx.nos(); }
  G.boosting = p.boost;
  G.nos = Math.min(1, G.nos + dt * 0.015);
  const impact = p.physics(dt, PLAYER_P);
  if (impact > 140) crash(impact);
  if (input.horn && !G.hornHeld) honk();
  G.hornHeld = !!input.horn;

  // Drift: poeng samles mens du sklir og bankes når du tar grepet igjen
  G.drifting = Math.abs(p.lat) > 90 && p.speed > 160;
  if (G.drifting) {
    G.drift += Math.abs(p.lat) * dt * 0.12; G.driftT = 0.45;
    G.nos = Math.min(1, G.nos + dt * 0.12);
  } else if (G.driftT > 0 && (G.driftT -= dt) <= 0) {
    if (G.drift > 8) G.stats.drift += respekt(G.drift, 'DRIFT', p.x, p.y - 30, '#ff3fa4');
    G.drift = 0;
  }
  // Bremsespor og røyk fra bakhjulene
  const ca = Math.cos(p.a), sa = Math.sin(p.a);
  const rw = [[p.x - ca * 15 - sa * 9, p.y - sa * 15 + ca * 9], [p.x - ca * 15 + sa * 9, p.y - sa * 15 - ca * 9]];
  const skid = G.drifting || (p.brake && p.fwd > 220) || (p.hand && p.speed > 120);
  if (skid && G.rw) {
    for (let k = 0; k < 2; k++) G.skids.push([G.rw[k][0], G.rw[k][1], rw[k][0], rw[k][1]]);
    if (G.skids.length > 1400) G.skids.splice(0, G.skids.length - 1400);
    const w = rw[Math.random() < 0.5 ? 0 : 1];
    if (Math.random() < 0.6) part(w[0], w[1], (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.9, 6, 'rgba(190,190,200,0.3)', 26);
  }
  G.rw = rw;
  if (p.boost) part(p.x - ca * 26, p.y - sa * 26, -ca * 200 + (Math.random() - 0.5) * 60, -sa * 200 + (Math.random() - 0.5) * 60, 0.18, 5, Math.random() < 0.5 ? '#ffb347' : '#ffe08a');
  if (G.comboT > 0 && (G.comboT -= dt) <= 0) G.combo = 1;

  // Trafikk: kollisjon og nesten-treff
  updateAmbient(dt);
  for (const c of G.traffic) {
    if (c.miss > 0) c.miss -= dt;
    const h = carHit(p, c);
    if (h) {
      p.push(h[0], h[1], h[2]);
      if (p.speed > 110 && c.stun <= 0) { crash(p.speed * 0.8); c.stun = 1.6; Sfx.horn(); }
    } else if (p.speed > 300 && c.miss <= 0 && dist(c, p) < 56) {
      c.miss = 3; respekt(25, 'NESTEN!', c.x, c.y - 20, '#38d9ff');
    }
  }

  // Politiet
  let seen = false;
  for (const c of G.police) {
    if (c.los && dist(c, p) < 700) seen = true;
    const h = carHit(p, c);
    if (!h) continue;
    const [nx, ny, pen] = h;
    p.x += nx * pen / 2; p.y += ny * pen / 2; c.x -= nx * pen / 2; c.y -= ny * pen / 2;
    const rv = (p.vx - c.vx) * nx + (p.vy - c.vy) * ny, own = p.vx * nx + p.vy * ny;
    if (rv < 0) { p.vx -= rv * nx * 0.9; p.vy -= rv * ny * 0.9; c.vx += rv * nx * 0.9; c.vy += rv * ny * 0.9; }
    if (-rv > 120) crash(-rv);
    if (input.gas && own < -150 && G.seenCD <= 0) raiseWanted('Du rammet en politibil!');
  }
  G.seenCD -= dt;
  if (seen) {
    G.lastSeen = 0;
    if (G.seenCD <= 0 && p.speed * KMH > 105) raiseWanted('Råkjøring rett foran purken!');
    else if (G.seenCD <= 0 && G.drifting) raiseWanted('Drifting rett foran purken!');
  } else if (G.wanted > 0 && (G.lastSeen += dt) > 6 + G.wanted * 3) escapeCops();
  if (G.wanted > 0) {
    const close = G.police.some(c => dist(c, p) < 115);
    G.bust = close && Math.abs(p.fwd) < 90 ? G.bust + dt : Math.max(0, G.bust - dt * 0.6);
    if (G.bust > 1.6) return busted();
  } else G.bust = 0;

  // Fotobokser
  for (const c of World.CAMS) {
    if (c.flash > 0) c.flash -= dt * 3;
    if (c.cool > 0) { c.cool -= dt; continue; }
    const kmh = Math.round(p.speed * KMH);
    if (Math.hypot(c.x - p.x, c.y - p.y) < 100 && kmh > 80) {
      c.cool = 5; c.flash = 1; G.prikker++; Sfx.flash();
      msg(`BLITZ!<small>Fotoboks: ${kmh} km/t i 50-sone · +1 prikk</small>`);
      if (G.prikker >= MAX_PRIKKER) return gameOver('lappen');
    }
  }

  // Gullkjeder og hotspots
  for (const ch of G.chains) {
    if (dist(ch, p) > 34) continue;
    respekt(100, 'GULLKJEDE', ch.x, ch.y);
    G.stats.chains++; G.nos = Math.min(1, G.nos + 0.2);
    Sfx.chain(); burst(ch.x, ch.y, 14, '#f5c542', 140, 0.6, 2.5);
    Object.assign(ch, spawnChain());
  }
  for (const h of World.HOT) {
    if (h.cool > 0) h.cool -= dt;
    if (h.cheer > 0) h.cheer -= dt;
    if (G.drifting && h.cool <= 0 && dist(h, p) < 200) {
      h.cool = 20; h.cheer = 2.5;
      respekt(200, 'DRIFTSHOW', h.x, h.y - 30, h.col);
    }
  }
  updateMission(dt, p);

  for (const q of G.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; q.size += q.grow * dt; }
  G.parts = G.parts.filter(q => q.life > 0);
  for (const q of G.pops) { q.y -= 34 * dt; q.life -= dt; }
  G.pops = G.pops.filter(q => q.life > 0);

  const cam = G.cam;
  cam.x += (p.x + p.vx * 0.35 - cam.x) * Math.min(1, dt * 4);
  cam.y += (p.y + p.vy * 0.35 - cam.y) * Math.min(1, dt * 4);
  const tz = baseZoom() * (1 - 0.2 * clamp(p.speed / 650, 0, 1));
  cam.z += (tz - cam.z) * Math.min(1, dt * 2);
  G.shake = Math.max(0, G.shake - dt * 30);
}
const baseZoom = () => clamp(Math.min(W, H * 1.5) / 1150, 0.5, 1.15);

// Menyen: byen lever i bakgrunnen mens kameraet glir over Oslo
function attract(dt) {
  updateAmbient(dt);
  G.cam.x = 2300 + Math.cos(T * 0.05) * 1500;
  G.cam.y = 1450 + Math.sin(T * 0.07) * 900;
  G.cam.z = baseZoom() * 0.85;
  for (const c of World.CAMS) if (c.flash > 0) c.flash -= dt * 3;
}

// ---------- Tegning ----------
function objective() {
  const m = G && G.mission;
  return !m ? null : m.stage === 'pickup' ? { x: m.at.x, y: m.at.y, col: '#3ee68a' } : { x: m.to.x, y: m.to.y, col: '#ff3fa4' };
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cam = G.cam, z = cam.z, p = G.p, play = state === 'play' || state === 'pause';
  ctx.translate(W / 2 + (Math.random() - 0.5) * G.shake, H / 2 + (Math.random() - 0.5) * G.shake);
  ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
  const v = { x0: cam.x - W / 2 / z, y0: cam.y - H / 2 / z, x1: cam.x + W / 2 / z, y1: cam.y + H / 2 / z };
  const inV = (o, m = 60) => o.x > v.x0 - m && o.x < v.x1 + m && o.y > v.y0 - m && o.y < v.y1 + m;
  World.drawGround(ctx, v, T);

  ctx.strokeStyle = 'rgba(8,8,10,0.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
  for (const s of G.skids) if (s[2] > v.x0 && s[2] < v.x1 && s[3] > v.y0 && s[3] < v.y1) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  ctx.stroke();

  for (const ch of G.chains) {
    if (!inV(ch)) continue;
    const b = Math.sin(T * 4 + ch.ph) * 3;
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(ch.x, ch.y + b, 12, 8, Math.sin(T * 2 + ch.ph) * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffe08a'; World.dot(ctx, ch.x, ch.y + b + 9, 4);
  }
  const ob = play && objective();
  if (ob && inV(ob, 100)) {
    ctx.strokeStyle = ob.col; ctx.lineWidth = 4; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(ob.x, ob.y, 52 + Math.sin(T * 5) * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (G.mission.stage === 'pickup') {
      ctx.fillStyle = '#3ee68a'; World.dot(ctx, ob.x, ob.y, 8); ctx.fillStyle = '#141414'; World.dot(ctx, ob.x, ob.y, 4);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', ob.x, ob.y - 18 - Math.abs(Math.sin(T * 4)) * 6);
    }
  }

  for (const c of G.traffic) if (inV(c)) drawCar(ctx, c, T);
  for (const c of G.police) if (inV(c)) drawCar(ctx, c, T);
  if (play) {
    const neon = NEON[look.neon][1];
    if (neon) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(p.drawA); ctx.scale(1.5, 0.85);
      World.drawGlow(ctx, neon, 34, 0, 0, 1 + Math.sin(T * 6) * 0.06); ctx.restore();
    }
    drawCar(ctx, p, T, { rims: true, kidney: true });
  }
  World.drawTop(ctx, v, T);

  for (const q of G.parts) {
    if (!inV(q)) continue;
    ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.color; World.dot(ctx, q.x, q.y, q.size);
  }
  ctx.globalAlpha = 1;

  // Lys: gatelys, neon, frontlys, blålys
  ctx.globalCompositeOperation = 'lighter';
  World.drawLights(ctx, v);
  for (const c of G.traffic) if (inV(c, 200)) carLights(ctx, c, T);
  for (const c of G.police) if (inV(c, 200)) carLights(ctx, c, T);
  if (play) carLights(ctx, p, T);
  for (const ch of G.chains) if (inV(ch)) World.drawGlow(ctx, 'rgba(245,197,66,0.4)', 40, ch.x, ch.y);
  if (ob && inV(ob, 100)) World.drawGlow(ctx, ob.col === '#3ee68a' ? 'rgba(62,230,138,0.35)' : 'rgba(255,63,164,0.35)', 90, ob.x, ob.y);
  ctx.globalCompositeOperation = 'source-over';

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 20px system-ui, sans-serif';
  for (const q of G.pops) {
    ctx.globalAlpha = Math.min(1, q.life * 1.5);
    ctx.fillStyle = '#000'; ctx.fillText(q.text, q.x + 2, q.y + 2);
    ctx.fillStyle = q.color; ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;
  if (play && G.drift > 8) {
    ctx.fillStyle = '#ff3fa4'; ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillText(`DRIFT ${Math.round(G.drift)}`, p.x, p.y - 44);
  }

  // Pil mot målet når det er utenfor skjermen
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (ob && !inV(ob, -40)) {
    const sx = (ob.x - cam.x) * z, sy = (ob.y - cam.y) * z, a = Math.atan2(sy, sx);
    const k = Math.min((W / 2 - 50) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 80) / Math.abs(Math.sin(a) || 1e-6));
    const ax = W / 2 + Math.cos(a) * k, ay = H / 2 + Math.sin(a) * k;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = ob.col; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.round(dist(ob, p) * 0.5) + ' m', ax - Math.cos(a) * 30, ay - Math.sin(a) * 30);
  }
}
