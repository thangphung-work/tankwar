/**
 * TỈ LỆ CỦA GAME SO VỚI THỰC TẾ (một chỗ duy nhất để chỉnh nhịp chơi)
 *
 * Mọi số liệu gốc lấy theo xe / vũ khí thật, rồi nhân hệ số của từng nhóm:
 *  - timerScale : thời gian chờ (nạp đạn, hồi tên lửa, thay băng đạn, nối xích)       0.5 = nhanh gấp đôi thực tế
 *  - rangeScale : tầm bắn hiệu quả của súng / tên lửa (đơn vị game trên mỗi mét thật) 0.5 = chiến trường thu nhỏ 2 lần
 *  - speedScale : tốc độ tối đa của xe so với xe thật                                 0.9 = 90% tốc độ thật
 * Tốc độ đạn = tốc độ thật x rangeScale / timerScale (đạn bay hết tầm trong đúng timerScale x thời gian bay thật).
 * Kích thước xe, bán kính nổ, độ dày giáp: theo tỉ lệ thân xe (8 đơn vị = 1 m), không nén.
 *
 * ĐƯỜNG ĐẠN LÀ BẢN THU NHỎ ĐÚNG TỈ LỆ CỦA ĐƯỜNG ĐẠN THẬT: nén quãng đường r lần, thời gian τ lần thì
 *   tốc độ x r/τ, trọng lực x r/τ², hệ số cản (theo quãng đường) / r  -> góc bắn, độ cong, tầm xa đều khớp thực tế.
 * Lựu pháo 155mm bắn xa 30 km nên dùng tỉ lệ riêng (artyRangeScale / artyTimeScale) để vừa bản đồ và không phải chờ đạn bay 80 giây.
 */
const GameTiming = {
  timerScale: 0.5,
  rangeScale: 0.5,
  speedScale: 0.9,
  UNITS_PER_M: 8,      // tỉ lệ thân xe / vụ nổ
  ROAD_BONUS: 1.15,    // hệ số tốc độ trên đường nhựa tốt (terrain speedMult) -> tốc độ thật tối đa đạt được trên đường tốt

  // Lựu pháo: 30 km thật -> ~0.75 cạnh bản đồ (2700 đơn vị trên bản đồ 3600, 4050 trên bản đồ 5400);
  // đạn bay ~97 s thật (góc 50°, đỉnh ~12 km — không khí loãng dần theo độ cao) -> ~5.7 s trong game như trước
  // (trước đây 0.07 với mô hình không khí đặc đều: 82 s thật). Tầm giãn theo bản đồ, thời gian bay giữ nguyên
  artyRangeScale: 0.09 * (typeof MapGen !== 'undefined' ? MapGen.SIZE / 3600 : 1),
  artyTimeScale: 0.059,

  G: 9.81,

  // Số liệu thật tham chiếu
  REAL: {
    topSpeedKmh: { ALL_ROUNDER: 70, GATLING: 65, ARTILLERY: 70, SCOUT: 85 },      // đường tốt (trinh sát 4x4 bọc thép: 85, trước 100 — chạy thường quá nhanh; xe 6 nòng nặng nhất, tháp cụm 6 nòng + hòm đạn: 65)
    // Đạn: v sơ tốc (m/s) · k hệ số cản (1/m, dv/dt = -k·v²) · eff tầm hiệu quả (m) · max tầm tự hủy / cháy hết vạch đường (m, 0 = bay hết quỹ đạo)
    // life (đạn súng): vạch đường cháy hết ở `max` nhưng đầu đạn vẫn bay tiếp, vẫn sát thương — bỏ ở `life` m hoặc khi tụt dưới
    //   minV m/s (đạn 12.7 / 30mm thật còn nguy hiểm tới 2-3 km, chỉ là không còn thấy vệt sáng)
    // wc (đạn phản lực): hệ số quay mũi theo gió (1/s) khi động cơ còn cháy — cánh đuôi xoay mũi vào luồng gió ngang, lực đẩy
    //   kéo đạn NGƯỢC chiều gió (gia tốc ngang = -wc · gió ngang); hết nhiên liệu thì bị gió đẩy xuôi như đạn thường
    // hRho (lựu pháo): độ cao thang mật độ khí quyển (m) — cản k·e^(-h/hRho), h tính từ điểm bắn
    rounds: {
      TANK_AP: { v: 1650, k: 3.6e-5, eff: 3500, max: 0 },       // APFSDS 120mm: mất ~60 m/s mỗi km
      TANK_NORMAL: { v: 1140, k: 1.0e-4, eff: 3000, max: 0 },   // đạn nổ phá tiêu chuẩn 120mm
      TANK_HE: { v: 950, k: 1.1e-4, eff: 4000, max: 0 },        // HE-FRAG 120mm
      // 30×173 HEI-T: ~1080 m/s, còn ~800 m/s ở 1 km (đầu đạn nổ nhẹ, cản lớn hơn đạn tăng)
      GATLING_BULLET: { v: 1080, k: 3.0e-4, eff: 2000, max: 2000, life: 3000, minV: 250 },   // 30mm nổ-mảnh (vạch đường cháy hết ở 2 km)
      INCENDIARY: { v: 1050, k: 3.1e-4, eff: 1800, max: 1800, life: 3000, minV: 250 },       // 30mm cháy
      SCOUT_BULLET: { v: 890, k: 5.5e-4, eff: 1400, max: 1400, life: 2500, minV: 250 },      // 12.7mm (vạch đường M17 tắt ~1,4-1,5 km)
      SCOUT_INCENDIARY: { v: 880, k: 5.6e-4, eff: 1300, max: 1300, life: 2500, minV: 250 },  // 12.7mm xuyên-cháy
      RPG: { v: 290, k: 1.2e-3, eff: 500, max: 920, burnM: 500, wc: 0.75 },   // đạn phản lực không điều khiển, tự hủy ở 920 m
      // rocket giàn 8 ống xe trinh sát (kiểu 70mm Hydra / S-8): ~650 m/s khi cháy hết liều ~400 m, thân dài thon cản ít hơn
      // B-40 nhiều; tự hủy ở 1,8 km (= BallisticsSystem3D.MAIN_ROCKET_TRAVEL). Đạn bay vẫn là 'RPG' (đầu nổ lõm)
      ROCKET_POD: { v: 650, k: 4.0e-4, eff: 1500, max: 1800, burnM: 400, wc: 0.6 },
      ANTI_TANK_MISSILE: { v: 300, k: 0, eff: 4000, max: 4000, guided: true, turnG: 12, boostS: 0.6 }, // tên lửa dẫn hướng bán tự động
      // lựu pháo 155mm L/52 liều 1 (base-bleed): không khí loãng dần lên cao (thang 7,5 km) -> góc xa nhất ~50°, đỉnh ~12 km,
      // bay ~97 s, 30 km. Trước đây cản đều mọi độ cao: góc xa nhất chỉ ~37°, đỉnh 8 km như bắn trong không khí đặc
      ARTY: { v: 945, k: 7.4e-5, hRho: 7500, eff: 30000, max: 0 }
    },
    // Liều phóng lựu pháo (hệ số sơ tốc): liều 1 = đầy 30 km ... liều 7 = nhỏ nhất. Liều 6-7 (trước đây chỉ tới 5: góc 70° vẫn
    // rơi ~1100 đv) để bắn cầu vồng góc cao thật sự ở cự ly 400-1100 thay vì đường gần thẳng 10-15°
    // liều 8-10 (siêu nhỏ): bắn cầu vồng vào mục tiêu sát gần (~85-480) thay vì hạ nòng bắn thẳng rồi dính mảnh văng của chính mình
    artyCharges: [1, 0.8, 0.62, 0.44, 0.34, 0.26, 0.2, 0.14, 0.1, 0.07]
  },

  /** Thời gian chờ trong game (giây) từ thời gian thật */
  t(realSeconds) { return realSeconds * this.timerScale; },
  /** Tầm bay hiệu quả trong game (đơn vị) từ tầm thật (m) */
  range(realM) { return realM * this.rangeScale; },
  /** Tốc độ bay của đạn trong game (đơn vị / giây) từ sơ tốc thật (m/s) */
  shotSpeed(realMs) { return realMs * this.rangeScale / this.timerScale; },
  /** Gia tốc trong game (đơn vị / giây²) từ gia tốc thật (m/s²) — trọng lực, lực lái tên lửa */
  accel(realMs2) { return realMs2 * this.rangeScale / (this.timerScale * this.timerScale); },
  /** Tốc độ tối đa của xe (đơn vị / giây) từ km/h thật */
  vehicleSpeed(realKmh) { return realKmh / 3.6 * this.UNITS_PER_M * this.speedScale; },
  /** Tốc độ tối đa cơ sở của xe (đường thường / việt dã); trên đường nhựa tốt đạt đúng tốc độ thật */
  baseVehicleSpeed(tankType) { return this.vehicleSpeed(this.REAL.topSpeedKmh[tankType] || 70) / this.ROAD_BONUS; },
  /** Quy đổi tốc độ game -> km/h hiển thị cho người chơi */
  kmh(gameSpeed) { return gameSpeed / this.vehicleSpeed(1); },

  /** Khóa bảng đạn theo loại đạn + loại xe bắn */
  roundKey(ammo, tankType) {
    if (tankType === 'ARTILLERY' && ammo !== 'CLUSTER_SUBMUNITION') return 'ARTY';
    if (ammo === 'INCENDIARY') return tankType === 'SCOUT' ? 'SCOUT_INCENDIARY' : 'INCENDIARY';
    if (ammo === 'GATLING_BULLET' || ammo === 'GATLING_HE' || ammo === 'SCOUT_BULLET' || ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE') return ammo === 'GATLING_HE' ? 'GATLING_BULLET' : ammo;
    if (ammo === 'AP') return 'TANK_AP';
    if (ammo === 'HE' || ammo === 'CLUSTER') return 'TANK_HE';
    return 'TANK_NORMAL';
  },

  /**
   * Thông số bay trong game (đơn vị game, giây thật): { v, g, k, maxTravel, eff, guided, key, windMul, ... }
   * chargeMul: hệ số sơ tốc theo liều phóng lựu pháo · keyOverride: dùng hẳn một dòng bảng đạn (vd 'ROCKET_POD')
   */
  round(ammo, tankType, chargeMul = 1, keyOverride = null) {
    const key = keyOverride && this.REAL.rounds[keyOverride] ? keyOverride : this.roundKey(ammo, tankType);
    const R = this.REAL.rounds[key];
    const arty = key === 'ARTY';
    const r = arty ? this.artyRangeScale : this.rangeScale;
    const tau = arty ? this.artyTimeScale : this.timerScale;
    const out = {
      key,
      v: R.v * (arty ? chargeMul : 1) * r / tau,
      g: this.G * r / (tau * tau),
      k: R.k / r,
      maxTravel: R.max ? R.max * r : 0,
      eff: R.eff * r,
      guided: !!R.guided,
      // Gió (ballistics.wind, đv/s = m/s thật theo tỉ lệ bắn thẳng r/τ = 1) đổi sang tỉ lệ riêng của lựu pháo: gió 8 m/s thật
      // trong thế giới lựu pháo là 8·(r/τ) đv/s. Trước đây cộng thẳng -> đạn 155 dạt gió chỉ ~2/3 thực tế
      windMul: (r / tau) / (this.rangeScale / this.timerScale)
    };
    if (R.turnG) out.turnAcc = R.turnG * this.G * r / (tau * tau);
    if (R.boostS) out.boostT = R.boostS * tau;
    if (R.burnM) out.burnTravel = R.burnM * r;
    if (R.wc) out.wc = R.wc / tau;                 // 1/giây game
    if (R.life) out.lifeTravel = R.life * r;
    if (R.minV) out.minV = R.minV * r / tau;
    if (R.hRho) out.hRho = R.hRho * r;             // đơn vị game
    return out;
  }
};

if (typeof window !== 'undefined') window.GameTiming = GameTiming;
if (typeof module !== 'undefined') module.exports = GameTiming;
