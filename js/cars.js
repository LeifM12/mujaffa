'use strict';
// Biler sett fra siden: BMW-en din, trafikk, taxi, buss og politi – tegning og enkel fil-AI.
const KMH = 0.3;
const TYPES = {
  bmw: { L: 172, belt: 38, roof: 64, rx0: -30, rx1: 14, ws: 44, rw: -58, wx: [-54, 56], wr: 17, hood: 33 },
  sedan: { L: 160, belt: 38, roof: 62, rx0: -28, rx1: 12, ws: 40, rw: -54, wx: [-50, 52], wr: 15, hood: 32 },
  hatch: { L: 138, belt: 40, roof: 66, rx0: -50, rx1: 8, ws: 34, rw: -62, wx: [-42, 44], wr: 15, hood: 34 },
  tesla: { L: 168, belt: 36, roof: 60, rx0: -36, rx1: 6, ws: 46, rw: -66, wx: [-54, 54], wr: 16, hood: 30 },
  wagon: { L: 178, belt: 40, roof: 66, rx0: -80, rx1: 12, ws: 44, rw: -86, wx: [-56, 58], wr: 16, hood: 34 },
  bus: { L: 380, bus: true, wx: [-130, 120], wr: 20, belt: 60, hood: 60, roof: 118, rx0: 0 }
};
const TRAFFIC_COLORS = ['#8b93a1', '#c7ccd4', '#2f3542', '#6b2c2c', '#2c4a6b', '#e8e8ea', '#4a5a3a', '#7a6a50', '#1f2937', '#9b2c2c', '#2f6f6a'];
const laneIdx = y => y < (LANES[0] + LANES[1]) / 2 ? 0 : y < (LANES[1] + LANES[2]) / 2 ? 1 : 2;
const carLen = c => TYPES[c.type].L * laneScale(c.y);

function makeTraffic(x, lane, police) {
  const r = Math.random();
  const type = police ? 'wagon' : r < 0.06 && lane < 2 ? 'bus' : r < 0.28 ? 'tesla' : r < 0.5 ? 'hatch' : 'sedan';
  const taxi = !police && type === 'sedan' && Math.random() < 0.2;
  const color = police ? '#eef1f5' : taxi ? '#15171c' : type === 'tesla' ? (Math.random() < 0.6 ? '#f1f1f3' : '#c21f2f')
    : TRAFFIC_COLORS[Math.random() * TRAFFIC_COLORS.length | 0];
  const cruise = type === 'bus' ? 150 + Math.random() * 40 : police ? 220 + Math.random() * 40 : 160 + Math.random() * 170;
  return { x, y: LANES[lane], lane, type, color, cruise, v: cruise, kind: police ? 'police' : taxi ? 'taxi' : 'car',
    stun: 0, blockT: 0, laneT: 0, wheelA: 0, siren: false, chase: false, chaseV: 0, miss: 0, brake: false, driver: true };
}

function laneFree(c, lane, all, margin = 60) {
  const len = carLen(c);
  return all.every(o => o === c || Math.abs(o.y - LANES[lane]) > 30 || Math.abs(o.x - c.x) > (len + carLen(o)) / 2 + margin);
}
function tryLane(c, all, prefer) {
  const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l <= 2 && !(c.type === 'bus' && l === 2));
  if (prefer !== undefined) opts.sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer));
  else if (Math.random() < 0.5) opts.reverse();
  for (const l of opts) if (laneFree(c, l, all)) { c.lane = l; return true; }
  return false;
}

// Trafikken holder avstand til bilen foran (også deg), og bytter fil når noen sperrer
function updateTraffic(dt, list, player) {
  const all = [...list, player];
  for (const c of list) {
    const len = carLen(c);
    let ahead = null, gap = 1e9;
    for (const o of all) {
      if (o === c || Math.abs(o.y - c.y) > 30 || o.x <= c.x) continue;
      const g = o.x - c.x - (len + carLen(o)) / 2;
      if (g < gap) { gap = g; ahead = o; }
    }
    let target = c.chase ? c.chaseV : c.cruise;
    if (c.stun > 0) { c.stun -= dt; target = 0; }
    if (ahead && gap < 150 && !(c.chase && ahead === player && gap > 6)) target = Math.min(target, Math.max(0, ahead.v - (gap < 40 ? 80 : 0)));
    c.brake = target < c.v - 20;
    c.v = Math.max(0, c.v + clamp(target - c.v, -700 * dt, (c.chase ? 320 : 180) * dt));
    c.x += c.v * dt;
    c.wheelA += c.v * dt / TYPES[c.type].wr;
    if (ahead && ahead !== player && gap < 170 && ahead.v < (c.chase ? c.chaseV : c.cruise) - 30) {
      if ((c.blockT += dt) > (c.chase ? 0.4 : 1.2)) { tryLane(c, all, c.chase ? laneIdx(player.y) : undefined); c.blockT = 0; }
    } else c.blockT = 0;
    c.y += (LANES[c.lane] - c.y) * Math.min(1, dt * 5);
  }
}

// Politiet i jakt: legger seg i din fil, tar deg igjen bakfra eller bremser foran deg for å sperre
function policeChase(c, p, dt, all, wanted) {
  c.chase = true; c.siren = true;
  const dx = p.x - c.x, pl = laneIdx(p.y);
  if (c.lane !== pl && (c.laneT -= dt) <= 0) { c.laneT = 0.45; tryLane(c, all, pl); }
  c.chaseV = dx > 0 ? Math.min(475 + 25 * wanted, p.v + 140 + dx * 0.4) : Math.max(0, p.v - 70);
}

// ---------- Tegning ----------
function drawWheel(ctx, x, r, a, rim) {
  ctx.fillStyle = '#0b0b0d'; dot(ctx, x, -r, r);
  ctx.fillStyle = rim; dot(ctx, x, -r, r * 0.62);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let k = 0; k < 5; k++) { const q = a + k * Math.PI * 0.4; ctx.moveTo(x, -r); ctx.lineTo(x + Math.cos(q) * r * 0.58, -r + Math.sin(q) * r * 0.58); }
  ctx.stroke();
  ctx.fillStyle = '#2a2d33'; dot(ctx, x, -r, r * 0.16);
}

function drawBus(ctx, c, T, t) {
  const hl = T.L / 2;
  ctx.fillStyle = '#c8102e'; rrect(ctx, -hl, -118, T.L, 108, 10); ctx.fill();
  ctx.fillStyle = '#0d1520'; ctx.fillRect(-hl + 14, -100, T.L - 60, 36);
  ctx.fillStyle = '#c8102e'; for (let x = -hl + 60; x < hl - 50; x += 56) ctx.fillRect(x, -100, 5, 36);
  ctx.fillStyle = '#0d1520'; ctx.fillRect(hl - 40, -108, 34, 60);
  ctx.fillStyle = '#ffb000'; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('20 GALGEBERG', hl - 90, -110);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(hl - 100, -60, 40, 50);
  for (const x of T.wx) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; dot(ctx, x, -T.wr + 2, T.wr + 4); drawWheel(ctx, x, T.wr, c.wheelA, '#8d949e'); }
}

function drawSideCar(ctx, c, X, t) {
  const T = TYPES[c.type], s = laneScale(c.y), hl = T.L / 2;
  ctx.save(); ctx.translate(X, c.y + (c.rock || 0)); ctx.scale(s, s);
  if (c.tilt) ctx.rotate(c.tilt);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 1, hl + 6, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (T.bus) { drawBus(ctx, c, T, t); ctx.restore(); return; }
  const glassPath = () => {
    ctx.beginPath(); ctx.moveTo(T.rw + 8, -T.belt - 2); ctx.lineTo(T.rx0 + 5, -T.roof + 5); ctx.lineTo(T.rx1 - 2, -T.roof + 5); ctx.lineTo(T.ws - 8, -T.belt - 2); ctx.closePath();
  };
  for (const x of T.wx) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; dot(ctx, x, -T.wr + 2, T.wr + 4); }
  ctx.fillStyle = c.color; ctx.beginPath();
  ctx.moveTo(-hl, -12); ctx.lineTo(-hl, -T.belt + 6); ctx.quadraticCurveTo(-hl, -T.belt, -hl + 8, -T.belt);
  ctx.lineTo(T.rw, -T.belt); ctx.lineTo(T.rx0, -T.roof); ctx.lineTo(T.rx1, -T.roof); ctx.lineTo(T.ws, -T.belt);
  ctx.lineTo(hl - 12, -T.hood); ctx.quadraticCurveTo(hl, -T.hood + 1, hl, -T.hood + 10); ctx.lineTo(hl, -12);
  ctx.quadraticCurveTo(hl, -6, hl - 6, -6); ctx.lineTo(-hl + 6, -6); ctx.quadraticCurveTo(-hl, -6, -hl, -12); ctx.fill();
  // Hjulbuer skjærer inn i karosseriet
  for (const x of T.wx) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, -T.wr + 1, T.wr + 4, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-hl + 8, -T.belt + 2, T.L - 22, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-hl + 4, -T.belt + 15, T.L - 10, 2);
  ctx.fillRect((T.rx0 + T.rx1) / 2 - 3, -T.belt, 2, T.belt - 10); ctx.fillRect(T.ws - 6, -T.belt, 2, T.belt - 12);
  ctx.fillRect((T.rx0 + T.rx1) / 2 + 8, -T.belt + 8, 10, 3); ctx.fillRect(T.ws - 22, -T.belt + 8, 10, 3);
  // Glass, folk inni og dugg
  glassPath(); ctx.fillStyle = '#0d1520'; ctx.fill();
  if (c.driver) {
    const dx = T.ws - 24, dy = -T.belt - 14;
    ctx.fillStyle = 'rgba(30,34,44,0.95)'; dot(ctx, dx, dy, 7.5); ctx.fillRect(dx - 8, dy + 5, 16, 8);
    if (c.kind === 'player') { ctx.fillStyle = '#111'; ctx.fillRect(dx - 8, dy - 8, 15, 5); ctx.fillRect(dx + 4, dy - 5, 7, 2); ctx.fillStyle = '#3a4250'; ctx.fillRect(dx + 1, dy - 2, 7, 3); }
  }
  if (c.passenger) {
    const px = T.ws - 38, py = -T.belt - 13, q = c.passenger;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = q.hair; ctx.fillRect(px - 8, py - 6, 16, 18);
    ctx.fillStyle = q.skin; dot(ctx, px, py, 7);
    ctx.fillStyle = q.hair; ctx.beginPath(); ctx.arc(px, py - 1.5, 7.6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = q.top; ctx.fillRect(px - 8, py + 6, 16, 8);
    ctx.globalAlpha = 1;
  }
  if (c.fog > 0) { glassPath(); ctx.fillStyle = `rgba(228,234,242,${0.88 * c.fog})`; ctx.fill(); }
  ctx.save(); glassPath(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath(); ctx.moveTo(T.rx0 + 4, -T.belt); ctx.lineTo(T.rx0 + 22, -T.roof); ctx.lineTo(T.rx0 + 34, -T.roof); ctx.lineTo(T.rx0 + 16, -T.belt); ctx.fill(); ctx.restore();
  ctx.fillStyle = c.color; ctx.fillRect((T.rx0 + T.rx1) / 2 - 3, -T.roof + 3, 5, T.roof - T.belt - 3);
  // Lys, eksos, spoiler og påbygg
  ctx.fillStyle = '#fff6d0'; ctx.fillRect(hl - 7, -T.hood + 4, 7, 5);
  ctx.fillStyle = c.brake ? '#ff3030' : '#a01818'; ctx.fillRect(-hl, -T.belt + 4, 4, 8);
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(-hl - 3, -12, 8, 4);
  if (c.kind === 'player') { ctx.fillStyle = c.color; ctx.fillRect(-hl + 4, -T.belt - 7, 26, 4); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-hl + 8, -T.belt - 3, 3, 4); ctx.fillRect(-hl + 24, -T.belt - 3, 3, 4); }
  if (c.kind === 'police') {
    for (let x = -hl + 10, k = 0; x < hl - 18; x += 8, k++) {
      ctx.fillStyle = k % 2 ? '#f5d90a' : '#1d3fae'; ctx.fillRect(x, -T.belt + 6, 8, 6);
      ctx.fillStyle = k % 2 ? '#1d3fae' : '#f5d90a'; ctx.fillRect(x, -T.belt + 12, 8, 6);
    }
    ctx.fillStyle = '#1d3fae'; ctx.font = '900 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('POLITI', (T.rx0 + T.ws) / 2 + 6, -T.belt + 29);
    const on = Math.floor(t * 8) % 2;
    ctx.fillStyle = c.siren && on ? '#5b9bff' : '#1e3a8a'; ctx.fillRect(T.rx0 + 10, -T.roof - 7, 17, 7);
    ctx.fillStyle = c.siren && !on ? '#5b9bff' : '#1e3a8a'; ctx.fillRect(T.rx0 + 27, -T.roof - 7, 17, 7);
  }
  if (c.kind === 'taxi') {
    ctx.fillStyle = '#ffd23f'; ctx.fillRect((T.rx0 + T.rx1) / 2 - 14, -T.roof - 10, 28, 10);
    ctx.fillStyle = '#111'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', (T.rx0 + T.rx1) / 2, -T.roof - 5);
  }
  for (const x of T.wx) drawWheel(ctx, x, T.wr, c.wheelA, c.rims || '#aab2bd');
  ctx.restore();
}

const BEAM = (() => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 90;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 320, 0);
  gr.addColorStop(0, 'rgba(255,240,200,0.36)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 40); g.lineTo(320, 0); g.lineTo(320, 90); g.lineTo(0, 50); g.closePath(); g.fill();
  return c;
})();

function carLights(ctx, c, X, t, neon) {
  const T = TYPES[c.type], s = laneScale(c.y), hl = T.L / 2 * s, y = c.y + (c.rock || 0);
  const hy = y - (T.hood - 6) * s;
  ctx.drawImage(BEAM, X + hl - 4, hy - 45 * s, 320 * s, 90 * s);
  drawGlow(ctx, c.brake ? 'rgba(255,40,40,0.6)' : 'rgba(255,40,40,0.28)', 22, X - hl, y - (T.belt - 8) * s);
  if (c.kind === 'police' && c.siren) {
    const on = Math.floor(t * 8) % 2;
    drawGlow(ctx, 'rgba(60,120,255,0.8)', 90, X + (T.rx0 + (on ? 18 : 36)) * s, y - (T.roof + 4) * s);
  }
  if (neon) drawGlow(ctx, neon, 60, X, y - 2, hl / 60 * 1.15, 0.28);
}
