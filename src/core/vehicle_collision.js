/**
 * VA CHẠM XE VỚI TƯỜNG / KHỐI BÊ TÔNG / NHÀ
 *
 * - Thân xe là hình hộp xoay theo hướng xe (đo trên mô hình 3D, không phải vòng tròn quanh tâm):
 *   chạm mặt tường thì dừng đúng ở mặt tường, húc chéo thì trượt dọc theo tường.
 * - Nòng pháo (theo hướng tháp + góc nâng) cũng là vật rắn: đầu nòng chạm tường là xe không tiến thêm
 *   theo hướng đó, và tháp không xoay / nòng không nâng hạ xuyên qua tường.
 * - Vật cản là danh sách hộp (mặt bằng xoay + khoảng cao y0..y1). Khối đã vỡ không còn trong danh sách,
 *   khối còn gốc thấp hơn gầm xe thì bỏ qua -> chỗ tường thủng / sập xe đi qua được.
 *
 * Hộp vật cản: { cx, cz, ux, uz (trục thứ nhất, đơn vị), hu (nửa dài theo u), hv (nửa dài theo trục vuông góc), y0, y1 }
 */
const VehicleCollision = (() => {
  const STEP = 2;          // bước di chuyển tối đa mỗi lần kiểm tra (tường dày 6.4 không bị "nhảy" qua)
  const BARREL_R = 1.4;    // bán kính nòng pháo
  const SKIN = 0.05;

  // Bậc đứng cao nhất xe trèo lên được (đơn vị game, 8 = 1 m): xe xích ~1.05 m (xe tăng thật 0.9-1.2 m),
  // xe bánh lốp (4x4 trinh sát, xe tải 6x6 pháo tự hành) ~0.55 m. Vật cản thấp hơn bậc này không chặn thân xe
  // mà thành mặt cho xích / bánh bò lên (xem debrisHeight / trackSupport)
  function stepOf(unit) {
    if (unit && unit.stepMax) return unit.stepMax;
    return unit && (unit.tankType === 'SCOUT' || unit.tankType === 'ARTILLERY') ? 4.5 : 8.5;
  }

  // Hộp thân xe (không tính nòng) trong hệ cục bộ của unit.group: dùng chung cách đo với cứ điểm
  function hullBox(unit) {
    if (typeof Strongholds !== 'undefined' && Strongholds.unitBox && unit.group) return Strongholds.unitBox(unit);
    return { minX: -16, maxX: 16, minY: 0, maxY: 28, minZ: -30, maxZ: 30 };
  }

  // Hình học nòng đo 1 lần / mô hình: gốc tháp O, chốt nòng P, vector chốt -> đầu nòng D (tháp 0°, nòng 0°), hệ unit.group
  function barrelRig(unit) {
    if (unit._vcRig && unit._vcRigGroup === unit.group) return unit._vcRig;
    let rig = null;
    if (unit.group && unit.turretGroup && unit.barrelPivot && unit.barrelGroup && unit.muzzleTipLocal) {
      const g = unit.group, rot = g.rotation.y, pos = g.position.clone();
      const ty = unit.turretGroup.rotation.y, el = unit.barrelPivot.rotation.x;
      g.rotation.y = 0; g.position.set(0, 0, 0);
      unit.turretGroup.rotation.y = 0; unit.barrelPivot.rotation.x = 0;
      g.updateMatrixWorld(true);
      const O = unit.turretGroup.getWorldPosition(new THREE.Vector3());
      const P = unit.barrelPivot.getWorldPosition(new THREE.Vector3());
      const T = unit.barrelGroup.localToWorld(unit.muzzleTipLocal.clone());
      g.rotation.y = rot; g.position.copy(pos);
      unit.turretGroup.rotation.y = ty; unit.barrelPivot.rotation.x = el;
      g.updateMatrixWorld(true);
      rig = { ox: O.x, oy: O.y, oz: O.z, px: P.x - O.x, py: P.y - O.y, pz: P.z - O.z, dx: T.x - P.x, dy: T.y - P.y, dz: T.z - P.z };
      rig.reach = Math.hypot(O.x, O.z) + Math.hypot(rig.px, rig.pz) + Math.hypot(rig.dx, rig.dy, rig.dz);
    }
    unit._vcRig = rig; unit._vcRigGroup = unit.group;
    return rig;
  }

  // Tầm với lớn nhất tính từ tâm xe (thân hoặc nòng) — để lọc thô vật cản ở gần
  function reach(unit) {
    const B = hullBox(unit), rig = barrelRig(unit);
    const hull = Math.hypot(Math.max(-B.minX, B.maxX), Math.max(-B.minZ, B.maxZ));
    return Math.max(hull, rig ? rig.reach : 0) + 4;
  }

  // Nòng pháo trong thế giới khi xe ở (x, y, z) hướng thân `ang`, tháp lệch `yaw` (so với thân), nòng nâng `el` (rad)
  function barrelSegment(unit, x, y, z, ang, yaw, el, out) {
    const r = barrelRig(unit);
    if (!r) return null;
    // nâng nòng: quay vector chốt -> đầu nòng quanh trục X của chốt nòng
    const ce = Math.cos(el), se = Math.sin(el);
    let dx = r.dx, dy = r.dy * ce - r.dz * se, dz = r.dy * se + r.dz * ce;
    // xoay tháp quanh trục Y (cả chốt nòng lẫn nòng)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const px = r.px * cy + r.pz * sy, pz = -r.px * sy + r.pz * cy;
    const ddx = dx * cy + dz * sy, ddz = -dx * sy + dz * cy;
    // về thế giới theo hướng thân xe
    const lx0 = r.ox + px, lz0 = r.oz + pz, ly0 = r.oy + r.py;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const o = out || {};
    o.x0 = x + lx0 * ca + lz0 * sa; o.z0 = z - lx0 * sa + lz0 * ca; o.y0 = y + ly0;
    const lx1 = lx0 + ddx, lz1 = lz0 + ddz;
    o.x1 = x + lx1 * ca + lz1 * sa; o.z1 = z - lx1 * sa + lz1 * ca; o.y1 = o.y0 + dy;
    return o;
  }

  // SAT hai hình chữ nhật xoay (mặt bằng). Trả về vector đẩy A ra khỏi B {x, z, d} hoặc null.
  // `out`: ghi vào object có sẵn (không cấp phát mỗi lần gọi); bỏ trống thì tạo object mới
  const AXES = new Float64Array(8);
  function obbPush(acx, acz, aux, auz, ahu, ahv, b, out) {
    const axes = AXES;
    axes[0] = aux; axes[1] = auz; axes[2] = -auz; axes[3] = aux;
    axes[4] = b.ux; axes[5] = b.uz; axes[6] = -b.uz; axes[7] = b.ux;
    const bvx = -b.uz, bvz = b.ux, avx = -auz, avz = aux;
    const tx = b.cx - acx, tz = b.cz - acz;
    let best = Infinity, nx = 0, nz = 0;
    for (let i = 0; i < 8; i += 2) {
      const ax = axes[i], az = axes[i + 1];
      const ra = ahu * Math.abs(aux * ax + auz * az) + ahv * Math.abs(avx * ax + avz * az);
      const rb = b.hu * Math.abs(b.ux * ax + b.uz * az) + b.hv * Math.abs(bvx * ax + bvz * az);
      const dist = tx * ax + tz * az;
      const ov = ra + rb - Math.abs(dist);
      if (ov <= 0) return null;
      if (ov < best) { best = ov; const s = dist > 0 ? -1 : 1; nx = ax * s; nz = az * s; }
    }
    const o = out || {};
    o.x = nx * best; o.z = nz * best; o.d = best;
    return o;
  }

  // Ô nhớ tạm cho hullPush / barrelPush (kết quả chỉ dùng ngay trong lượt resolve, không giữ qua lần gọi sau)
  const _pTmp = { x: 0, z: 0, d: 0 }, _hullBest = { x: 0, z: 0, d: 0 }, _barBest = { x: 0, z: 0, d: 0 };
  function keepDeeper(p, best, slot) {
    if (!p || (best && p.d <= best.d)) return best;
    slot.x = p.x; slot.z = p.z; slot.d = p.d;
    return slot;
  }

  // Thân xe tại (x, z) chồng lên hộp nào sâu nhất -> vector đẩy
  function hullPush(unit, B, x, y, z, ang, boxes) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ux = ca, uz = -sa;                         // trục ngang (local X) của xe trong thế giới
    const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
    const cx = x + lcx * ca + lcz * sa, cz = z - lcx * sa + lcz * ca;
    const hu = (B.maxX - B.minX) / 2, hv = (B.maxZ - B.minZ) / 2;
    const bot = y + Math.max(B.minY, 0) + stepOf(unit), top = y + B.maxY;
    let best = null;
    for (const b of boxes) {
      if (b.y1 <= bot || b.y0 >= top) continue;
      best = keepDeeper(obbPush(cx, cz, ux, uz, hu, hv, b, _pTmp), best, _hullBest);
    }
    return best;
  }

  // Nòng pháo (đoạn thẳng có bề dày) chồng lên hộp nào sâu nhất -> vector đẩy (cho xe) / độ ngập
  function barrelPush(seg, boxes) {
    if (!seg) return null;
    let best = null;
    for (const b of boxes) {
      // cắt nòng theo khoảng cao của hộp (nòng nghiêng: chỉ phần nằm trong dải cao đó mới chạm)
      const lo = b.y0 - BARREL_R, hi = b.y1 + BARREL_R, dy = seg.y1 - seg.y0;
      let t0 = 0, t1 = 1;
      if (Math.abs(dy) < 1e-6) { if (seg.y0 <= lo || seg.y0 >= hi) continue; }
      else {
        let a = (lo - seg.y0) / dy, c = (hi - seg.y0) / dy;
        if (a > c) { const k = a; a = c; c = k; }
        t0 = Math.max(0, a); t1 = Math.min(1, c);
        if (t1 <= t0) continue;
      }
      const ax = seg.x0 + (seg.x1 - seg.x0) * t0, az = seg.z0 + (seg.z1 - seg.z0) * t0;
      const bx = seg.x0 + (seg.x1 - seg.x0) * t1, bz = seg.z0 + (seg.z1 - seg.z0) * t1;
      const L = Math.hypot(bx - ax, bz - az);
      const ux = L > 1e-4 ? (bx - ax) / L : 1, uz = L > 1e-4 ? (bz - az) / L : 0;
      best = keepDeeper(obbPush((ax + bx) / 2, (az + bz) / 2, ux, uz, L / 2 + BARREL_R * 0.5, BARREL_R, b, _pTmp), best, _barBest);
    }
    return best;
  }

  function turretPose(unit) {
    return {
      yaw: unit.turretGroup ? unit.turretGroup.rotation.y : (unit._turretYaw || 0),
      el: unit.barrelPivot ? unit.barrelPivot.rotation.x : 0
    };
  }

  /**
   * Di chuyển xe từ (x0, z0) tới (x1, z1) giữa các hộp vật cản: chia nhỏ bước, đẩy thân + nòng ra khỏi vật cản
   * (chỉ khử thành phần đâm vào mặt tường -> xe trượt dọc theo tường). Trả về {x, z, hit}
   */
  function resolve(unit, x0, z0, x1, z1, boxes) {
    if (!unit || !boxes || !boxes.length) return { x: x1, z: z1, hit: false };
    const B = hullBox(unit);
    const ang = unit.bodyAngle || 0, y = unit.y || 0;
    const tp = turretPose(unit);
    const seg = {};
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / STEP));
    let x = x0, z = z0, hit = false;
    for (let s = 1; s <= n; s++) {
      x += (x1 - x0) / n; z += (z1 - z0) / n;
      for (let it = 0; it < 4; it++) {
        let p = hullPush(unit, B, x, y, z, ang, boxes);
        const bp = barrelPush(barrelSegment(unit, x, y, z, ang, tp.yaw, tp.el, seg), boxes);
        if (bp && (!p || bp.d > p.d)) p = bp;
        if (!p) break;
        const k = (p.d + SKIN) / p.d;
        x += p.x * k; z += p.z * k;
        hit = true;
      }
    }
    return { x, z, hit };
  }

  // Độ ngập sâu nhất của nòng vào vật cản ở tư thế tháp `yaw`, nòng `el` (0 nếu không chạm)
  function barrelDepth(unit, yaw, el, boxes) {
    if (!boxes || !boxes.length) return 0;
    const p = barrelPush(barrelSegment(unit, unit.x, unit.y || 0, unit.z, unit.bodyAngle || 0, yaw, el, {}), boxes);
    return p ? p.d : 0;
  }

  // Hộp vật cản từ khối bê tông của BlockStructure (Destructibles) — khối đã vỡ bị loại; gốc gãy giữ chiều cao còn lại
  function blockBoxes(S, yOff, out) {
    const list = out || [];
    if (!S || !S.blocks) return list;
    for (const q of S.blocks) {
      if (!q.alive) continue;
      list.push({ cx: q.x, cz: q.z, ux: q.ax, uz: q.az, hu: q.len / 2, hv: q.thick / 2, y0: q.y0 + yOff, y1: q.y1 + yOff });
    }
    return list;
  }

  // ---------------------------------------------------------------------------
  // MẶT ĐỔ NÁT CHO XÍCH / BÁNH BÒ LÊN
  // Nguồn đổ nát (danh sách `list`, gom bởi terrain.vehicleDebris):
  //  - lưới độ cao { grid: true, ox, oy, oz, ca, sa, cx, cz, LX, LZ, nx, nz, arr }: mặt đống đổ nát nhà sập / đống gạch
  //    chân tường (PlaneGeometry nằm ngang trong nhóm đặt ở (ox, oy, oz) quay `angle`; arr = mảng đỉnh đang hiển thị)
  //  - hộp { cx, cz, ux, uz, hu, hv, y0, y1 }: gốc tường gãy / khối bê tông thấp — chỉ thành bậc khi đỉnh hộp
  //    thấp hơn gầm xe + bậc leo được (cao hơn thì vẫn là tường, hullPush chặn)
  //  - ụ gạch vụn { bump: true, x, z, r, top }: cục bê tông vỡ rơi dưới chân tường (vòm tròn)
  // ---------------------------------------------------------------------------
  function gridHeight(G, x, z) {
    const dx = x - G.ox, dz = z - G.oz;
    const lx = dx * G.ca - dz * G.sa - G.cx + G.LX / 2, lz = dx * G.sa + dz * G.ca - G.cz + G.LZ / 2;
    if (lx < 0 || lz < 0 || lx >= G.LX || lz >= G.LZ) return -Infinity;
    const fx = lx / G.LX * G.nx, fz = lz / G.LZ * G.nz;
    const ix = Math.min(G.nx - 1, fx | 0), iz = Math.min(G.nz - 1, fz | 0), tx = fx - ix, tz = fz - iz;
    const row = G.nx + 1, a = G.arr, i0 = (iz * row + ix) * 3 + 1, i1 = i0 + row * 3;
    const h0 = a[i0] + (a[i0 + 3] - a[i0]) * tx, h1 = a[i1] + (a[i1 + 3] - a[i1]) * tx;
    return G.oy + h0 + (h1 - h0) * tz;
  }
  function debrisHeight(list, x, z, refY, step, outMat) {
    let h = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.grid) { const g = gridHeight(d, x, z); if (g > h) h = g; continue; }
      if (d.bump) {
        const ex = x - d.x, ez = z - d.z, q = 1 - (ex * ex + ez * ez) / (d.r * d.r);
        if (q > 0) { const g = d.base + (d.top - d.base) * Math.sqrt(q); if (g > h) { h = g; if (d.mat && outMat) outMat.mat = d.mat; } }
        continue;
      }
      if (d.ridge) {
        // thân cây nằm: gờ tròn dọc đoạn a -> b, bán kính & đỉnh nhỏ dần về phía ngọn. Khúc to hơn bậc leo của xe
        // không thành mặt đỡ (bánh / xích không bò lên nổi) — nó chặn xe như vật cản (TreeField.vehicleBoxes)
        if (d.ta > refY + step + 1 && d.tb > refY + step + 1) continue;
        const sx = d.bx - d.ax, sz = d.bz - d.az, L2 = sx * sx + sz * sz || 1;
        const t = Math.max(0, Math.min(1, ((x - d.ax) * sx + (z - d.az) * sz) / L2));
        const ex = x - d.ax - sx * t, ez = z - d.az - sz * t, r = d.ra + (d.rb - d.ra) * t, q = 1 - (ex * ex + ez * ez) / (r * r);
        if (q > 0) { const g = d.ta + (d.tb - d.ta) * t - r * (1 - Math.sqrt(q)); if (g > h) { h = g; if (outMat) outMat.mat = 'wood'; } }
        continue;
      }
      if (d.y1 <= h || d.y1 > refY + step + 1 || d.y0 > refY + step) continue;
      const tx = x - d.cx, tz = z - d.cz;
      if (Math.abs(tx * d.ux + tz * d.uz) <= d.hu && Math.abs(-tx * d.uz + tz * d.ux) <= d.hv) h = d.y1;
    }
    return h;
  }

  // Đường đỡ của một dải xích cứng trên mặt mấp mô: bao lồi phía trên của các điểm (s, h) dọc dải xích,
  // xe tì trên đoạn bao lồi chứa trọng tâm (s = 0) -> leo bậc thì mũi ngóc lên, qua mép bậc thì chúc xuống (bập bênh)
  function upperSupport(S, H, n, out) {
    const st = out.st || (out.st = new Int32Array(32));
    let m = 0;
    for (let i = 0; i < n; i++) {
      while (m >= 2) {
        const a = st[m - 2], b = st[m - 1];
        if ((S[b] - S[a]) * (H[i] - H[a]) - (H[b] - H[a]) * (S[i] - S[a]) >= 0) m--; else break;
      }
      st[m++] = i;
    }
    for (let k = 0; k < m - 1; k++) {
      const a = st[k], b = st[k + 1];
      if (S[b] >= 0 || k === m - 2) {
        const sl = (H[b] - H[a]) / (S[b] - S[a]);
        out.y = H[a] + sl * (0 - S[a]); out.sl = sl;
        return out;
      }
    }
    out.y = H[st[0]]; out.sl = 0;
    return out;
  }

  /**
   * Điểm tì của xe trên mặt đất + đống đổ nát: lấy mẫu dọc 2 dải xích (cách nhau 28), mỗi dải tìm đường đỡ.
   * Trả về { front, rear, left, right, center, g0 (mặt đất trơn tại tâm), lift (độ nhô lên trên đống), slope }:
   * front / rear ở ±18 theo hướng xe, left / right ở ±14 sang hai bên — khớp cách spg.js tính độ chúc / nghiêng.
   */
  function trackSupport(unit, x, z, ang, groundAt, list, refY, out) {
    const o = out || {};
    const B = hullBox(unit), step = stepOf(unit);
    const sf = Math.min(30, -B.minZ - 2), sr = Math.min(30, B.maxZ - 2);   // mũi xe theo -Z cục bộ
    const n = Math.max(5, Math.min(31, Math.ceil((sf + sr) / 4.5) + 1));
    const fx = -Math.sin(ang), fz = -Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    const S = o.S || (o.S = new Float32Array(32)), H = o.H || (o.H = new Float32Array(32));
    const sup = o.sup || (o.sup = {});
    let yl = 0, yr = 0, sl = 0, lift = 0, touchedMat = null;
    const g0 = groundAt(x, z);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < n; i++) {
        const s = -sr + (sf + sr) * i / (n - 1);
        const px = x + fx * s + rx * side * 14, pz = z + fz * s + rz * side * 14;
        const matHolder = { mat: null }; const g = groundAt(px, pz), d = debrisHeight(list, px, pz, refY, step, matHolder); if (matHolder.mat) touchedMat = matHolder.mat;
        S[i] = s; H[i] = d > g ? d : g;
        if (d - g > lift) lift = d - g;
      }
      upperSupport(S, H, n, sup);
      if (side < 0) yl = sup.y; else yr = sup.y;
      sl += sup.sl * 0.5;
    }
    const c = (yl + yr) / 2;
    o.center = c; o.left = yl; o.right = yr; o.slope = sl;
    o.front = c + sl * 18; o.rear = c - sl * 18;
    o.g0 = g0; o.lift = lift; o.mat = touchedMat;
    return o;
  }

  // Gốc tường gãy / khối thấp + ụ gạch vụn của một BlockStructure gần (x, z) -> nguồn đổ nát cho debrisHeight
  function blockDebris(S, yOff, x, z, r, out) {
    if (!S || !S.blocks) return out;
    for (const q of S.blocks) {
      if (!q.alive) continue;
      const m = r + q.len;
      if (Math.abs(q.x - x) > m || Math.abs(q.z - z) > m) continue;
      out.push({ cx: q.x, cz: q.z, ux: q.ax, uz: q.az, hu: q.len / 2, hv: q.thick / 2, y0: q.y0 + yOff, y1: q.y1 + yOff });
    }
    if (S.debrisBumps) for (const b of S.debrisBumps) {
      if (Math.abs(b.x - x) > r + b.r || Math.abs(b.z - z) > r + b.r) continue;
      out.push({ bump: true, x: b.x, z: b.z, r: b.r, base: b.base + yOff, top: b.top + yOff });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // HÚC VẬT CÓ SỨC CHỊU (cây, tường rào, xác xe) — đơn vị SI: tấn -> kg, đv/s -> m/s (8 đv = 1 m)
  // Lực xe dồn lên vật = lực kéo bám đất (μ·m·g: xe 60 tấn ~410 kN, 4x4 10 tấn ~60 kN) + lực va (động lượng theo
  // pháp tuyến tiêu hết trong ~0,5 s vật oằn / gãy). impact: phần động lượng thành lực phá — mũi xe xích bọc thép dày = 1,
  // đầu xe tải / 4x4 móp trước nên nhỏ hơn
  // ---------------------------------------------------------------------------
  const G_SI = 9.81, UNIT_M = 8, RAM_T = 0.5;
  function tractive(unit) { return (unit.isWheeled ? 0.6 : 0.7) * (unit.mass || 40) * 1000 * G_SI; }
  function ramForce(unit, vn, impact) {
    const Fi = vn > 0 ? (unit.mass || 40) * 1000 * (vn / UNIT_M) / RAM_T * (impact === undefined ? 1 : impact) : 0;
    return tractive(unit) + Fi;
  }
  // Tốc độ lăn thật / unit.speed (bùn, dốc, đống đổ nát: spg.js _terrainMul) — đà thật của xe tính theo tốc độ lăn thật
  function rollMul(unit) { const m = unit._terrainMul; return m > 0 && m < 1.5 ? m : 1; }
  // Tốc độ (unit.speed, giữ dấu) còn lại sau khi tiêu năng lượng E (J) để phá vật có lực chịu F (N). Lực kéo đã đủ phá vật
  // (xe tì ép đổ): phần lớn công phá do động cơ đang đẩy làm, đà xe chỉ hụt ~1/3 — xe tăng bò chậm không khựng đứng ở
  // mỗi nhịp tường; phải nhờ đà mới phá được (húc) thì đà trả trọn E
  function speedAfter(unit, speed, E, F) {
    if (F !== undefined && tractive(unit) >= F) E *= 0.35;
    const k = rollMul(unit), v = Math.abs(speed) * k / UNIT_M, v2 = v * v - 2 * E / ((unit.mass || 40) * 1000);
    return Math.sign(speed) * (v2 > 0 ? Math.sqrt(v2) : 0) * UNIT_M / k;
  }
  // Hộp thân xe trong thế giới khi tâm ở (x, z), hướng ang (như spgVehObb ở spg.js)
  function vehObb(unit, x, z, ang, out) {
    const B = hullBox(unit), ca = Math.cos(ang), sa = Math.sin(ang), o = out || {};
    const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
    o.cx = x + lcx * ca + lcz * sa; o.cz = z - lcx * sa + lcz * ca; o.ux = ca; o.uz = -sa;
    o.hu = (B.maxX - B.minX) / 2; o.hv = (B.maxZ - B.minZ) / 2;
    return o;
  }
  // Vòng tròn (cx, cz, r) với hộp o: gap < 0 là chồng vào nhau; (nx, nz): pháp tuyến từ vật ra phía xe
  function circleGap(o, cx, cz, r, out) {
    const res = out || {};
    const tx = cx - o.cx, tz = cz - o.cz, lu = tx * o.ux + tz * o.uz, lv = -tx * o.uz + tz * o.ux;
    const cu = lu < -o.hu ? -o.hu : lu > o.hu ? o.hu : lu, cv = lv < -o.hv ? -o.hv : lv > o.hv ? o.hv : lv;
    if (cu === lu && cv === lv) {
      // tâm vật nằm trong hộp: đẩy ra theo mặt hộp gần nhất
      const eu = o.hu - Math.abs(lu), ev = o.hv - Math.abs(lv);
      if (eu < ev) { const s = lu >= 0 ? -1 : 1; res.nx = s * o.ux; res.nz = s * o.uz; res.gap = -(eu + r); }
      else { const s = lv >= 0 ? -1 : 1; res.nx = -s * o.uz; res.nz = s * o.ux; res.gap = -(ev + r); }
      return res;
    }
    const dx = o.cx + cu * o.ux - cv * o.uz - cx, dz = o.cz + cu * o.uz + cv * o.ux - cz, d = Math.hypot(dx, dz) || 1e-6;
    res.nx = dx / d; res.nz = dz / d; res.gap = d - r;
    return res;
  }
  // Tốc độ lăn thật của xe áp vào vật theo pháp tuyến n (từ vật ra phía xe), đv/s; <= 0: đang lùi xa / trượt ngang
  function approach(unit, nx, nz) {
    const a = unit.bodyAngle || 0, sp = (unit.speed || 0) * rollMul(unit);
    return (Math.sin(a) * nx + Math.cos(a) * nz) * sp;
  }

  return { resolve, barrelDepth, barrelSegment, blockBoxes, blockDebris, debrisHeight, trackSupport, stepOf, hullBox, reach, obbPush,
    tractive, ramForce, speedAfter, vehObb, circleGap, approach };
})();

if (typeof window !== 'undefined') window.VehicleCollision = VehicleCollision;
