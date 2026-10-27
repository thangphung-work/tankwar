/**
 * NÒNG PHÁO QUÉT / ĐẬP VÀO CẢNH VẬT (gọi mỗi khung từ spg.js sau khi đặt tư thế tháp / nòng)
 * Đoạn nòng (chốt nòng -> đầu nòng, lấy theo ma trận khung trước — không cập nhật lại cả mô hình xe) rải N điểm mẫu từ
 * ~1/4 chiều dài ra tới đầu nòng (phần sát chốt nằm trên nóc xe). Mỗi điểm có vận tốc (nội suy giữa vận tốc hai đầu
 * nòng), năng lượng cú đập E (J) và động lượng P (tấn x đv/s, cùng thang BREAK_P của cột đèn):
 *   · phần do cả xe lao tới: ~60% khối lượng xe (nòng truyền đà thân xe)
 *   · phần do tháp xoay / nòng nâng hạ: ~10% khối lượng xe (khối lượng hiệu dụng của tháp pháo quy về đầu nòng)
 * Từng hệ cảnh vật tự quyết theo sức chịu riêng (barrelSweep): rào đổ, bao cát bị gạt văng, cột đèn / cột điện gãy đổ,
 * thùng rác / thùng các-tông / túi rác bị hất văng, container móp, lon chai văng, cây non gãy, cây to rung rụng lá.
 * Chỉ chạm khi hình học thật chồng lấn: nòng xe tăng chủ lực cao ~2,1 m (hạ -6° đầu nòng còn ~1,3 m) -> rào thấp / bao
 * cát chỉ bị đập khi xe chúc mũi xuống dốc, đang trèo qua gờ hoặc vật nằm trên mô đất cao hơn.
 * Đơn vị thế giới: 8 = 1 m.
 */
const BarrelSweep = (() => {
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  // số điểm mẫu (nòng 57 đv -> cách nhau ~1,9 đv < 2 x RB: cột mảnh / nhịp rào mỏng không lọt giữa 2 điểm), điểm mẫu đầu
  // tiên (phần chiều dài nòng), bán kính nòng + khe chạm (đv)
  const N = 24, T0 = 0.22, RB = 1.1;
  const gameFx = () => { const g = typeof window !== 'undefined' && window.game; return g && g.effectsManager && g.effectsManager.fx || null; };

  // Lõi (phòng thử cảnh vật dùng trực tiếp): đoạn nòng a -> b (Vector3), vận tốc hai đầu va / vb (đv/s), khối lượng xe
  // mass (tấn), vận tốc thân xe (vvx, vvz). T: { propSet, streetscape: { junk }, trees }. Trả { x, y, z, mat, mB } | null
  function sweep(T, a, b, va, vb, mass, vvx, vvz, fx) {
    const pts = [], sv = Math.hypot(vvx, vvz);
    for (let k = 0; k < N; k++) {
      const t = T0 + (1 - T0) * k / (N - 1);
      const vx = va.x + (vb.x - va.x) * t, vy = va.y + (vb.y - va.y) * t, vz = va.z + (vb.z - va.z) * t;
      const s = Math.hypot(vx, vz);
      if (s < 1.5) continue;   // nòng đứng yên tì vào vật: không phá
      const sr = Math.hypot(vx - vvx, vy, vz - vvz);
      pts.push({
        x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, vx, vz, s,
        E: 500 * (mass * 0.6 * (sv / 8) * (sv / 8) + mass * 0.1 * (sr / 8) * (sr / 8)),
        P: mass * 0.6 * sv + mass * 0.1 * sr
      });
    }
    if (!pts.length) return null;
    const S = { pts, cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, R: Math.hypot(b.x - a.x, b.z - a.z) / 2 + 2, rb: RB, fx: fx || null, mass };
    let hit = null;
    if (T.propSet && T.propSet.barrelSweep) hit = T.propSet.barrelSweep(S) || hit;
    const J = T.streetscape && T.streetscape.junk;
    if (J && J.barrelSweep) hit = J.barrelSweep(S) || hit;
    if (T.trees && T.trees.barrelSweep) hit = T.trees.barrelSweep(S) || hit;
    return hit;
  }

  // Thân cây to mà cú vụt không bẻ gãy nổi chặn nòng như tường (VehicleCollision.barrelDepth, cùng cách chọn tư thế với
  // spg.applyWallBarrelBlock): tháp / nòng dừng ở tư thế khung trước; nòng nện vào thân thì tróc vỏ, gãy cành, cây vừa
  // tích hư hại (barrelWhack). Xe đang lao tới mà nòng tì vào thân cây (đổi tư thế tháp không gỡ được) thì xe bị chặn lại.
  // Eat(x, z): năng lượng cú vụt (J) tại điểm trên nòng gần (x, z) nhất (gần chốt nòng thì chậm, yếu hơn đầu nòng);
  // yaw0 / el0: tư thế tháp / nòng khung trước
  function blockByTrees(unit, T, a, b, Eat, yaw0, el0, vx, vz) {
    const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
    if (!VC || !VC.barrelDepth || !T.trees || !T.trees.barrelBoxes || !unit.turretGroup || !unit.barrelPivot || yaw0 === undefined) return false;
    const boxes = T.trees.barrelBoxes((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 4, Eat, []);
    if (!boxes.length) return false;
    const yaw = unit.turretGroup.rotation.y, el = unit.barrelPivot.rotation.x;
    const d = VC.barrelDepth(unit, yaw, el, boxes);
    if (d < 0.3) return false;
    // thân cây bị nện (hộp ngập sâu nhất)
    let best = null, bd = 0;
    for (const bx of boxes) { const dd = VC.barrelDepth(unit, yaw, el, [bx]); if (dd > bd) { bd = dd; best = bx; } }
    if (best) {
      const sl = Math.hypot(vx, vz), dx = sl > 1 ? vx : best.cx - a.x, dz = sl > 1 ? vz : best.cz - a.z;
      T.trees.barrelWhack(best.tree, Eat(best.cx, best.cz), best.cx, (a.y + b.y) / 2, best.cz, dx, dz, gameFx());
    }
    if (unit._netProxy) return true;
    const d0 = VC.barrelDepth(unit, yaw0, el0, boxes);
    if (d > d0 + 0.01) {
      let pick = [yaw0, el0];
      for (const c of [[yaw, el0], [yaw0, el]]) if (VC.barrelDepth(unit, c[0], c[1], boxes) <= Math.max(0.3, d0 + 0.01)) { pick = c; break; }
      unit.turretGroup.rotation.y = pick[0];
      if (unit._turretYaw !== undefined) unit._turretYaw = pick[0];
      unit.barrelPivot.rotation.x = pick[1];
      if (unit.elevation !== undefined) unit.elevation = pick[1] * 180 / Math.PI;
      if (unit.azimuth !== undefined) { const wa = -(pick[0] + (unit.bodyAngle || 0)) * 180 / Math.PI; unit.azimuth = ((wa % 360) + 360) % 360; }
      unit.barrelWallBlocked = true;
    } else {
      // thân xe dịch tới mà nòng đã tì vào thân cây (lùi tư thế tháp không gỡ được): thân cây gạt nòng lệch sang bên —
      // cơ cấu xoay tháp trượt, xe vẫn đi tiếp tới húc cây bằng thân. Kẹt giữa nhiều thân không gạt được thì xe khựng lại
      const sg = VC.barrelDepth(unit, yaw + 0.05, el, boxes) <= VC.barrelDepth(unit, yaw - 0.05, el, boxes) ? 1 : -1;
      let yy = null;
      for (const s of [0.05, 0.1, 0.18, 0.28, 0.4, 0.55]) {
        if (VC.barrelDepth(unit, yaw + sg * s, el, boxes) < 0.3) { yy = yaw + sg * s; break; }
        if (VC.barrelDepth(unit, yaw - sg * s, el, boxes) < 0.3) { yy = yaw - sg * s; break; }
      }
      if (yy !== null) {
        unit.turretGroup.rotation.y = yy;
        if (unit._turretYaw !== undefined) unit._turretYaw = yy;
        if (unit.azimuth !== undefined) { const wa = -(yy + (unit.bodyAngle || 0)) * 180 / Math.PI; unit.azimuth = ((wa % 360) + 360) % 360; }
        unit.barrelWallBlocked = true;
      } else if (unit.speed) unit.speed *= 0.25;
    }
    return true;
  }

  // NÒNG NỆN VÀO TƯỜNG / NHÀ (spg.applyWallBarrelBlock vừa chặn: unit.barrelWallHit = hộp tường) HOẶC BÊ TÔNG / Ụ ĐẤT CỨ ĐIỂM
  // (applyBarrelClearance: unit.barrelBlockedNow): tháp đang xoay / nòng đang nâng hạ thì dừng phắt ở mép vật cứng. Lần chạm
  // đầu có đà quét: ống nòng thép ngân + tiếng vật liệu tường (bê tông "chát", gạch vữa "bộp", tôn "boong", gỗ "cộc"), bụi
  // vữa / vụn bê tông phụt ra ở chỗ chạm (tôn / thép: tia lửa), xe mình rung nhẹ. Đè tì tiếp thì im (tháp đứng yên)
  // A / B: chốt nòng / đầu nòng (hình khung trước), vb: vận tốc đầu nòng khung trước (lúc lao vào tường)
  function knockWall(unit, T, st, A, B, vb) {
    const wb = unit.barrelWallHit || null, sh = !!unit.barrelBlockedNow;
    const newW = !!wb && !st.wb, newS = sh && !st.sh;
    st.wb = !!wb; st.sh = sh;
    if (!newW && !newS) return;
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    if (now - (st.knock || 0) < 0.35) return;
    // điểm chạm: điểm trên nòng gần mặt hộp tường nhất / đoạn nòng cắm vào bê tông cứ điểm (không có: ụ đất, sàn đất)
    let px = B.x, py = B.y, pz = B.z, tc = 1, mat = 'concrete', bd = Infinity;
    for (let i = 12; i >= 0; i--) {
      const t = 0.25 + 0.75 * i / 12, x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, z = A.z + (B.z - A.z) * t;
      if (newW) {
        const dx = x - wb.cx, dz = z - wb.cz;
        const dd = Math.max(0, Math.abs(dx * wb.ux + dz * wb.uz) - wb.hu) + Math.max(0, Math.abs(-dx * wb.uz + dz * wb.ux) - wb.hv) + Math.max(0, wb.y0 - y, y - wb.y1);
        if (dd < bd) { bd = dd; px = x; py = y; pz = z; tc = t; }
      } else if (T.strongholdSet && T.strongholdSet.concreteAt && T.strongholdSet.concreteAt(x, y + 1.2, z, 3)) { px = x; py = y; pz = z; tc = t; bd = 0; break; }
    }
    if (newW) mat = wb.mat || 'concrete';
    else if (bd > 0) mat = 'adobe';
    const vn = Math.hypot(vb.x, vb.y, vb.z) * tc;
    if (vn < 3) return;
    st.knock = now;
    const self = !!unit.isPlayer, pos = { x: px, y: py, z: pz };
    const S = typeof window !== 'undefined' && window.soundEngine;
    if (S && S.collideAt) S.collideAt(pos, { vn, mA: (unit.mass || 40) * 0.1, mB: Infinity, mat, self, yield: true, barrel: true, key: unit.id + '|bwall' });
    const g = typeof window !== 'undefined' && window.game;
    if (self && g) g.cameraShake = Math.max(g.cameraShake || 0, Math.min(2, vn / 25));
    const fx = gameFx();
    if (!fx) return;
    const metal = mat === 'metal' || mat === 'pole', R = Math.random;
    if (metal && fx.fire) {
      for (let q = 0; q < 4 + Math.min(8, vn / 6); q++) fx.fire.add({ x: px, y: py, z: pz, vx: (R() - 0.5) * 40, vy: 6 + R() * 25, vz: (R() - 0.5) * 40,
        size: 0.6 + R() * 0.7, grow: -0.3, drag: 0.9, grav: 90, life: 0.2 + R() * 0.25, alpha: 1, fadeIn: 0.005, c0: [1, 0.9, 0.6], c1: [1, 0.4, 0.1], cell: 3 });
    } else if (fx.smoke) {
      const col = mat === 'wood' || mat === 'tree' ? [0.42, 0.36, 0.24] : mat === 'adobe' ? [0.6, 0.5, 0.38] : [0.62, 0.6, 0.56];
      for (let q = 0; q < 3 + Math.min(6, vn / 8); q++) fx.smoke.add({ x: px + (R() - 0.5) * 2, y: py + (R() - 0.5) * 2, z: pz + (R() - 0.5) * 2, vx: (R() - 0.5) * 8 - vb.x * 0.08, vy: 1 + R() * 4, vz: (R() - 0.5) * 8 - vb.z * 0.08,
        size: 0.9 + R() * 1.1, grow: 2.2, drag: 2.5, grav: 2, life: 0.9 + R() * 0.8, alpha: 0.42, fadeIn: 0.02, c0: col, cell: 2 });
    }
  }

  // Mỗi khung cho 1 xe (kể cả xe bản sao mạng: đồ vật đổ như nhau trên mọi máy theo tư thế nòng nhìn thấy)
  // yaw0 / el0 (tuỳ chọn): tư thế tháp / nòng khung trước — có thì thân cây to chặn nòng
  function update(unit, T, dt, yaw0, el0) {
    if (!unit || unit.isDead || !T || !dt || dt > 0.25) return;
    const bp = unit.barrelPivot, bg = unit.barrelGroup, tip = unit.muzzleTipLocal;
    if (!bp || !bg || !tip) return;
    A.setFromMatrixPosition(bp.matrixWorld);
    B.copy(tip).applyMatrix4(bg.matrixWorld);
    const st = unit._bsw || (unit._bsw = { a: new THREE.Vector3(), b: new THREE.Vector3(), n: 0, snd: 0 });
    // ô tô đỗ: nòng / tháp xoay tì vào thì gạt ô tô trượt, tháp ì lại / dừng như chạm tường (props.js StreetSet.barrelCars)
    const SS = T.propSet && T.propSet.street;
    if (SS && SS.barrelCars) SS.barrelCars(unit, yaw0, el0, dt, A, B);
    // lần đầu / nhảy cóc (hồi sinh, dịch chuyển, mất khung dài): chỉ ghi lại tư thế
    if (st.n++ === 0 || A.distanceToSquared(st.a) > 2500) { st.a.copy(A); st.b.copy(B); return; }
    const va = { x: (A.x - st.a.x) / dt, y: (A.y - st.a.y) / dt, z: (A.z - st.a.z) / dt };
    const vb = { x: (B.x - st.b.x) / dt, y: (B.y - st.b.y) / dt, z: (B.z - st.b.z) / dt };
    st.a.copy(A); st.b.copy(B);
    knockWall(unit, T, st, A, B, vb);
    // nòng xuyên vách gỗ / tôn / kính nhà (không chặn tháp): xé thủng đúng chỗ nòng cắt qua
    if (T.buildingSet && T.buildingSet.barrelTear) T.buildingSet.barrelTear(A, B);
    const a = unit.bodyAngle || 0, sp = unit.speed || 0, m = unit.mass || 40, vvx = -Math.sin(a) * sp, vvz = -Math.cos(a) * sp;
    let hit = sweep(T, A, B, va, vb, m, vvx, vvz, gameFx());
    // năng lượng cú vụt tại điểm trên nòng gần thân cây (đà thân xe + tháp xoay) -> thân cây không bẻ gãy nổi thì chặn nòng
    const sv = Math.hypot(vvx, vvz), ex = B.x - A.x, ez = B.z - A.z, el2 = ex * ex + ez * ez || 1;
    const Eat = (x, z) => {
      const t = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / el2));
      const sr = Math.hypot(va.x + (vb.x - va.x) * t - vvx, va.y + (vb.y - va.y) * t, va.z + (vb.z - va.z) * t - vvz);
      return 500 * (m * 0.6 * (sv / 8) * (sv / 8) + m * 0.1 * (sr / 8) * (sr / 8));
    };
    if (blockByTrees(unit, T, A, B, Eat, yaw0, el0, vb.x, vb.z) && !hit) hit = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2, mat: 'tree', mB: 6 };
    // tiếng nòng thép nện vào vật (âm thanh vỡ / đổ của chính vật do hệ vật đó phát); mỗi xe tối đa ~4 lần / giây
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    if (hit && now - st.snd > 0.25) {
      st.snd = now;
      const S = typeof window !== 'undefined' && window.soundEngine;
      if (S && S.collideAt) S.collideAt({ x: hit.x, y: hit.y, z: hit.z }, { vn: Math.max(4, Math.hypot(vb.x, vb.z)), mA: (unit.mass || 40) * 0.1, mB: hit.mB || 1, mat: hit.mat || 'metal', self: !!unit.isPlayer, yield: true, barrel: true, key: unit.id + '|barrel|' + (hit.mat || '') });
    }
  }

  return { update, sweep };
})();
