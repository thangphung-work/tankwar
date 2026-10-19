/**
 * TÌM ĐƯỜNG & LÁI TỰ ĐỘNG NÉ VẬT CẢN (dùng chung cho bot và người chơi)
 * - Lưới ô vuông phủ bản đồ; ô bị chặn = nhà / đống đổ nát, đá tảng, tường công sự, tường bê tông cứ điểm
 *   (thử va chạm thân xe tại tâm ô); cạnh nối 2 ô bị chặn khi dốc lên vượt khả năng leo của loại xe đó
 *   (pháo tự hành 6x6 leo kém -> tự đi vòng ụ đất / sườn đá).
 * - A* 8 hướng, sau đó "kéo căng" đường (bỏ điểm thừa khi đi thẳng được) để xe chạy mượt, không zig-zag theo ô.
 * - Bám đường: hướng tới điểm kế tiếp, tự tính lại khi mục tiêu đổi / bị kẹt.
 */
const Navigator = (() => {
  const CELL = 24;
  const CLEAR = 20;           // bán kính an toàn thân xe khi thử va chạm
  const grids = new WeakMap(); // terrain -> lưới cơ sở (độ cao + ô chặn)

  function baseGrid(terrain) {
    let G = grids.get(terrain);
    if (G) return G;
    const W = terrain.width, D = terrain.depth;
    const nx = Math.ceil(W / CELL), nz = Math.ceil(D / CELL);
    const h = new Float32Array(nx * nz), blocked = new Uint8Array(nx * nz);
    const margin = 70;
    const SS = terrain.strongholdSet;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = -W / 2 + (i + 0.5) * CELL, z = -D / 2 + (j + 0.5) * CELL;
        const k = j * nx + i;
        h[k] = terrain.getVehicleGroundAt ? terrain.getVehicleGroundAt(x, z) : terrain.getElevationAt(x, z);
        if (Math.abs(x) > W / 2 - margin || Math.abs(z) > D / 2 - margin) { blocked[k] = 1; continue; }
        // Tường bê tông cứ điểm: thử va chạm thân xe tại tâm ô (chỉ các ô gần cứ điểm)
        if (SS && SS.near && SS.near(x, z, 40)) {
          const r = terrain.resolveVehicleCollision(x, z, x, z, CLEAR, null);
          if (r && r.hit && Math.hypot(r.x - x, r.z - z) > 1.5) blocked[k] = 1;
        }
      }
    }
    // Vật cản tĩnh: tô kín mọi ô chạm vào hình vật cản đã nới rộng thêm nửa bề ngang xe (không để lọt góc nhà)
    const INF = 22;
    const mark = (cx, cz, R, inside) => {
      const [i0, j0] = cellOf({ nx, nz, W, D }, cx - R - CELL, cz - R - CELL), [i1, j1] = cellOf({ nx, nz, W, D }, cx + R + CELL, cz + R + CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -W / 2 + (i + 0.5) * CELL, z = -D / 2 + (j + 0.5) * CELL;
        // tâm ô hoặc 4 góc ô nằm trong vùng cấm
        const hc = CELL * 0.5;
        if (inside(x, z) || inside(x - hc, z - hc) || inside(x + hc, z - hc) || inside(x - hc, z + hc) || inside(x + hc, z + hc)) blocked[j * nx + i] = 1;
      }
    };
    for (const b of terrain.buildings || []) {
      const R = b.ref;
      if (R) {
        const c = Math.cos(-R.angle), s = Math.sin(-R.angle), hx = R.halfW + INF, hz = R.halfD + INF;
        mark(R.x, R.z, Math.hypot(hx, hz), (x, z) => { const dx = x - R.x, dz = z - R.z; return Math.abs(dx * c + dz * s) < hx && Math.abs(-dx * s + dz * c) < hz; });
      } else {
        const r = b.radius + INF;
        mark(b.x, b.z, r, (x, z) => Math.hypot(x - b.x, z - b.z) < r);
      }
    }
    for (const rock of terrain.boulders || []) {
      const r = (rock.radius || 18) + INF;
      mark(rock.x, rock.z, r, (x, z) => Math.hypot(x - rock.x, z - rock.z) < r);
    }
    for (const fort of terrain.horseshoeForts || []) for (const bl of fort.wallBlocks || []) {
      const r = bl.radius + INF;
      mark(bl.x, bl.z, r, (x, z) => Math.hypot(x - bl.x, z - bl.z) < r);
    }
    G = { nx, nz, W, D, h, blocked, terrain };
    grids.set(terrain, G);
    return G;
  }

  // Làm mới lưới (vd nhà sập thành đống đổ nát mới) — gọi khi cần
  function invalidate(terrain) { grids.delete(terrain); }

  const cellOf = (G, x, z) => [Math.max(0, Math.min(G.nx - 1, Math.floor((x + G.W / 2) / CELL))), Math.max(0, Math.min(G.nz - 1, Math.floor((z + G.D / 2) / CELL)))];
  const centerOf = (G, i, j) => ({ x: -G.W / 2 + (i + 0.5) * CELL, z: -G.D / 2 + (j + 0.5) * CELL });

  // Ô trống gần nhất (mục tiêu đặt trúng nhà / tường)
  function nearestFree(G, i, j, maxR = 8) {
    if (!G.blocked[j * G.nx + i]) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= G.nx || b >= G.nz || G.blocked[b * G.nx + a]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return null;
  }

  function climbOf(unit) { return (unit && unit.climbMax) || 0.8; }

  // Có đi thẳng từ A tới B được không (không ô chặn, không dốc quá sức trên đường)
  function lineClear(G, ax, az, bx, bz, climb, extra) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (CELL * 0.45)));
    const px = d > 0 ? -(bz - az) / d * 12 : 0, pz = d > 0 ? (bx - ax) / d * 12 : 0;   // kiểm tra cả 2 mép thân xe
    let ph = null;
    for (let s = 0; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
      const [i, j] = cellOf(G, x, z);
      const k = j * G.nx + i;
      if (G.blocked[k] || (extra && extra.has(k))) return false;
      if (s > 0) for (const sg of [-1, 1]) {
        const [a, b] = cellOf(G, x + px * sg, z + pz * sg), kk = b * G.nx + a;
        if (G.blocked[kk] || (extra && extra.has(kk))) return false;
      }
      if (ph !== null) { const gr = (G.h[k] - ph) / (d / n); if (gr > climb * 0.92 || gr < -Math.max(1.2, climb * 1.4)) return false; }
      ph = G.h[k];
    }
    return true;
  }

  // Hàng đợi ưu tiên nhị phân
  class Heap {
    constructor() { this.a = []; this.p = []; }
    push(v, pr) { const a = this.a, p = this.p; a.push(v); p.push(pr); let i = a.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (p[q] <= p[i]) break; [a[q], a[i]] = [a[i], a[q]]; [p[q], p[i]] = [p[i], p[q]]; i = q; } }
    pop() {
      const a = this.a, p = this.p, top = a[0], last = a.pop(), lp = p.pop();
      if (a.length) {
        a[0] = last; p[0] = lp; let i = 0;
        for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && p[l] < p[m]) m = l; if (r < a.length && p[r] < p[m]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [p[m], p[i]] = [p[i], p[m]]; i = m; }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  /** Tìm đường cho `unit` tới (tx, tz). Trả về mảng điểm [{x,z}] (không gồm vị trí hiện tại) hoặc null */
  function findPath(terrain, unit, tx, tz, extra) {
    if (!terrain || !terrain.resolveVehicleCollision) return null;
    const G = baseGrid(terrain);
    const climb = climbOf(unit);
    if (lineClear(G, unit.x, unit.z, tx, tz, climb, extra)) return [{ x: tx, z: tz }];
    let s = cellOf(G, unit.x, unit.z), g = cellOf(G, tx, tz);
    s = nearestFree(G, s[0], s[1], 3) || s;
    const gFree = nearestFree(G, g[0], g[1], 10);
    if (!gFree) return null;
    const goalMoved = gFree[0] !== g[0] || gFree[1] !== g[1];
    g = gFree;
    const N = G.nx * G.nz, start = s[1] * G.nx + s[0], goal = g[1] * G.nx + g[0];
    const cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hz = (k) => { const i = k % G.nx, j = (k / G.nx) | 0; const di = Math.abs(i - g[0]), dj = Math.abs(j - g[1]); return (Math.max(di, dj) + 0.414 * Math.min(di, dj)) * CELL; };
    const H = new Heap();
    cost[start] = 0; H.push(start, hz(start));
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, iter = 0;
    while (H.size && iter++ < 60000) {
      const k = H.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) { found = true; break; }
      const i = k % G.nx, j = (k / G.nx) | 0;
      for (const [di, dj, m] of DIRS) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= G.nx || b >= G.nz) continue;
        const n = b * G.nx + a;
        if (G.blocked[n] || closed[n] || (extra && extra.has(n))) continue;
        // không cắt góc qua ô chặn
        if (di && dj && (G.blocked[j * G.nx + a] || G.blocked[b * G.nx + i])) continue;
        const len = m * CELL;
        const grade = (G.h[n] - G.h[k]) / len;
        if (grade > climb * 0.92) continue;             // dốc lên quá sức xe này
        if (grade < -Math.max(1.2, climb * 1.4)) continue; // vách hụt (mép kênh cứ điểm, vực): không lao xuống
        // dốc lên tốn công: ưu tiên đường bằng nếu không phải vòng quá xa
        const c = cost[k] + len * (1 + Math.max(0, grade) / climb * 1.6);
        if (c < cost[n]) { cost[n] = c; from[n] = k; H.push(n, c + hz(n)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1 && k !== start; k = from[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map(k => centerOf(G, k % G.nx, (k / G.nx) | 0));
    if (!goalMoved) pts.push({ x: tx, z: tz });
    // kéo căng đường
    const out = [];
    let cx = unit.x, cz = unit.z, idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let t = pts.length - 1; t > idx; t--) if (lineClear(G, cx, cz, pts[t].x, pts[t].z, climb, extra)) { far = t; break; }
      out.push(pts[far]);
      cx = pts[far].x; cz = pts[far].z; idx = far + 1;
    }
    return out;
  }

  /**
   * Bám đường: nav = { tx, tz, path, idx, replanT, stuckT, lastD } (tự tạo). Trả về { dx, dz, arrived, dist }
   * Tự tính lại đường khi mục tiêu đổi > 50 đơn vị, mỗi ~3 s, hoặc khi bị kẹt.
   */
  function steer(unit, nav, terrain, tx, tz, dt, arriveR = 26) {
    const dGoal = Math.hypot(tx - unit.x, tz - unit.z);
    if (dGoal < arriveR) return { dx: 0, dz: 0, arrived: true, dist: dGoal };
    nav.replanT = (nav.replanT || 0) - dt;
    nav.minT = (nav.minT || 0) - dt;
    const shift = nav.tx === undefined ? Infinity : Math.hypot(nav.tx - tx, nav.tz - tz);
    // mục tiêu đổi liên tục (bot né đạn): không tìm lại đường quá 2 lần / giây trừ khi đổi hẳn chỗ
    const moved = shift > 200 || (shift > 50 && nav.minT <= 0);
    // kẹt: trong 1.4 s gần như không nhích (đang húc vào vật cản lưới không thấy: xe khác, xác xe, mép tường...)
    nav.chkT = (nav.chkT || 0) + dt;
    if (nav.chk === undefined) nav.chk = { x: unit.x, z: unit.z };
    let stuck = false;
    if (nav.chkT > 1.4) {
      stuck = Math.hypot(unit.x - nav.chk.x, unit.z - nav.chk.z) < 14;
      nav.chk = { x: unit.x, z: unit.z }; nav.chkT = 0;
    }
    if (stuck && nav.path && nav.path.length) {
      // đánh dấu chỗ phía trước đang húc là vật cản tạm thời, tìm đường khác
      const G = baseGrid(terrain);
      const p0 = nav.path[nav.idx || 0];
      const L0 = Math.hypot(p0.x - unit.x, p0.z - unit.z) || 1;
      const ax = unit.x + (p0.x - unit.x) / L0 * CELL, az = unit.z + (p0.z - unit.z) / L0 * CELL;
      const [ci, cj] = cellOf(G, ax, az), [ui, uj] = cellOf(G, unit.x, unit.z);
      nav.extra = nav.extra || new Set();
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = ci + di, b = cj + dj;
        if (a < 0 || b < 0 || a >= G.nx || b >= G.nz || (a === ui && b === uj)) continue;
        nav.extra.add(b * G.nx + a);
      }
      if (nav.extra.size > 60) nav.extra = new Set([...nav.extra].slice(-60));
    }
    if (moved) nav.extra = null;
    if (moved || nav.replanT <= 0 || !nav.path || stuck) {
      nav.tx = tx; nav.tz = tz;
      nav.path = findPath(terrain, unit, tx, tz, nav.extra);
      nav.idx = 0;
      nav.replanT = 3 + Math.random();
      nav.minT = 0.5;
    }
    let p = null;
    if (nav.path && nav.path.length) {
      while (nav.idx < nav.path.length - 1 && Math.hypot(nav.path[nav.idx].x - unit.x, nav.path[nav.idx].z - unit.z) < 34) nav.idx++;
      p = nav.path[nav.idx];
    }
    const px = p ? p.x : tx, pz = p ? p.z : tz;
    const L = Math.hypot(px - unit.x, pz - unit.z) || 1;
    return { dx: (px - unit.x) / L, dz: (pz - unit.z) / L, arrived: false, dist: dGoal };
  }

  return { findPath, steer, invalidate, CELL };
})();

if (typeof window !== 'undefined') window.Navigator = Navigator;
if (typeof module !== 'undefined') module.exports = Navigator;
