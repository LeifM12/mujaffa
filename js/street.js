'use strict';
// Gata sett fra siden: skyline, bygårder, butikker, fotobokser, fortau og folk – generert bit for bit.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const VH = 600;                    // logisk høyde på scenen
const BASE_Y = 330;                // der husene møter fortauet
const WALK_Y = 368;                // føttene til folk på fortauet
const ROAD_Y0 = 386, ROAD_Y1 = 566;
const LANES = [436, 492, 548];     // bakkekontakt for bilene, bakerste fil først
const CHUNK = 1200, DIST_LEN = 3600, LAMP_GAP = 320;
const DISTRICTS = ['Majorstuen', 'Bogstadveien', 'Bislett', 'St. Hanshaugen', 'Sentrum', 'Karl Johan',
  'Oslo S', 'Grønland', 'Tøyen', 'Grünerløkka', 'Bjørvika', 'Aker Brygge'];
const district = x => DISTRICTS[Math.floor(Math.max(0, x) / DIST_LEN) % DISTRICTS.length];
const laneScale = y => 0.86 + clamp((y - LANES[0]) / (LANES[2] - LANES[0]), 0, 1) * 0.14;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const glowCache = {};
function drawGlow(ctx, color, r, x, y, sx = 1, sy = sx) {
  const key = color + r;
  let c = glowCache[key];
  if (!c) {
    c = glowCache[key] = document.createElement('canvas');
    c.width = c.height = r * 2;
    const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  }
  ctx.drawImage(c, x - r * sx, y - r * sy, r * 2 * sx, r * 2 * sy);
}

const Street = (() => {
  const FACADES = ['#6b4f3a', '#7a5c48', '#5c6670', '#4f5d4a', '#7b6a4c', '#6e4a4a', '#55607a', '#6a5f73', '#837560'];
  const SIGNS = [['KEBAB', '#ff3fa4'], ['PIZZA', '#7dff6b'], ['GRILL', '#ff5b5b'], ['KIOSK', '#38d9ff'], ['FRISØR', '#c77dff'],
    ['SUSHI', '#ffb347'], ['BAR', '#ff3fa4'], ['24/7', '#38d9ff'], ['BAKERI', '#ffd23f'], ['CAFÉ', '#c77dff'],
    ['BURGER', '#ffd23f'], ['PUB', '#ffb347'], ['NEGLER', '#ff7ad9']];
  const cache = new Map();

  // Én bit av gata: bygårder (hver tredje bit har butikken) og kanskje en fotoboks
  function chunk(c) {
    let ch = cache.get(c);
    if (ch) return ch;
    const r = rng(c * 9973 + 17), x0 = c * CHUNK, x1 = x0 + CHUNK, shopX = c % 3 === 1 ? x0 + 380 : -1;
    const bs = [];
    for (let x = x0; x < x1;) {
      let w = 170 + (r() * 150 | 0);
      const shop = shopX >= 0 && x + w > shopX && !bs.some(b => b.shop);
      if (shop) w = 300;
      w = Math.min(w, x1 - x);
      const sign = !shop && r() < 0.7 ? SIGNS[r() * SIGNS.length | 0] : null;
      bs.push({ x, w, h: 190 + (r() * 110 | 0), c: FACADES[r() * FACADES.length | 0], sign, shop, lit: 0.25 + r() * 0.4, seed: r() * 1000, door: 0.2 + r() * 0.6 });
      x += w;
    }
    ch = { bs, cam: c % 4 === 2 ? x0 + 700 : null };
    cache.set(c, ch);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return ch;
  }
  const chunksIn = (xa, xb, fn) => { for (let c = Math.max(0, Math.floor(xa / CHUNK)); c * CHUNK < xb; c++) fn(chunk(c)); };

  function shopAt(x) {
    let hit = null;
    chunksIn(x - CHUNK, x + CHUNK, ch => { const b = ch.bs.find(b => b.shop); if (b && x > b.x + 20 && x < b.x + b.w - 20) hit = b; });
    return hit;
  }
  function camsIn(xa, xb) {
    const out = [];
    chunksIn(xa, xb, ch => { if (ch.cam !== null && ch.cam >= xa && ch.cam < xb) out.push(ch.cam); });
    return out;
  }

  // ---------- Bakgrunn ----------
  function drawSky(ctx, vw, camX, t) {
    const g = ctx.createLinearGradient(0, 0, 0, BASE_Y);
    g.addColorStop(0, '#060714'); g.addColorStop(0.7, '#1d1035'); g.addColorStop(1, '#3d1a48');
    ctx.fillStyle = g; ctx.fillRect(0, -600, vw, BASE_Y + 600);
    for (let k = 0; k < 80; k++) {
      const sx = ((hash(k, 1) * vw * 2 - camX * 0.01) % vw + vw) % vw, sy = hash(k, 2) * 240 - 40;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + k); ctx.fillStyle = '#fff'; ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    drawGlow(ctx, 'rgba(255,240,200,0.25)', 90, vw * 0.82, 70);
    ctx.fillStyle = '#f4eed8'; dot(ctx, vw * 0.82, 70, 24);
    ctx.fillStyle = 'rgba(200,190,160,0.5)'; dot(ctx, vw * 0.82 - 8, 64, 5); dot(ctx, vw * 0.82 + 7, 78, 4);
  }

  // Oslo-skyline langt bak: Holmenkollen, Rådhuset, Plaza, Barcode, Postgirobygget og et kirkespir
  const SKY = [[880, 52, 170], [960, 52, 170], [905, 110, 100], [1300, 64, 235], [1520, 44, 150], [1580, 56, 205], [1650, 40, 170],
    [1705, 60, 215], [1780, 44, 160], [2060, 76, 205], [2440, 40, 90]];
  const SKY_W = 2700;
  function drawSkyline(ctx, vw, camX, t) {
    const off = camX * 0.12;
    for (let base = Math.floor(off / SKY_W) * SKY_W; base - off < vw; base += SKY_W) {
      const X = base - off;
      ctx.fillStyle = '#121530';
      ctx.beginPath(); ctx.ellipse(X + 360, BASE_Y - 10, 420, 170, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#121530'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(X + 330, BASE_Y - 205); ctx.lineTo(X + 460, BASE_Y - 120); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X + 330, BASE_Y - 205); ctx.lineTo(X + 330, BASE_Y - 150); ctx.stroke();
      for (const [sx, w, h] of SKY) { ctx.fillStyle = '#121530'; ctx.fillRect(X + sx, BASE_Y - h, w, h); }
      ctx.beginPath(); ctx.moveTo(X + 2440, BASE_Y - 90); ctx.lineTo(X + 2460, BASE_Y - 200); ctx.lineTo(X + 2480, BASE_Y - 90); ctx.fill();
      ctx.fillStyle = 'rgba(255,210,130,0.45)';
      for (const [sx, w, h] of SKY) for (let k = 0; k < h / 9; k++) if (hash(sx, k) < 0.35) ctx.fillRect(X + sx + 6 + hash(k, sx) * (w - 12), BASE_Y - h + 8 + k * 9, 3, 3);
      if (Math.sin(t * 3) > 0) { ctx.fillStyle = '#ff3b3b'; for (const [sx, w, h] of SKY) if (h > 200) ctx.fillRect(X + sx + w / 2 - 2, BASE_Y - h - 4, 4, 4); }
    }
  }

  function drawMid(ctx, vw, camX) {
    const off = camX * 0.45, W = 210;
    for (let k = Math.floor(off / W); k * W - off < vw; k++) {
      const X = k * W - off, h = 170 + hash(k, 9) * 160, w = W - 10 - hash(k, 4) * 40;
      ctx.fillStyle = '#1b1e3a'; ctx.fillRect(X, BASE_Y - h, w, h);
      ctx.fillStyle = 'rgba(255,214,140,0.4)';
      for (let r = 0; r < h / 30 - 1; r++) for (let c = 0; c < w / 28 - 1; c++) if (hash(k * 31 + r, c) < 0.28) ctx.fillRect(X + 12 + c * 28, BASE_Y - h + 14 + r * 30, 10, 13);
    }
  }

  function drawBuilding(ctx, b, X, t) {
    const top = BASE_Y - b.h, w = b.w, gy = BASE_Y - 80;
    ctx.fillStyle = b.shop ? '#26354f' : b.c; ctx.fillRect(X, top, w, b.h);
    ctx.fillStyle = 'rgba(10,8,30,0.45)'; ctx.fillRect(X, top, w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(X - 3, top - 8, w + 6, 10); ctx.fillRect(X + w - 3, top, 3, b.h);
    const cols = Math.max(2, Math.floor((w - 30) / 44)), rows = Math.floor((b.h - 110) / 52), gx = (w - cols * 26) / (cols + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = X + gx + c * (26 + gx), wy = top + 22 + r * 52, on = hash(b.seed + r * 7.1, c * 3.3) < b.lit;
      ctx.fillStyle = on ? '#ffd98a' : '#1b2233'; ctx.fillRect(wx, wy, 26, 34);
      if (on) { ctx.fillStyle = 'rgba(130,60,30,0.35)'; ctx.fillRect(wx, wy + 20, 26, 14); }
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(wx - 2, wy + 34, 30, 4);
    }
    if (b.shop) {
      ctx.fillStyle = '#0f1522'; ctx.fillRect(X + 14, gy + 26, w - 28, 54);
      ctx.fillStyle = 'rgba(120,255,190,0.18)'; ctx.fillRect(X + 14, gy + 26, w - 28, 54);
      ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(X + 50 + k * 66, gy + 56, 16, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#0d0e12'; ctx.fillRect(X + 16, gy - 12, w - 32, 32);
      ctx.font = '900 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3ee68a'; ctx.fillText('BILTILBEHØR & KIOSK', X + w / 2, gy + 4);
    } else if (b.sign) {
      ctx.fillStyle = '#10131c'; ctx.fillRect(X + 10, gy + 30, w - 20, 50);
      ctx.fillStyle = 'rgba(255,220,160,0.2)'; ctx.fillRect(X + 10, gy + 30, w - 20, 50);
      ctx.fillStyle = '#0d0e12'; ctx.fillRect(X + w / 2 - 58, gy - 2, 116, 28);
      ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = Math.sin(t * 7 + b.seed) > -0.92 ? b.sign[1] : '#444'; ctx.fillText(b.sign[0], X + w / 2, gy + 13);
    } else {
      ctx.fillStyle = '#2a1d16'; ctx.fillRect(X + w * b.door - 16, gy + 18, 32, 62);
      ctx.fillStyle = 'rgba(255,214,140,0.5)'; ctx.fillRect(X + w * b.door - 12, gy + 22, 24, 10);
    }
  }

  function drawBuildings(ctx, vw, camX, t) {
    chunksIn(camX - 320, camX + vw + 320, ch => { for (const b of ch.bs) if (b.x + b.w > camX - 10 && b.x < camX + vw + 10) drawBuilding(ctx, b, b.x - camX, t); });
  }

  // Fortau, kantstein, vei med filer, gatelys, fotobokser og P-skilt ved butikken
  function drawStreet(ctx, vw, camX) {
    ctx.fillStyle = '#3a3d47'; ctx.fillRect(0, BASE_Y, vw, 48);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = -(camX % 64); x < vw + 64; x += 64) { ctx.moveTo(x, BASE_Y); ctx.lineTo(x - 12, BASE_Y + 48); }
    ctx.stroke();
    ctx.fillStyle = '#62666f'; ctx.fillRect(0, BASE_Y + 48, vw, 8);
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(0, ROAD_Y0, vw, ROAD_Y1 - ROAD_Y0);
    ctx.strokeStyle = 'rgba(235,235,240,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([40, 36]); ctx.lineDashOffset = camX;
    for (const y of [(LANES[0] + LANES[1]) / 2 - 2, (LANES[1] + LANES[2]) / 2 - 2]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = '#62666f'; ctx.fillRect(0, ROAD_Y1, vw, 8);
    ctx.fillStyle = '#2c2f38'; ctx.fillRect(0, ROAD_Y1 + 8, vw, 500);
    ctx.fillStyle = '#23252c';
    for (let k = Math.floor(camX / LAMP_GAP); k * LAMP_GAP + 160 - camX < vw + 40; k++) {
      const X = k * LAMP_GAP + 160 - camX;
      ctx.fillRect(X - 3, BASE_Y - 122, 6, 166); ctx.fillRect(X - 3, BASE_Y - 126, 30, 5);
      ctx.fillStyle = '#ffe2a8'; ctx.fillRect(X + 16, BASE_Y - 122, 14, 5); ctx.fillStyle = '#23252c';
    }
    for (const cx of camsIn(camX - 50, camX + vw + 50)) {
      const X = cx - camX;
      ctx.fillStyle = '#4b515b'; ctx.fillRect(X - 3, BASE_Y - 70, 6, 112);
      ctx.fillStyle = '#8f99a5'; ctx.fillRect(X - 12, BASE_Y - 96, 24, 30);
      ctx.fillStyle = '#1b2027'; dot(ctx, X - 4, BASE_Y - 82, 6);
      ctx.fillStyle = '#1f6fd1'; ctx.fillRect(X - 11, BASE_Y - 46, 22, 22);
      ctx.fillStyle = '#fff'; ctx.fillRect(X - 6, BASE_Y - 40, 10, 8); ctx.fillRect(X + 3, BASE_Y - 38, 4, 4);
    }
    chunksIn(camX - 320, camX + vw + 320, ch => {
      const b = ch.bs.find(b => b.shop);
      if (!b) return;
      const X = b.x + b.w / 2 - camX;
      ctx.fillStyle = '#4b515b'; ctx.fillRect(X - 3, BASE_Y - 20, 6, 64);
      ctx.fillStyle = '#1f5fd1'; ctx.fillRect(X - 15, BASE_Y - 50, 30, 30);
      ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('P', X, BASE_Y - 34);
    });
  }

  function drawLights(ctx, vw, camX, flashes) {
    for (let k = Math.floor((camX - 200) / LAMP_GAP); k * LAMP_GAP + 160 - camX < vw + 200; k++) {
      const X = k * LAMP_GAP + 160 + 23 - camX;
      drawGlow(ctx, 'rgba(255,190,110,0.32)', 70, X, BASE_Y - 118);
      drawGlow(ctx, 'rgba(255,175,95,0.16)', 150, X, ROAD_Y0 + 20, 1, 0.45);
    }
    chunksIn(camX - 320, camX + vw + 320, ch => {
      for (const b of ch.bs) {
        const X = b.x + b.w / 2 - camX;
        if (X < -200 || X > vw + 200) continue;
        if (b.sign) drawGlow(ctx, hexA(b.sign[1], 0.35), 90, X, BASE_Y - 67);
        if (b.shop) drawGlow(ctx, 'rgba(62,230,138,0.35)', 150, X, BASE_Y - 76, 1.4, 0.7);
      }
    });
    for (const f of flashes) drawGlow(ctx, 'rgba(255,255,255,0.95)', 240, f.x - camX, BASE_Y - 82, f.a);
  }
  const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

  // ---------- Folk på fortauet ----------
  const HAIR = ['#f3d27a', '#e8c06a', '#3a2516', '#1b1410', '#8c3b1c', '#d9a066', '#5a3b22', '#c74b7b'];
  const SKIN = ['#f6d3b3', '#eebf99', '#d9a27a', '#b87a52', '#8a5a3c', '#f2c9a0'];
  const OUTFIT = ['#e23b6c', '#ff7ab8', '#7b5cff', '#2bc4c4', '#f5c542', '#f4f4f4', '#151515', '#e05a2b', '#3aa655'];
  function makePed(x, r, kind) {
    return { x, y: WALK_Y - r() * 10, kind, hair: HAIR[r() * HAIR.length | 0], hs: r() * 3 | 0, skin: SKIN[r() * SKIN.length | 0],
      top: OUTFIT[r() * OUTFIT.length | 0], dress: kind === 'dame' && r() < 0.55, walk: r() < 0.35 ? (r() < 0.5 ? -1 : 1) * (18 + r() * 22) : 0,
      ph: r() * 6, state: 'idle', cool: 0, say: null, sayT: 0, alpha: 1, wait: 0 };
  }

  function drawPed(ctx, p, X, t) {
    const y = p.y, moving = p.walk || p.state === 'walk' || p.state === 'leave', sw = moving ? Math.sin(t * 9 + p.ph) * 5 : 0;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(X, y, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = p.dress ? p.skin : p.kind === 'dame' ? '#2b3a5a' : '#30343c'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(X - 3, y - 26); ctx.lineTo(X - 3 + sw, y - 1); ctx.moveTo(X + 3, y - 26); ctx.lineTo(X + 3 - sw, y - 1); ctx.stroke();
    if (p.kind === 'dame' && p.hs === 0) { ctx.fillStyle = p.hair; ctx.fillRect(X - 9, y - 64, 18, 24); }
    ctx.fillStyle = p.top;
    if (p.dress) { ctx.beginPath(); ctx.moveTo(X - 7, y - 50); ctx.lineTo(X + 7, y - 50); ctx.lineTo(X + 12, y - 20); ctx.lineTo(X - 12, y - 20); ctx.closePath(); ctx.fill(); }
    else { rrect(ctx, X - 8, y - 51, 16, 27, 4); ctx.fill(); }
    ctx.strokeStyle = p.top; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(X - 7, y - 47); ctx.lineTo(X - 9 - sw * 0.6, y - 28); ctx.moveTo(X + 7, y - 47); ctx.lineTo(X + 9 + sw * 0.6, y - 28); ctx.stroke();
    ctx.fillStyle = p.skin; dot(ctx, X, y - 58, 8);
    ctx.fillStyle = p.hair;
    if (p.kind === 'dame') {
      ctx.beginPath(); ctx.arc(X, y - 60, 8.6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      if (p.hs === 1) { ctx.beginPath(); ctx.ellipse(X - 10, y - 58, 4, 9, 0.3, 0, Math.PI * 2); ctx.fill(); }
      if (p.hs === 2) ctx.fillRect(X - 9, y - 62, 18, 9);
    } else if (p.hs === 0) { ctx.fillStyle = '#1d1f26'; ctx.fillRect(X - 9, y - 67, 18, 6); ctx.fillRect(X, y - 63, 12, 3); }
    else { ctx.beginPath(); ctx.arc(X, y - 60, 8.4, Math.PI, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawBubble(ctx, text, X, y, a) {
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 18;
    ctx.globalAlpha = a; ctx.fillStyle = '#fff';
    rrect(ctx, X - w / 2, y - 30, w, 26, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X - 6, y - 5); ctx.lineTo(X + 6, y - 5); ctx.lineTo(X, y + 3); ctx.fill();
    ctx.fillStyle = '#16171c'; ctx.fillText(text, X, y - 16);
    ctx.globalAlpha = 1;
  }

  return { chunk, shopAt, camsIn, makePed, drawSky, drawSkyline, drawMid, drawBuildings, drawStreet, drawLights, drawPed, drawBubble };
})();
