'use strict';
// Oslo-kartet: veinett, kvartaler, parker, Akerselva og fjorden – pluss tegning, kollisjon og ruting.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const World = (() => {
  const RW = 150, HALF = RW / 2, LANE = 37, SW = 16;
  const VX = [0, 500, 980, 1520, 2040, 2540, 3100, 3620, 4160, 4660];
  const HY = [0, 470, 950, 1460, 1940, 2420, 2880];
  const NX = VX.length, NY = HY.length, LX = VX[NX - 1], LY = HY[NY - 1];
  const FJORD = LY + HALF;
  const B = { x0: -460, y0: -460, x1: LX + 460, y1: LY + 760 };
  const RIVER_X = (VX[4] + VX[5]) / 2, RIVER_W = 96;
  // b = bygårder, p = park, r = elva, S = Slottet, B = Bislett, O = Oslo S, R = Rådhuset, o = Operaen
  const MAP = ['bbbbrbbpb', 'pbBbrbbbb', 'bpSbrbbbb', 'bbbbrbObb', 'bbRbrbbbb', 'bbbbrbobb'];
  const DIST = ['MMBHEGGTT', 'FMBHEGGTT', 'FSSHEGGNN', 'FSKKEKONN', 'AARKEVONN', 'AARKEVVLL'];
  const DNAMES = { M: 'Majorstuen', B: 'Bislett', H: 'St. Hanshaugen', E: 'Akerselva', G: 'Grünerløkka', T: 'Tøyen', F: 'Frogner', S: 'Slottsparken', K: 'Karl Johan', O: 'Oslo S', N: 'Grønland', A: 'Aker Brygge', R: 'Rådhuset', V: 'Bjørvika', L: 'Gamlebyen' };
  const ROOFS = ['#353a46', '#3e4350', '#463b36', '#36443e', '#4a4054', '#333d4b', '#4d4134', '#3b3b3b'];

  let seed = 20031;
  const rnd = () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const solids = [], buildings = [], trees = [], parks = [], specials = [], water = [], forest = [], lamps = [];
  forest.push({ x: B.x0, y: B.y0, w: B.x1 - B.x0, h: -HALF - SW - B.y0 });
  forest.push({ x: B.x0, y: B.y0, w: -HALF - SW - B.x0, h: FJORD - B.y0 });
  forest.push({ x: LX + HALF + SW, y: B.y0, w: B.x1 - LX - HALF - SW, h: FJORD - B.y0 });
  water.push({ x: B.x0, y: FJORD, w: B.x1 - B.x0, h: B.y1 - FJORD });
  water.push({ x: RIVER_X - RIVER_W / 2, y: B.y0, w: RIVER_W, h: FJORD - B.y0 });
  solids.push(...forest, water[0]);

  function addBlock(x, y, w, h) {
    solids.push({ x, y, w, h });
    const cols = w > 300 ? 2 : 1, rows = h > 240 ? 2 : 1, g = 8;
    const sx = cols > 1 ? w * (0.4 + rnd() * 0.2) : w, sy = rows > 1 ? h * (0.4 + rnd() * 0.2) : h;
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      const bx = a ? x + sx + g / 2 : x, by = b ? y + sy + g / 2 : y;
      const bw = cols > 1 ? (a ? w - sx - g / 2 : sx - g / 2) : w;
      const bh = rows > 1 ? (b ? h - sy - g / 2 : sy - g / 2) : h;
      const d = [];
      for (let k = 0, n = 1 + (rnd() * 3 | 0); k < n; k++)
        d.push([bx + 10 + rnd() * (bw - 40), by + 10 + rnd() * (bh - 40), 12 + rnd() * 14, 10 + rnd() * 10, rnd() < 0.3]);
      buildings.push({ x: bx, y: by, w: bw, h: bh, c: ROOFS[rnd() * ROOFS.length | 0], sh: 6 + rnd() * 10, d });
    }
  }

  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const t = MAP[j][i];
    const x = VX[i] + HALF + SW, y = HY[j] + HALF + SW;
    const w = VX[i + 1] - VX[i] - RW - 2 * SW, h = HY[j + 1] - HY[j] - RW - 2 * SW;
    if (t === 'p' || t === 'S') {
      parks.push({ x, y, w, h });
      let keep = null;
      if (t === 'S') {
        keep = { x: x + (w - 200) / 2, y: y + (h - 110) / 2, w: 200, h: 110, kind: 'slott' };
        specials.push(keep); solids.push(keep);
      }
      for (let k = 0; k < 90; k++) {
        const tx = x + 24 + rnd() * (w - 48), ty = y + 24 + rnd() * (h - 48);
        if (keep && tx > keep.x - 40 && tx < keep.x + keep.w + 40 && ty > keep.y - 40 && ty < keep.y + keep.h + 40) continue;
        if (trees.some(o => (o.x - tx) ** 2 + (o.y - ty) ** 2 < 75 * 75)) continue;
        trees.push({ x: tx, y: ty, r: 14 + rnd() * 8 });
      }
    } else if (t === 'r') {
      const l = RIVER_X - RIVER_W / 2, r = RIVER_X + RIVER_W / 2;
      solids.push({ x: l, y: HY[j] + HALF, w: RIVER_W, h: HY[j + 1] - HY[j] - RW });
      addBlock(x, y, l - SW - x, h);
      addBlock(r + SW, y, x + w - r - SW, h);
    } else if (t === 'b') addBlock(x, y, w, h);
    else { const s = { x, y, w, h, kind: t }; specials.push(s); solids.push(s); }
  }

  // Gatelys: to hjørner per kryss + ett midt på hver strekning
  VX.forEach((x, i) => HY.forEach((y, j) => {
    lamps.push({ x: x + HALF + 6, y: y - HALF - 6 }, { x: x - HALF - 6, y: y + HALF + 6 });
    if (j < NY - 1) lamps.push({ x: x + (j % 2 ? HALF : -HALF) + (j % 2 ? 6 : -6), y: (y + HY[j + 1]) / 2 });
    if (i < NX - 1) lamps.push({ x: (x + VX[i + 1]) / 2, y: y + (i % 2 ? HALF + 6 : -HALF - 6) });
  }));

  const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
  const JACKETS = ['#d94848', '#3b82f6', '#f2f2f2', '#22c55e', '#a855f7', '#f59e0b', '#111827', '#ec4899', '#64748b'];
  const HAIR = ['#141414', '#2b1d12', '#5a3b1e', '#d6b06a', '#262626', '#7a4a22'];
  // Hotspots: [kolonne, rad, side av kvartalet, skilt, neonfarge, sted]
  const HOT = [
    [7, 3, 'n', 'KEBAB', '#ff3fa4', 'Grønland'], [3, 3, 'n', 'KAFÉ', '#38d9ff', 'Karl Johan'],
    [0, 5, 's', 'SUSHI', '#ffb347', 'Aker Brygge'], [5, 1, 'w', 'PIZZA', '#7dff6b', 'Grünerløkka'],
    [1, 0, 's', 'GRILL', '#ff5b5b', 'Majorstuen'], [8, 1, 'w', 'KEBAB', '#ff3fa4', 'Tøyen'],
    [5, 5, 's', 'KIOSK', '#38d9ff', 'Bjørvika'], [3, 1, 'e', 'BURGER', '#ffd23f', 'Bislett'],
    [0, 2, 'e', 'CAFÉ', '#c77dff', 'Frogner'], [7, 5, 'n', 'PIZZA', '#7dff6b', 'Gamlebyen']
  ].map(([i, j, side, sign, col, name]) => {
    const cx = (VX[i] + VX[i + 1]) / 2, cy = (HY[j] + HY[j + 1]) / 2;
    const p = { s: [cx, HY[j + 1] - HALF - SW / 2], n: [cx, HY[j] + HALF + SW / 2], e: [VX[i + 1] - HALF - SW / 2, cy], w: [VX[i] + HALF + SW / 2, cy] }[side];
    const back = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[side];
    const crowd = [];
    for (let k = 0; k < 6; k++) crowd.push({ o: -55 + k * 22 + rnd() * 8, d: (rnd() - 0.5) * 8, c: JACKETS[rnd() * JACKETS.length | 0], hair: HAIR[rnd() * HAIR.length | 0], ph: rnd() * 6 });
    return { x: p[0], y: p[1], hz: side === 'n' || side === 's', sx: p[0] + back[0] * 30, sy: p[1] + back[1] * 30, sign, col, glow: hexA(col, 0.38), name, crowd, cool: 0, cheer: 0 };
  });

  // Fotobokser: punkt på veien + boks på fortauet
  const CAMS = [[(VX[5] + VX[6]) / 2, HY[2], 1], [VX[7], (HY[1] + HY[2]) / 2, 0], [(VX[2] + VX[3]) / 2, HY[6], 1],
    [VX[1], (HY[0] + HY[1]) / 2, 0], [VX[4], (HY[4] + HY[5]) / 2, 0], [(VX[6] + VX[7]) / 2, HY[5], 1]]
    .map(([x, y, h]) => ({ x, y, bx: h ? x : x + HALF + SW / 2, by: h ? y - HALF - SW / 2 : y, cool: 0, flash: 0 }));

  const labels = {};
  DIST.forEach((row, j) => [...row].forEach((c, i) => {
    const L = labels[c] || (labels[c] = { n: DNAMES[c].toUpperCase(), x: 0, y: 0, k: 0 });
    L.x += (VX[i] + VX[i + 1]) / 2; L.y += (HY[j] + HY[j + 1]) / 2; L.k++;
  }));
  const LABELS = Object.values(labels).map(L => ({ n: L.n, x: L.x / L.k, y: L.y / L.k }));
  const STREETS = [['KARL JOHANS GATE', (VX[2] + VX[6]) / 2, HY[3], 0], ['BOGSTADVEIEN', VX[1], (HY[0] + HY[2]) / 2, 1],
    ['TRONDHEIMSVEIEN', VX[7], (HY[0] + HY[2]) / 2, 1], ['GRØNLANDSLEIRET', (VX[6] + VX[9]) / 2, HY[4], 0],
    ['KAIA', (VX[0] + VX[4]) / 2, LY, 0], ['RING 2', (VX[1] + VX[8]) / 2, HY[0], 0]];

  // ---------- Spørringer ----------
  const cellIdx = (arr, v) => { let k = 0; while (k < arr.length - 2 && v > arr[k + 1]) k++; return k; };
  const nearIdx = (arr, v) => { let b = 0; for (let k = 1; k < arr.length; k++) if (Math.abs(arr[k] - v) < Math.abs(arr[b] - v)) b = k; return b; };
  const inR = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

  function district(x, y) {
    if (y > FJORD) return 'Oslofjorden';
    return DNAMES[DIST[cellIdx(HY, y)][cellIdx(VX, x)]];
  }
  const offroad = (x, y) => parks.some(p => inR(p, x, y));
  const solidAt = (x, y) => solids.some(r => inR(r, x, y));

  function lineClear(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 30);
    for (let k = 1; k < n; k++) if (solidAt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)) return false;
    return true;
  }

  // Neste veipunkt langs veinettet fra (x,y) mot (tx,ty) – Manhattan-ruting via kryssene
  function route(x, y, tx, ty) {
    const i = nearIdx(VX, x), j = nearIdx(HY, y), ti = nearIdx(VX, tx), tj = nearIdx(HY, ty);
    const onV = Math.abs(x - VX[i]) < HALF, onH = Math.abs(y - HY[j]) < HALF;
    const tV = Math.abs(tx - VX[ti]) < HALF, tH = Math.abs(ty - HY[tj]) < HALF;
    if ((onH && tH && j === tj) || (onV && tV && i === ti)) return [tx, ty];
    if (onH && onV) {
      if (ti !== i && (tj === j || Math.abs(tx - x) >= Math.abs(ty - y))) return [VX[i + Math.sign(ti - i)], HY[j]];
      if (tj !== j) return [VX[i], HY[j + Math.sign(tj - j)]];
      return [tx, ty];
    }
    if (onH) {
      const d = Math.sign(tx - x) || 1;
      const k = (VX[i] - x) * d < 0 ? i + d : i;
      return [VX[clamp(k, 0, NX - 1)], HY[j]];
    }
    if (onV) {
      const d = Math.sign(ty - y) || 1;
      const k = (HY[j] - y) * d < 0 ? j + d : j;
      return [VX[i], HY[clamp(k, 0, NY - 1)]];
    }
    return [VX[i], HY[j]];
  }

  function randomRoadPoint() {
    if (Math.random() < 0.5) return { x: VX[0] + Math.random() * LX, y: HY[Math.random() * NY | 0] + (Math.random() - 0.5) * RW * 0.5 };
    return { x: VX[Math.random() * NX | 0] + (Math.random() - 0.5) * RW * 0.5, y: HY[0] + Math.random() * LY };
  }

  // ---------- Tegning ----------
  const glowCache = {};
  function drawGlow(ctx, color, r, x, y, s = 1) {
    const key = color + r;
    let c = glowCache[key];
    if (!c) {
      c = glowCache[key] = document.createElement('canvas');
      c.width = c.height = r * 2;
      const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    }
    ctx.drawImage(c, x - r * s, y - r * s, r * 2 * s, r * 2 * s);
  }
  const vis = (r, v, m = 0) => r.x < v.x1 + m && r.x + r.w > v.x0 - m && r.y < v.y1 + m && r.y + r.h > v.y0 - m;
  const near = (x, y, v, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

  function drawGround(ctx, v, t) {
    ctx.fillStyle = '#2a2d35'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    ctx.fillStyle = '#0f1a13'; for (const r of forest) if (vis(r, v)) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#1c3122'; for (const p of parks) if (vis(p, v)) ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#0b1c30'; for (const r of water) if (vis(r, v)) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(120,180,230,0.14)'; ctx.lineWidth = 2; ctx.beginPath();
    for (const r of water) {
      if (!vis(r, v)) continue;
      const x0 = Math.max(r.x, v.x0), x1 = Math.min(r.x + r.w, v.x1), y1 = Math.min(r.y + r.h, v.y1);
      for (let y = Math.floor(Math.max(r.y, v.y0) / 46) * 46; y < y1; y += 46)
        for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
          const wx = x + (y / 46 % 2) * 45 + Math.sin(t * 1.5 + y * 0.05 + x * 0.01) * 12;
          if (wx < r.x + 4 || wx + 24 > r.x + r.w || y < r.y + 8) continue;
          ctx.moveTo(wx, y); ctx.quadraticCurveTo(wx + 12, y - 5, wx + 24, y);
        }
    }
    ctx.stroke();
    ctx.fillStyle = '#16181d';
    for (const x of VX) if (x + HALF > v.x0 && x - HALF < v.x1) ctx.fillRect(x - HALF, HY[0] - HALF, RW, LY + RW);
    for (const y of HY) if (y + HALF > v.y0 && y - HALF < v.y1) ctx.fillRect(VX[0] - HALF, y - HALF, LX + RW, RW);
    // Gul stiplet midtlinje (som på norske veier)
    ctx.strokeStyle = 'rgba(230,190,60,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]); ctx.beginPath();
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
      const x = VX[i], a = HY[j] + HALF + 34, b = HY[j + 1] - HALF - 34;
      if (x > v.x0 - 10 && x < v.x1 + 10 && b > v.y0 && a < v.y1) { ctx.moveTo(x, a); ctx.lineTo(x, b); }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
      const y = HY[j], a = VX[i] + HALF + 34, b = VX[i + 1] - HALF - 34;
      if (y > v.y0 - 10 && y < v.y1 + 10 && b > v.x0 && a < v.x1) { ctx.moveTo(a, y); ctx.lineTo(b, y); }
    }
    ctx.stroke(); ctx.setLineDash([]);
    // Fotgjengerfelt
    ctx.fillStyle = 'rgba(220,220,225,0.3)';
    VX.forEach((x, i) => HY.forEach((y, j) => {
      if (!near(x, y, v, RW)) return;
      for (let k = -HALF + 12; k < HALF - 12; k += 18) {
        if (j > 0) ctx.fillRect(x + k, y - HALF - 28, 9, 20);
        if (j < NY - 1) ctx.fillRect(x + k, y + HALF + 8, 9, 20);
        if (i > 0) ctx.fillRect(x - HALF - 28, y + k, 20, 9);
        if (i < NX - 1) ctx.fillRect(x + HALF + 8, y + k, 20, 9);
      }
    }));
    // Gatenavn
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [n, x, y, vert] of STREETS) {
      if (!near(x, y, v, 300)) continue;
      ctx.save(); ctx.translate(x + (vert ? 0 : 0), y + (vert ? 0 : 0)); if (vert) ctx.rotate(-Math.PI / 2);
      ctx.fillText(n, 0, -HALF / 2 + 2); ctx.restore();
    }
  }

  function drawSpecial(ctx, s) {
    const { x, y, w, h } = s;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 10, y + 10, w, h);
    if (s.kind === 'slott') {
      ctx.fillStyle = '#cdbb8a'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#b29e6d'; ctx.fillRect(x + 8, y + h / 2 - 6, w - 16, 12);
      ctx.fillStyle = '#e4d6ab'; ctx.fillRect(x + w / 2 - 32, y + h - 6, 64, 22);
      ctx.fillStyle = '#c8102e'; ctx.fillRect(x + w / 2 - 9, y + 14, 18, 12);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 4, y + 14, 5, 12); ctx.fillRect(x + w / 2 - 9, y + 18, 18, 4);
      ctx.fillStyle = '#00205b'; ctx.fillRect(x + w / 2 - 3, y + 14, 3, 12); ctx.fillRect(x + w / 2 - 9, y + 19, 18, 2);
    } else if (s.kind === 'B') {
      ctx.fillStyle = '#3b3f48'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#8c3a2b'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 14, h / 2 - 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f6b35'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 40, h / 2 - 38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 40); ctx.lineTo(x + w / 2, y + h - 40); ctx.stroke();
    } else if (s.kind === 'O') {
      ctx.fillStyle = '#2b3a4f'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(160,200,255,0.2)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = x + 16; k < x + w; k += 22) { ctx.moveTo(k, y + 50); ctx.lineTo(k, y + h - 6); }
      ctx.stroke();
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x, y, w, 46);
    } else if (s.kind === 'R') {
      ctx.fillStyle = '#6e3526'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#86432f'; ctx.fillRect(x + 20, y + 20, 74, 74); ctx.fillRect(x + w - 94, y + 20, 74, 74);
      ctx.fillStyle = '#3f7a68'; ctx.fillRect(x + 47, y + 47, 20, 20); ctx.fillRect(x + w - 67, y + 47, 20, 20);
    } else if (s.kind === 'o') {
      ctx.fillStyle = '#c9cfd8'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.55, y + h * 0.35); ctx.lineTo(x + w, y); ctx.fill();
      ctx.fillStyle = '#b4bcc7'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.55, y + h * 0.35); ctx.lineTo(x + w, y + h); ctx.fill();
      ctx.fillStyle = '#8e9bab'; ctx.fillRect(x + w * 0.45, y + h * 0.2, w * 0.2, h * 0.3);
    }
  }

  function drawTop(ctx, v, t) {
    for (const b of buildings) {
      if (!vis(b, v, 20)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(b.x + b.sh, b.y + b.sh, b.w, b.h);
      ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      for (const d of b.d) { ctx.fillStyle = d[4] ? 'rgba(255,214,140,0.5)' : 'rgba(255,255,255,0.08)'; ctx.fillRect(d[0], d[1], d[2], d[3]); }
    }
    for (const s of specials) if (vis(s, v, 20)) drawSpecial(ctx, s);
    for (const tr of trees) {
      if (!near(tr.x, tr.y, v, 30)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; dot(ctx, tr.x + 5, tr.y + 5, tr.r);
      ctx.fillStyle = '#1f4a2a'; dot(ctx, tr.x, tr.y, tr.r);
      ctx.fillStyle = '#2b5f36'; dot(ctx, tr.x - tr.r * 0.25, tr.y - tr.r * 0.25, tr.r * 0.6);
    }
    // Marka rundt byen: trær i et fast mønster
    for (const r of forest) {
      if (!vis(r, v)) continue;
      const x0 = Math.max(r.x, v.x0 - 40), x1 = Math.min(r.x + r.w, v.x1 + 40), y1 = Math.min(r.y + r.h, v.y1 + 40);
      for (let y = Math.floor(Math.max(r.y, v.y0 - 40) / 56) * 56; y < y1; y += 56)
        for (let x = Math.floor(x0 / 56) * 56; x < x1; x += 56) {
          const hsh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, f = hsh - Math.floor(hsh);
          const tx = x + f * 30, ty = y + ((f * 7) % 1) * 30;
          if (!inR(r, tx, ty) || Math.abs(tx - RIVER_X) < RIVER_W / 2 + 20) continue;
          ctx.fillStyle = f > 0.5 ? '#1a3a22' : '#163020'; dot(ctx, tx, ty, 18 + f * 10);
        }
    }
    ctx.fillStyle = '#ffe2a8';
    for (const L of lamps) if (near(L.x, L.y, v, 10)) dot(ctx, L.x, L.y, 3);
    // Fotobokser
    for (const c of CAMS) {
      if (!near(c.bx, c.by, v, 30)) continue;
      ctx.fillStyle = '#8f99a5'; ctx.fillRect(c.bx - 8, c.by - 10, 16, 20);
      ctx.fillStyle = '#1b2027'; ctx.fillRect(c.bx - 5, c.by - 6, 10, 7);
      ctx.fillStyle = '#1f6fd1'; ctx.fillRect(c.bx - 8, c.by + 4, 16, 6);
    }
    // Hotspots: neonskilt og folk på fortauet
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 17px system-ui, sans-serif';
    for (const hs of HOT) {
      if (!near(hs.x, hs.y, v, 120)) continue;
      ctx.fillStyle = '#0d0e12'; ctx.fillRect(hs.sx - 42, hs.sy - 13, 84, 26);
      ctx.fillStyle = Math.sin(t * 7 + hs.x) > -0.9 ? hs.col : '#444'; ctx.fillText(hs.sign, hs.sx, hs.sy + 1);
      for (const p of hs.crowd) {
        const jump = hs.cheer > 0 ? Math.abs(Math.sin(t * 12 + p.ph)) : 0;
        const px = hs.x + (hs.hz ? p.o : p.d), py = hs.y + (hs.hz ? p.d : p.o);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; dot(ctx, px + 2, py + 2, 7);
        ctx.fillStyle = p.c; dot(ctx, px, py, 7 + jump * 2);
        if (jump) { dot(ctx, px - 8, py - 3 - jump * 3, 2.8); dot(ctx, px + 8, py - 3 - jump * 3, 2.8); }
        ctx.fillStyle = p.hair; dot(ctx, px, py, 4.2);
      }
    }
    // Bydelsnavn
    ctx.font = '900 46px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.075)';
    for (const L of LABELS) if (near(L.x, L.y, v, 300)) ctx.fillText(L.n, L.x, L.y);
  }

  function drawLights(ctx, v) {
    for (const L of lamps) if (near(L.x, L.y, v, 120)) drawGlow(ctx, 'rgba(255,175,95,0.2)', 120, L.x, L.y);
    for (const hs of HOT) if (near(hs.sx, hs.sy, v, 100)) drawGlow(ctx, hs.glow, 90, hs.sx, hs.sy);
    for (const c of CAMS) if (c.flash > 0) drawGlow(ctx, 'rgba(255,255,255,0.95)', 220, c.bx, c.by, c.flash);
  }

  function miniLayer(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const s = Math.min(w / (B.x1 - B.x0), h / (B.y1 - B.y0));
    const ox = (w - (B.x1 - B.x0) * s) / 2 - B.x0 * s, oy = (h - (B.y1 - B.y0) * s) / 2 - B.y0 * s;
    g.setTransform(s, 0, 0, s, ox, oy);
    g.fillStyle = '#22262e'; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    g.fillStyle = '#11231a'; for (const r of forest) g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#1f4a2a'; for (const p of parks) g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#1a4470'; for (const r of water) g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#5d6470';
    for (const x of VX) g.fillRect(x - HALF, HY[0] - HALF, RW, LY + RW);
    for (const y of HY) g.fillRect(VX[0] - HALF, y - HALF, LX + RW, RW);
    return { c, s, ox, oy };
  }

  return { RW, HALF, LANE, VX, HY, NX, NY, B, FJORD, solids, trees, HOT, CAMS,
    district, offroad, solidAt, lineClear, route, nearIdx, randomRoadPoint,
    drawGround, drawTop, drawLights, drawGlow, miniLayer, dot };
})();
