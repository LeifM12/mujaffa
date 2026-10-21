'use strict';
// Biler: fysikk for spilleren og politiet, filfølgende trafikk og politiets jakt-AI.
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // øst, sør, vest, nord
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

const PLAYER_P = { max: 500, boostMax: 720, acc: 430, boostAcc: 900, brake: 950, rev: 170, turn: 3.1 };
const PATROL_P = { max: 250, boostMax: 250, acc: 300, boostAcc: 300, brake: 900, rev: 160, turn: 2.8 };
const chaseP = w => ({ max: 455 + 25 * w, boostMax: 455 + 25 * w, acc: 470, boostAcc: 470, brake: 950, rev: 200, turn: 3.0 });

class Car {
  constructor(x, y, a, color, kind = 'car') {
    Object.assign(this, { x, y, a, drawA: a, vx: 0, vy: 0, fwd: 0, lat: 0, color, kind,
      steer: 0, throttle: 0, brake: 0, hand: false, boost: false });
  }
  get speed() { return Math.hypot(this.vx, this.vy); }

  physics(dt, P) {
    let ca = Math.cos(this.a), sa = Math.sin(this.a);
    let f = this.vx * ca + this.vy * sa, l = -this.vx * sa + this.vy * ca;
    const off = World.offroad(this.x, this.y);
    const max = (this.boost ? P.boostMax : P.max) * (off ? 0.55 : 1);
    if (this.throttle > 0 && f < max) f += (this.boost ? P.boostAcc : P.acc) * this.throttle * dt;
    if (this.brake > 0) {
      if (f > 15) f -= P.brake * this.brake * dt;
      else if (f > -P.rev) f -= P.acc * 0.7 * dt;
    }
    if (!this.throttle && !this.brake) f -= Math.sign(f) * Math.min(Math.abs(f), 80 * dt);
    if (f > max) f -= (f - max) * 2.5 * dt;
    f -= f * 0.1 * dt;
    if (this.hand) f -= f * 0.5 * dt;
    l *= Math.exp(-(this.hand ? 1.4 : off ? 3.5 : 9) * dt);
    this.a = wrapA(this.a + this.steer * P.turn * clamp(f / 160, -1, 1) * (this.hand ? 1.45 : 1) * dt);
    ca = Math.cos(this.a); sa = Math.sin(this.a);
    this.vx = ca * f - sa * l; this.vy = sa * f + ca * l;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.fwd = f; this.lat = l; this.drawA = this.a;
    return this.collide();
  }

  // To sirkler (bak/front) mot bygg, elva, trær og kanter. Returnerer største støthastighet.
  collide() {
    let impact = 0;
    const R = 12;
    for (const k of [-1, 1]) {
      let cx = this.x + Math.cos(this.a) * 13 * k, cy = this.y + Math.sin(this.a) * 13 * k;
      for (const r of World.solids) {
        if (cx + R < r.x || cx - R > r.x + r.w || cy + R < r.y || cy - R > r.y + r.h) continue;
        const px = clamp(cx, r.x, r.x + r.w), py = clamp(cy, r.y, r.y + r.h);
        let nx = cx - px, ny = cy - py, pen;
        const d = Math.hypot(nx, ny);
        if (d >= R) continue;
        if (d < 0.001) {
          const m = [cx - r.x, r.x + r.w - cx, cy - r.y, r.y + r.h - cy], mi = m.indexOf(Math.min(...m));
          nx = [-1, 1, 0, 0][mi]; ny = [0, 0, -1, 1][mi]; pen = m[mi] + R;
        } else { nx /= d; ny /= d; pen = R - d; }
        impact = Math.max(impact, this.push(nx, ny, pen));
        cx += nx * pen; cy += ny * pen;
      }
      for (const tr of World.trees) {
        const dx = cx - tr.x, dy = cy - tr.y, d = Math.hypot(dx, dy), m = R + tr.r * 0.7;
        if (d < m && d > 0.001) impact = Math.max(impact, this.push(dx / d, dy / d, m - d));
      }
    }
    return impact;
  }

  push(nx, ny, pen) {
    this.x += nx * pen; this.y += ny * pen;
    const vn = this.vx * nx + this.vy * ny;
    if (vn >= 0) return 0;
    this.vx -= 1.3 * vn * nx; this.vy -= 1.3 * vn * ny;
    this.vx *= 0.96; this.vy *= 0.96;
    return -vn;
  }

  circles() {
    const c = Math.cos(this.drawA) * 12, s = Math.sin(this.drawA) * 12;
    return [[this.x - c, this.y - s], [this.x + c, this.y + s]];
  }
}

// Dypeste kontakt mellom to biler (to sirkler hver): [nx, ny, pen] fra b mot a, eller null
function carHit(a, b, R = 11.5) {
  let best = null;
  for (const [ax, ay] of a.circles()) for (const [bx, by] of b.circles()) {
    const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy);
    if (d < R * 2 && d > 0.001 && (!best || 2 * R - d > best[2])) best = [dx / d, dy / d, 2 * R - d];
  }
  return best;
}

const TRAFFIC_COLORS = ['#8b93a1', '#c7ccd4', '#2f3542', '#6b2c2c', '#2c4a6b', '#e8e8ea', '#4a5a3a', '#7a6a50', '#1f2937', '#f1f1f1'];

class Traffic {
  constructor(i, j, d) {
    this.kind = Math.random() < 0.12 ? 'taxi' : 'car';
    this.color = this.kind === 'taxi' ? '#15171c' : TRAFFIC_COLORS[Math.random() * TRAFFIC_COLORS.length | 0];
    this.cruise = 120 + Math.random() * 80;
    Object.assign(this, { v: this.cruise, stun: 0, wait: 0, ghost: 0, miss: 0, vx: 0, vy: 0 });
    this.place(i, j, d);
  }
  // Plasser i krysset (i,j) i høyre fil, på vei ut i retning d
  place(i, j, d) {
    const [dx, dy] = DIRS[d];
    this.d = d;
    this.x = World.VX[i] - dy * World.LANE;
    this.y = World.HY[j] + dx * World.LANE;
    this.ti = i + dx; this.tj = j + dy;
    this.a = this.drawA = Math.atan2(dy, dx);
    this.pickNext();
  }
  pickNext() {
    const opts = [];
    for (const [nd, w] of [[this.d, 2], [(this.d + 1) % 4, 1], [(this.d + 3) % 4, 1]]) {
      const ni = this.ti + DIRS[nd][0], nj = this.tj + DIRS[nd][1];
      if (ni >= 0 && ni < World.NX && nj >= 0 && nj < World.NY) for (let k = 0; k < w; k++) opts.push(nd);
    }
    this.nd = opts.length ? opts[Math.random() * opts.length | 0] : (this.d + 2) % 4;
  }
  circles() { return Car.prototype.circles.call(this); }

  update(dt, cars) {
    const [dx, dy] = DIRS[this.d];
    let blocked = this.stun > 0;
    if (this.stun > 0) this.stun -= dt;
    if (this.ghost > 0) this.ghost -= dt;
    else if (!blocked) for (const o of cars) {
      if (o === this) continue;
      const ox = o.x - this.x, oy = o.y - this.y, along = ox * dx + oy * dy;
      if (along > 0 && along < 80 && Math.abs(-ox * dy + oy * dx) < 24) { blocked = true; break; }
    }
    this.wait = blocked ? this.wait + dt : 0;
    if (this.wait > 3 && this.stun <= 0) { this.ghost = 1.2; this.wait = 0; }
    this.v += clamp((blocked ? 0 : this.cruise) - this.v, -520 * dt, 160 * dt);
    this.x += dx * this.v * dt; this.y += dy * this.v * dt;
    this.vx = dx * this.v; this.vy = dy * this.v;
    const cx = World.VX[this.ti], cy = World.HY[this.tj];
    if (this.nd === this.d) {
      if ((this.x - cx) * dx + (this.y - cy) * dy >= 0) { this.ti += dx; this.tj += dy; this.pickNext(); }
    } else {
      const [ndx, ndy] = DIRS[this.nd];
      const lx = cx - ndy * World.LANE, ly = cy + ndx * World.LANE;
      if ((this.x - lx) * dx + (this.y - ly) * dy >= 0) {
        if (this.nd === (this.d + 2) % 4) { this.x = lx; this.y = ly; }
        else if (dx) this.x = lx; else this.y = ly;
        this.d = this.nd; this.ti += ndx; this.tj += ndy; this.pickNext();
      }
    }
    this.a = Math.atan2(DIRS[this.d][1], DIRS[this.d][0]);
    this.drawA += wrapA(this.a - this.drawA) * Math.min(1, dt * 10);
  }
}

class Police extends Car {
  constructor(x, y) {
    super(x, y, 0, '#eef1f5', 'police');
    Object.assign(this, { stuck: 0, rev: 0, los: false, losT: Math.random() * 0.2, pt: null, siren: false });
  }
  think(dt, p, wanted) {
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.2; this.los = dist < 750 && World.lineClear(this.x, this.y, p.x, p.y); }
    this.siren = wanted > 0 && dist < 1600;
    let tx, ty;
    if (this.siren) {
      if (this.los) { tx = p.x + p.vx * 0.3; ty = p.y + p.vy * 0.3; }
      else [tx, ty] = World.route(this.x, this.y, p.x, p.y);
    } else {
      if (!this.pt || Math.hypot(this.pt[0] - this.x, this.pt[1] - this.y) < 90) {
        const i = clamp(World.nearIdx(World.VX, this.x) + (Math.random() * 5 | 0) - 2, 0, World.NX - 1);
        const j = clamp(World.nearIdx(World.HY, this.y) + (Math.random() * 5 | 0) - 2, 0, World.NY - 1);
        this.pt = [World.VX[i], World.HY[j]];
      }
      [tx, ty] = World.route(this.x, this.y, this.pt[0], this.pt[1]);
    }
    const diff = wrapA(Math.atan2(ty - this.y, tx - this.x) - this.a);
    if (this.rev > 0) { this.rev -= dt; this.throttle = 0; this.brake = 1; this.steer = -Math.sign(diff); return; }
    const sharp = Math.abs(diff) > 1.2;
    this.steer = clamp(diff * 2.4, -1, 1);
    this.throttle = sharp && this.fwd > 160 ? 0 : 1;
    this.brake = sharp && this.fwd > 240 ? 1 : 0;
    // Tett på med fri sikt: stopp og stuss inne i stedet for å ramme
    const closing = ((this.vx - p.vx) * (p.x - this.x) + (this.vy - p.vy) * (p.y - this.y)) / (dist || 1);
    if (this.siren && this.los && dist < 95 + Math.max(0, closing) * 0.4) {
      this.throttle = 0; this.brake = this.fwd > 50 ? 1 : 0; this.stuck = 0; return;
    }
    if (this.fwd < 30) { this.stuck += dt; if (this.stuck > 0.8) { this.rev = 0.7; this.stuck = 0; } }
    else this.stuck = 0;
  }
}

// ---------- Tegning ----------
const CONE = (() => {
  const c = document.createElement('canvas'); c.width = 230; c.height = 160;
  const g = c.getContext('2d'), gr = g.createRadialGradient(0, 80, 0, 0, 80, 230);
  gr.addColorStop(0, 'rgba(255,240,200,0.3)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 68); g.lineTo(230, 0); g.lineTo(230, 160); g.lineTo(0, 92); g.closePath(); g.fill();
  return c;
})();

function drawCar(ctx, c, t, opt = {}) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.drawA);
  const hl = 23, hw = 11, wheels = [[-hl + 6, -hw - 2], [hl - 16, -hw - 2], [-hl + 6, hw - 3], [hl - 16, hw - 3]];
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrect(ctx, -hl + 4, -hw + 4, hl * 2, hw * 2, 6); ctx.fill();
  ctx.fillStyle = '#0a0a0c'; for (const [x, y] of wheels) ctx.fillRect(x, y, 10, 5);
  if (opt.rims) { ctx.fillStyle = '#f5c542'; for (const [x, y] of wheels) ctx.fillRect(x + 3, y + 1, 4, 3); }
  ctx.fillStyle = c.color; rrect(ctx, -hl, -hw, hl * 2, hw * 2, 6); ctx.fill();
  if (c.kind === 'police') {
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? '#f5d90a' : '#1d3fae';
      ctx.fillRect(-hl + 6 + k * 6, -hw, 6, 3); ctx.fillRect(-hl + 6 + k * 6, hw - 3, 6, 3);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(-hl + 4, -hw + 3, hl * 2 - 8, 3);
  ctx.fillStyle = opt.glass || '#0d1218';
  ctx.beginPath(); ctx.moveTo(hl - 13, -hw + 3); ctx.lineTo(hl - 6, -hw + 5); ctx.lineTo(hl - 6, hw - 5); ctx.lineTo(hl - 13, hw - 3); ctx.closePath(); ctx.fill();
  ctx.fillRect(-hl + 5, -hw + 4, 6, hw * 2 - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(-hl + 12, -hw + 3, hl * 2 - 26, hw * 2 - 6);
  ctx.fillStyle = '#fff6d0'; ctx.fillRect(hl - 3, -hw + 2, 3, 5); ctx.fillRect(hl - 3, hw - 7, 3, 5);
  ctx.fillStyle = c.brake > 0 ? '#ff3030' : '#a01818'; ctx.fillRect(-hl, -hw + 2, 3, 5); ctx.fillRect(-hl, hw - 7, 3, 5);
  if (opt.kidney) { ctx.fillStyle = '#050505'; ctx.fillRect(hl - 2, -4, 2, 3); ctx.fillRect(hl - 2, 1, 2, 3); }
  if (c.kind === 'police') {
    const on = Math.floor(t * 8) % 2 && c.siren;
    ctx.fillStyle = on ? '#4d8dff' : '#1e3a8a'; ctx.fillRect(-4, -hw + 3, 7, hw - 3);
    ctx.fillStyle = !on && c.siren ? '#4d8dff' : '#1e3a8a'; ctx.fillRect(-4, 0, 7, hw - 3);
  }
  if (c.kind === 'taxi') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(-4, -5, 9, 10); }
  ctx.restore();
}

function carLights(ctx, c, t) {
  const ca = Math.cos(c.drawA), sa = Math.sin(c.drawA);
  ctx.save(); ctx.translate(c.x + ca * 20, c.y + sa * 20); ctx.rotate(c.drawA);
  ctx.drawImage(CONE, 0, -CONE.height / 2); ctx.restore();
  World.drawGlow(ctx, c.brake > 0 ? 'rgba(255,40,40,0.5)' : 'rgba(255,40,40,0.25)', 20, c.x - ca * 24, c.y - sa * 24);
  if (c.kind === 'police' && c.siren) {
    const on = Math.floor(t * 8) % 2 ? 6 : -6;
    World.drawGlow(ctx, 'rgba(60,120,255,0.75)', 80, c.x - sa * on, c.y + ca * on);
  }
}
