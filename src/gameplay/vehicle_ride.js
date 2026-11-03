/**
 * LÍNH ĐI NHỜ XE ĐỒNG MINH: bảng chỗ ngồi theo từng xe.
 * Toạ độ trong chassisGroup của xe (y = mặt ngồi, mũi xe -Z), h = hướng mặt so với mũi xe (+ = quay trái), o = phía nhảy xuống (+1 phải, -1 trái).
 * in = ngồi trong khoang: không thấy hình, không trúng đạn trực tiếp, không bắn được; xe nổ thì chết theo.
 * g = điểm tay bám khi xe chạy (vật gắn liền thân xe, không dùng đồ trên tháp vì tháp quay), l = độ nghiêng người về phía tay đó (rad) để với tới.
 */
const VehicleRide = (() => {
  const L = Math.PI / 2, R = -Math.PI / 2;
  const SEATS = {
    // xe tăng: không có khoang chở, 4 lính trên sàn động cơ sau tháp, chân thả xuống váy xích, tay nắm vòng cẩu trên sàn (x ±12,2, z 9 / 16,2)
    ALL_ROUNDER: [{ x: -12.2, y: 12.8, z: 12, h: L, o: -1, g: [-12.2, 13.3, 9], l: 0.55 }, { x: 12.2, y: 12.8, z: 12, h: R, o: 1, g: [12.2, 13.3, 9], l: 0.55 }, { x: -12.2, y: 12.8, z: 19, h: L, o: -1, g: [-12.2, 13.3, 16.2], l: 0.55 }, { x: 12.2, y: 12.8, z: 19, h: R, o: 1, g: [12.2, 13.3, 16.2], l: 0.55 }],
    // xe chi viện hoả lực: động cơ đặt trước nên có khoang sau chở 2, thêm 2 chỗ ngồi lên thùng đồ dọc nóc sau, tay bám mép thùng
    GATLING: [{ in: 1, x: -5, y: 8, z: 20, h: L, o: -1 }, { in: 1, x: 5, y: 8, z: 20, h: R, o: 1 }, { x: -12.6, y: 16.4, z: 20.6, h: L, o: -1, g: [-11.9, 16.5, 23.4], l: 0.35 }, { x: 12.6, y: 16.4, z: 20.6, h: R, o: 1, g: [11.9, 16.5, 23.4], l: 0.35 }],
    // pháo tự hành xe tải: 2 chỗ trong cabin, 2 chỗ trên sàn giữa cabin và tháp; không có gì để nắm trong tầm với nên chống tay lên sàn
    ARTILLERY: [{ in: 1, x: -4, y: 12, z: -24, h: 0, o: -1 }, { in: 1, x: 4, y: 12, z: -24, h: 0, o: 1 }, { x: -8.4, y: 12.4, z: 2, h: L, o: -1, g: [-8.2, 12.7, 4.8], l: 0.55 }, { x: 8.4, y: 12.4, z: 2, h: R, o: 1, g: [8.2, 12.7, 4.8], l: 0.55 }],
    // xe trinh sát: 2 ghế sau trong cabin, 2 chỗ trên nóc trước đầu lan can (ngồi lùi hơn thì đùi xuyên lan can), tay nắm cột lan can
    SCOUT: [{ in: 1, x: -4, y: 8, z: 7, h: 0, o: -1 }, { in: 1, x: 4, y: 8, z: 7, h: 0, o: 1 }, { x: -5.6, y: 15.4, z: 5, h: L, o: -1, g: [-6.4, 16.6, 7], l: 0.12 }, { x: 5.6, y: 15.4, z: 5, h: R, o: 1, g: [6.4, 16.6, 7], l: 0.12 }]
  };
  // Dáng chân + thân lúc trèo (góc khớp theo animateMotion, rad)
  const P = (lH, lK, lA, rH, rK, rA, tRx, chRx, hRx) => ({ lH, lK, lA, rH, rK, rA, tRx, chRx, hRx, lHz: 0, rHz: 0 });
  const POSE = {
    reach: P(0.3, 0.6, 0.1, 0.3, 0.6, 0.1, -0.35, -0.1, 0.25),      // đứng sát xe, khuỵu nhẹ, hai tay vươn bám mép
    pull: P(0.15, 0.55, -0.4, 1.55, 2.05, 0.15, -0.85, -0.2, 0.45), // chân phải đạp lên, chân trái duỗi đẩy, người đổ tới
    top: P(1.2, 2.15, -0.3, 1.05, 2.1, -0.3, -0.5, -0.1, 0.3),      // đã lên sàn: quỳ chống
    land: P(0.85, 1.5, 0.45, 0.85, 1.5, 0.45, -0.3, -0.05, 0.15),   // tiếp đất: khuỵu gối hấp thụ
    duck: P(1.4, 1.5, 0.15, 1.4, 1.5, 0.15, -0.75, -0.55, 0.65)     // nòng quét qua: gập người tới, cổ ngẩng nhìn nòng (chân do tư thế ngồi lo)
  };
  const KEYS = Object.keys(POSE.reach), sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const TIME = { upOut: 1.5, upIn: 1.0, downOut: 1.0, downIn: 0.8 };
  const lerp3 = (f, a, b, u) => { f.x = a[0] + (b[0] - a[0]) * u; f.y = a[1] + (b[1] - a[1]) * u; f.z = a[2] + (b[2] - a[2]) * u; };
  const blend = (f, A, B, u) => { for (const k of KEYS) f.pose[k] = A[k] + (B[k] - A[k]) * u; };
  /**
   * Khung động tác ở tiến độ R.k (1 = đang ngồi; xuống thì k chạy 1 -> 0).
   * f.x,y,z: chân lính trong hệ xe (R.hu = nửa rộng thân xe). f.drop != null: đang rơi tới R.from (toạ độ thế giới), u = f.drop.
   * f.k: mức dáng f.pose; f.handK: mức tay bám điểm f.hands; f.face: hướng mặt so với mũi xe; f.sit: ngồi; f.walk: bước đi.
   */
  function frame(R, f) {
    const S = R.seat, o = S.o, inF = o < 0 ? -L : L, hu = R.hu;
    f.face = null; f.sit = false; f.walk = false; f.k = 0; f.handK = 0; f.drop = null;
    f.pose = f.pose || {};
    if (R.dir > 0 && R.k >= 1) {
      // nòng quét qua (R.duck 0..1, R.duckD: tụt bao nhiêu đv): trượt qua mép, hai tay bám mép, người hạ dưới đường nòng
      const d = sm(R.duck || 0), edge = S.x + o * 1.9;
      f.x = S.x + o * 2.2 * d; f.y = S.y - (R.duckD || 0) * d; f.z = S.z; f.sit = true;
      if (d > 0) {
        f.k = d; f.handK = d; blend(f, POSE.duck, POSE.duck, 0);
        f.hands = f.hands || [{}, {}];
        setHand(f.hands[0], edge, S.y + 0.3, S.z - o * 1.7); setHand(f.hands[1], edge, S.y + 0.3, S.z + o * 1.7);
      }
      return f;
    }
    if (R.dir < 0) {
      const t = 1 - R.k, E = [S.x + o * 1.7, S.y, S.z];
      f.face = -inF;
      if (R.abort) { f.drop = t; f.k = 0.7; blend(f, POSE.land, POSE.land, 0); return f; }
      if (R.inside) {
        const D = [o * (hu + 0.5), 5.5, S.z];
        f.x = D[0]; f.y = D[1]; f.z = D[2];
        if (t < 0.3) { f.k = 1; blend(f, POSE.pull, POSE.land, t / 0.3); }
        else if (t < 0.7) { f.drop = sm((t - 0.3) / 0.4); f.k = 0.6; blend(f, POSE.land, POSE.land, 0); }
        else { f.drop = 1; f.k = 1 - sm((t - 0.7) / 0.3); blend(f, POSE.land, POSE.land, 0); }
        return f;
      }
      if (t < 0.22) { lerp3(f, [S.x, S.y, S.z], E, sm(t / 0.22)); f.sit = t < 0.13; return f; }
      f.x = E[0]; f.y = E[1]; f.z = E[2];
      blend(f, POSE.land, POSE.land, 0);
      if (t < 0.66) { f.drop = (t - 0.22) / 0.44; f.k = 0.55; }
      else { f.drop = 1; f.k = 1 - sm((t - 0.66) / 0.34); }
      return f;
    }
    const t = R.k, Fr = R.fromL, G = [o * (hu + (R.inside ? 2.5 : 3)), 0, S.z];
    f.face = inF;
    if (R.inside) {
      const D = [o * (hu + 0.5), 5.5, S.z];
      f.hands = f.hands || [{}, {}];
      setHand(f.hands[0], o * (hu - 0.2), 11, S.z + o * 1.2); setHand(f.hands[1], o * (hu - 0.2), 9, S.z - o * 1.2);
      if (t < 0.4) { lerp3(f, Fr, G, sm(t / 0.4)); f.walk = true; }
      else if (t < 0.6) { const u = (t - 0.4) / 0.2; f.x = G[0]; f.y = 0; f.z = G[2]; f.k = u; f.handK = u; blend(f, POSE.reach, POSE.reach, 0); }
      else { const u = sm((t - 0.6) / 0.4); lerp3(f, G, D, u); f.k = 1; f.handK = 1; blend(f, POSE.reach, POSE.pull, u); }
      return f;
    }
    const edge = S.x + o * 1.9, A = [o * (hu + 1), S.y * 0.55, S.z], T = [edge - o * 1.2, S.y, S.z];
    f.hands = f.hands || [{}, {}];
    setHand(f.hands[0], edge, S.y + 0.3, S.z + o * 1.7); setHand(f.hands[1], edge, S.y + 0.3, S.z - o * 1.7);
    if (t < 0.16) { lerp3(f, Fr, G, sm(t / 0.16)); f.walk = true; }
    else if (t < 0.3) { const u = (t - 0.16) / 0.14; f.x = G[0]; f.y = 0; f.z = G[2]; f.k = u; f.handK = u; blend(f, POSE.reach, POSE.reach, 0); }
    else if (t < 0.62) { const u = sm((t - 0.3) / 0.32); lerp3(f, G, A, u); f.k = 1; f.handK = 1; blend(f, POSE.reach, POSE.pull, u); }
    else if (t < 0.76) { const u = sm((t - 0.62) / 0.14); lerp3(f, A, T, u); f.k = 1; f.handK = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4; blend(f, POSE.pull, POSE.top, u); }
    else { const u = sm((t - 0.76) / 0.24); lerp3(f, T, [S.x, S.y, S.z], u); f.k = 1 - u; blend(f, POSE.top, POSE.top, 0); f.face = S.h; f.sit = u > 0.45; }
    return f;
  }
  const setHand = (h, x, y, z) => { if (h.isVector3) h.set(x, y, z); else { h.x = x; h.y = y; h.z = z; } };
  // Đường nòng trong hệ xe, lấy từ mô hình thật (đỉnh nòng muzzleTipLocal), đo một lần mỗi xe
  const _a = typeof THREE !== 'undefined' ? new THREE.Vector3() : null, _b = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  function barrelRig(v) {
    if (v._barrelRig !== undefined) return v._barrelRig;
    const tg = v.turretGroup, bp = v.barrelPivot, cg = v.chassisGroup;
    if (!tg || !bp || !cg || !v.muzzleTipLocal) return (v._barrelRig = null);
    const ry = tg.rotation.y, rx = bp.rotation.x;
    tg.rotation.y = 0; bp.rotation.x = 0; v.group.updateMatrixWorld(true);
    cg.worldToLocal(bp.getWorldPosition(_a));
    cg.worldToLocal((v.barrelGroup || bp).localToWorld(_b.copy(v.muzzleTipLocal)));
    const rig = { px: _a.x, pz: _a.z, y: _b.y, L: Math.abs(_b.z - _a.z), r: 1.7 };
    tg.rotation.y = ry; bp.rotation.x = rx; v.group.updateMatrixWorld(true);
    return (v._barrelRig = rig);
  }
  const TOP_SIT = 10.5, TOP_DUCK = 4.6, CLEAR = 5.5, LEAD = 0.45, MAX_DROP = 6;
  /** Lính ngồi ngoài có sắp bị nòng quét trúng không; trả số đv phải tụt xuống (0 = không cần). rot: góc tháp, om: tốc độ quay (rad/s), el: góc ngóc */
  function barrelDrop(v, S, rot, om, el) {
    const G = barrelRig(v);
    if (!G) return 0;
    const dx = S.x - G.px, dz = S.z - G.pz;
    for (const q of [rot, rot + om * LEAD * 0.5, rot + om * LEAD]) {
      const ux = -Math.sin(q), uz = -Math.cos(q), t = dx * ux + dz * uz, lat = Math.abs(dx * uz - dz * ux);
      if (t < 0 || t > G.L + 2 || lat > CLEAR) continue;
      const bottom = G.y + t * Math.tan(el || 0) - G.r;
      if (bottom > S.y + TOP_SIT) continue;
      return Math.max(0.5, Math.min(MAX_DROP, S.y + TOP_DUCK - bottom + 0.3));
    }
    return 0;
  }
  return { SEATS, TIME, frame, barrelDrop, barrelRig };
})();
if (typeof window !== 'undefined') window.VehicleRide = VehicleRide;
