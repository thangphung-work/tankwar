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
  // đạn bay 80 s thật -> ~5.7 s trong game (tầm giãn theo bản đồ, thời gian bay giữ nguyên)
  artyRangeScale: 0.09 * (typeof MapGen !== 'undefined' ? MapGen.SIZE / 3600 : 1),
  artyTimeScale: 0.07,

  G: 9.81,

  // Số liệu thật tham chiếu
  REAL: {
    topSpeedKmh: { ALL_ROUNDER: 70, GATLING: 70, ARTILLERY: 70, SCOUT: 85 },      // đường tốt (trinh sát 4x4 bọc thép: 85, trước 100 — chạy thường quá nhanh)
    // Đạn: v sơ tốc (m/s) · k hệ số cản (1/m, dv/dt = -k·v²) · eff tầm hiệu quả (m) · max tầm tự hủy / cháy hết vạch đường (m, 0 = bay hết quỹ đạo)
    rounds: {
      TANK_AP: { v: 1650, k: 3.6e-5, eff: 3500, max: 0 },       // APFSDS 120mm: mất ~60 m/s mỗi km
      TANK_NORMAL: { v: 1140, k: 1.0e-4, eff: 3000, max: 0 },   // đạn nổ phá tiêu chuẩn 120mm
      TANK_HE: { v: 950, k: 1.1e-4, eff: 4000, max: 0 },        // HE-FRAG 120mm
      // 30×173 HEI-T: ~1080 m/s, còn ~800 m/s ở 1 km (đầu đạn nổ nhẹ, cản lớn hơn đạn tăng)
      GATLING_BULLET: { v: 1080, k: 3.0e-4, eff: 2000, max: 2000 },   // 30mm nổ-mảnh (vạch đường cháy hết)
      INCENDIARY: { v: 1050, k: 3.1e-4, eff: 1800, max: 1800 },       // 30mm cháy
      SCOUT_BULLET: { v: 890, k: 5.5e-4, eff: 1400, max: 1400 },      // 12.7mm
      SCOUT_INCENDIARY: { v: 880, k: 5.6e-4, eff: 1300, max: 1300 },  // 12.7mm xuyên-cháy
      RPG: { v: 290, k: 1.2e-3, eff: 500, max: 920, burnM: 500 },     // đạn phản lực không điều khiển, tự hủy ở 920 m
      ANTI_TANK_MISSILE: { v: 300, k: 0, eff: 4000, max: 4000, guided: true, turnG: 12, boostS: 0.6 }, // tên lửa dẫn hướng bán tự động
      ARTY: { v: 945, k: 3.81e-5, eff: 30000, max: 0 }                // lựu pháo 155mm L/52 liều 1 (base-bleed): 30 km ở góc ~37°
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
    if (ammo === 'GATLING_BULLET' || ammo === 'SCOUT_BULLET' || ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE') return ammo;
    if (ammo === 'AP') return 'TANK_AP';
    if (ammo === 'HE' || ammo === 'CLUSTER') return 'TANK_HE';
    return 'TANK_NORMAL';
  },

  /**
   * Thông số bay trong game (đơn vị game, giây thật): { v, g, k, maxTravel, eff, guided, key }
   * chargeMul: hệ số sơ tốc theo liều phóng lựu pháo
   */
  round(ammo, tankType, chargeMul = 1) {
    const key = this.roundKey(ammo, tankType);
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
      guided: !!R.guided
    };
    if (R.turnG) out.turnAcc = R.turnG * this.G * r / (tau * tau);
    if (R.boostS) out.boostT = R.boostS * tau;
    if (R.burnM) out.burnTravel = R.burnM * r;
    return out;
  }
};

if (typeof window !== 'undefined') window.GameTiming = GameTiming;
if (typeof module !== 'undefined') module.exports = GameTiming;
