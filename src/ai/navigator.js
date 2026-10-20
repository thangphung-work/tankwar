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
  const WADE_DEPTH = 9;       // mặc định khi xe không có wadeMax: nước sâu hơn ~1.1 m (8 đơn vị = 1 m) xe không lội qua
  const grids = new WeakMap(); // terrain -> lưới cơ sở (độ cao + ô chặn)

  function baseGrid(terrain) {
    let G = grids.get(terrain);
    if (G) return G;
    const W = terrain.width, D = terrain.depth;
    const nx = Math.ceil(W / CELL), nz = Math.ceil(D / CELL);
    const h = new Float32Array(nx * nz), blocked = new Uint8Array(nx * nz);
    const wd = new Float32Array(nx * nz);   // độ sâu nước tại tâm ô (0 = cạn)
    const margin = 70;
    const SS = terrain.strongholdSet;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = -W / 2 + (i + 0.5) * CELL, z = -D / 2 + (j + 0.5) * CELL;
        const k = j * nx + i;
        h[k] = terrain.getVehicleGroundAt ? terrain.getVehicleGroundAt(x, z) : terrain.getElevationAt(x, z);
        const ws = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(x, z) : null;
        if (ws !== null && ws !== undefined) wd[k] = Math.max(0, ws - h[k]);
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
    G = { nx, nz, W, D, h, blocked, wd, terrain };
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
  // Độ sâu nước tối đa xe lội qua được (chừa lề an toàn: ô lưới chỉ lấy mẫu ở tâm)
  function wadeOf(unit) { return ((unit && unit.wadeMax) || WADE_DEPTH) * 0.9; }

  // Có đi thẳng từ A tới B được không (không ô chặn, không dốc quá sức trên đường)
  function lineClear(G, ax, az, bx, bz, climb, extra, wade = Infinity) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (CELL * 0.45)));
    const px = d > 0 ? -(bz - az) / d * 12 : 0, pz = d > 0 ? (bx - ax) / d * 12 : 0;   // kiểm tra cả 2 mép thân xe
    // chỉ số ô của (x, z) — như cellOf nhưng không tạo mảng (hàm này chạy rất nhiều lần khi kéo căng đường)
    const nx = G.nx, nz = G.nz, hw = G.W / 2, hd = G.D / 2;
    const kOf = (x, z) => Math.max(0, Math.min(nz - 1, Math.floor((z + hd) / CELL))) * nx + Math.max(0, Math.min(nx - 1, Math.floor((x + hw) / CELL)));
    let ph = null;
    for (let s = 0; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
      const k = kOf(x, z);
      if (G.blocked[k] || (extra && extra.has(k))) return false;
      if (s > 0 && G.wd[k] > wade && G.wd[k] > G.wd[kOf(ax, az)]) return false;   // nước quá sâu (trừ khi đang lội ra chỗ nông hơn)
      if (s > 0) {
        const k1 = kOf(x - px, z - pz), k2 = kOf(x + px, z + pz);
        if (G.blocked[k1] || (extra && extra.has(k1))) return false;
        if (G.blocked[k2] || (extra && extra.has(k2))) return false;
      }
      if (ph !== null) { const gr = (G.h[k] - ph) / (d / n); if (gr > climb * 0.92 || gr < -Math.max(1.2, climb * 1.4)) return false; }
      ph = G.h[k];
    }
    return true;
  }

  // Hàng đợi ưu tiên nhị phân trên mảng số (dùng lại giữa các lần tìm đường, không tạo rác cho bộ thu gom)
  class Heap {
    constructor() { this.a = new Int32Array(4096); this.p = new Float64Array(4096); this.n = 0; }
    clear() { this.n = 0; }
    push(v, pr) {
      if (this.n === this.a.length) {
        const a = new Int32Array(this.n * 2), p = new Float64Array(this.n * 2);
        a.set(this.a); p.set(this.p); this.a = a; this.p = p;
      }
      const a = this.a, p = this.p;
      let i = this.n++;
      a[i] = v; p[i] = pr;
      while (i > 0) {
        const q = (i - 1) >> 1;
        if (p[q] <= p[i]) break;
        const ta = a[q]; a[q] = a[i]; a[i] = ta;
        const tp = p[q]; p[q] = p[i]; p[i] = tp;
        i = q;
      }
    }
    pop() {
      const a = this.a, p = this.p, top = a[0];
      const n = --this.n;
      if (n) {
        a[0] = a[n]; p[0] = p[n]; let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < n && p[l] < p[m]) m = l;
          if (r < n && p[r] < p[m]) m = r;
          if (m === i) break;
          const ta = a[m]; a[m] = a[i]; a[i] = ta;
          const tp = p[m]; p[m] = p[i]; p[i] = tp;
          i = m;
        }
      }
      return top;
    }
    get size() { return this.n; }
  }

  // Bộ nhớ đệm A* dùng lại cho mọi lần tìm đường trên cùng lưới: ô chỉ có giá trị khi stamp[k] === gen
  // (thay cho tạo + điền 3 mảng 22 500 ô mỗi lần gọi)
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let scratch = null;
  function scratchFor(N) {
    if (!scratch || scratch.N !== N) {
      scratch = { N, gen: 0, stamp: new Uint32Array(N), cost: new Float32Array(N), from: new Int32Array(N), closed: new Uint32Array(N), heap: new Heap() };
    }
    scratch.gen++;
    if (scratch.gen >= 0xffffffff) { scratch.stamp.fill(0); scratch.closed.fill(0); scratch.gen = 1; }
    scratch.heap.clear();
    return scratch;
  }

  /** Tìm đường cho `unit` tới (tx, tz). Trả về mảng điểm [{x,z}] (không gồm vị trí hiện tại) hoặc null */
  function findPath(terrain, unit, tx, tz, extra) {
    if (!terrain || !terrain.resolveVehicleCollision) return null;
    const G = baseGrid(terrain);
    const climb = climbOf(unit), wade = wadeOf(unit);
    if (lineClear(G, unit.x, unit.z, tx, tz, climb, extra, wade)) return [{ x: tx, z: tz }];
    let s = cellOf(G, unit.x, unit.z), g = cellOf(G, tx, tz);
    s = nearestFree(G, s[0], s[1], 3) || s;
    const gFree = nearestFree(G, g[0], g[1], 10);
    if (!gFree) return null;
    const goalMoved = gFree[0] !== g[0] || gFree[1] !== g[1];
    g = gFree;
    const N = G.nx * G.nz, start = s[1] * G.nx + s[0], goal = g[1] * G.nx + g[0];
    const SC = scratchFor(N), gen = SC.gen, stamp = SC.stamp, cost = SC.cost, from = SC.from, closed = SC.closed, H = SC.heap;
    const nx = G.nx, nz = G.nz, blocked = G.blocked, hgt = G.h, wd = G.wd, gi = g[0], gj = g[1];
    const hz = (k) => { const i = k % nx, j = (k / nx) | 0; const di = Math.abs(i - gi), dj = Math.abs(j - gj); return (Math.max(di, dj) + 0.414 * Math.min(di, dj)) * CELL; };
    const upMax = climb * 0.92, downMax = -Math.max(1.2, climb * 1.4);
    stamp[start] = gen; cost[start] = 0; from[start] = -1; H.push(start, hz(start));
    let found = false, iter = 0;
    while (H.size && iter++ < 60000) {
      const k = H.pop();
      if (closed[k] === gen) continue;
      closed[k] = gen;
      if (k === goal) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      const ck = cost[k], hk = hgt[k];
      for (let d = 0; d < 8; d++) {
        const D8 = DIRS[d], di = D8[0], dj = D8[1];
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        if (blocked[n] || closed[n] === gen || (extra && extra.has(n))) continue;
        // không cắt góc qua ô chặn
        if (di && dj && (blocked[j * nx + a] || blocked[b * nx + i])) continue;
        const len = D8[2] * CELL;
        const grade = (hgt[n] - hk) / len;
        if (grade > upMax) continue;             // dốc lên quá sức xe này
        if (grade < downMax) continue;           // vách hụt (mép kênh cứ điểm, vực): không lao xuống
        if (wd[n] > wade && wd[n] > wd[k]) continue;   // nước quá sâu với xe này (vẫn được lội ra chỗ nông hơn)
        // dốc lên tốn công: ưu tiên đường bằng nếu không phải vòng quá xa; lội nước chậm -> ưu tiên cầu / chỗ nông
        const c = ck + len * (1 + Math.max(0, grade) / climb * 1.6 + (wd[n] > 1 ? 0.6 + 1.4 * wd[n] / wade : 0));
        if (stamp[n] !== gen || c < cost[n]) { stamp[n] = gen; cost[n] = c; from[n] = k; H.push(n, c + hz(n)); }
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
      for (let t = pts.length - 1; t > idx; t--) if (lineClear(G, cx, cz, pts[t].x, pts[t].z, climb, extra, wade)) { far = t; break; }
      out.push(pts[far]);
      cx = pts[far].x; cz = pts[far].z; idx = far + 1;
    }
    return out;
  }

  // Điểm (x, z) nằm trong một trong hai vòng quay tối thiểu (trái / phải) của xe bánh lốp
  function insideTurnCircle(unit, pt) {
    const R = unit.turnRadius, a = unit.bodyAngle || 0;
    const lx = -Math.cos(a), lz = Math.sin(a);   // phía bên trái xe (chiều quay khi bodyAngle tăng)
    const R2 = R * R * 0.95;
    const d1 = (pt.x - unit.x - lx * R) ** 2 + (pt.z - unit.z - lz * R) ** 2;
    const d2 = (pt.x - unit.x + lx * R) ** 2 + (pt.z - unit.z + lz * R) ** 2;
    return d1 < R2 || d2 < R2;
  }

  /**
   * Bám đường: nav ={ tx, tz, path, idx, replanT, stuckT, lastD } (tự tạo). Trả về { dx, dz, arrived, dist }
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
      // Xe bánh lốp: điểm lọt trong vòng quay tối thiểu thì không lái thẳng vào được (sẽ chạy vòng quanh nó mãi)
      // -> nhắm luôn điểm kế tiếp nếu đường tới đó thông; không thì để xe tự lùi vòng cung lấy chỗ (SPGUnit3D.steerWheeled)
      if (unit.isWheeled && unit.turnRadius) {
        const G = baseGrid(terrain), climb = climbOf(unit);
        while (nav.idx < nav.path.length - 1 && insideTurnCircle(unit, nav.path[nav.idx]) &&
               lineClear(G, unit.x, unit.z, nav.path[nav.idx + 1].x, nav.path[nav.idx + 1].z, climb, nav.extra, wadeOf(unit))) nav.idx++;
      }
      p = nav.path[nav.idx];
    }
    const px = p ? p.x : tx, pz = p ? p.z : tz;
    const L = Math.hypot(px - unit.x, pz - unit.z) || 1;
    return { dx: (px - unit.x) / L, dz: (pz - unit.z) / L, arrived: false, dist: dGoal };
  }

  /**
   * Điểm xe `unit` đứng được gần (x, z) nhất: không trong nhà / đá / tường, không nước sâu quá lội,
   * không phải chóp / vách dốc mà xe không leo ra vào được (ít nhất 3 hướng quanh ô đi được).
   * Trả về { x, z, moved } (moved = đã dời khỏi điểm bấm) hoặc null nếu quanh đó không có chỗ nào.
   */
  function nearestDrivable(terrain, unit, x, z, maxR = 20) {
    if (!terrain || !terrain.resolveVehicleCollision) return { x, z, moved: false };
    const G = baseGrid(terrain), climb = climbOf(unit), wade = Math.min(WADE_DEPTH, wadeOf(unit));
    const deep = (cx, cz) => {
      const w = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(cx, cz) : null;
      return w !== null && w - terrain.getElevationAt(cx, cz) > wade;
    };
    const ok = (i, j) => {
      const k = j * G.nx + i;
      if (G.blocked[k]) return false;
      const c = centerOf(G, i, j);
      if (deep(c.x, c.z)) return false;
      let open = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= G.nx || b >= G.nz) continue;
        const n = b * G.nx + a;
        if (G.blocked[n]) continue;
        const gr = (G.h[n] - G.h[k]) / (Math.hypot(di, dj) * CELL);
        if (gr <= climb * 0.92 && gr >= -climb * 0.92) open++;
      }
      return open >= 3;
    };
    const [i0, j0] = cellOf(G, x, z);
    if (ok(i0, j0)) return { x, z, moved: false };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i0 + di, b = j0 + dj;
        if (a < 0 || b < 0 || a >= G.nx || b >= G.nz || !ok(a, b)) continue;
        const c = centerOf(G, a, b), d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) return { x: best.x, z: best.z, moved: true };
    }
    return null;
  }

  return { findPath, steer, invalidate, nearestDrivable, CELL };
})();

if (typeof window !== 'undefined') window.Navigator = Navigator;
if (typeof module !== 'undefined') module.exports = Navigator;
