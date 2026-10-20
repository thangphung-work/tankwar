/**
 * VẬT LÝ VỤ NỔ: SỨC ÉP + MẢNH VĂNG (dùng chung cho sát thương & hiệu ứng hình ảnh)
 *
 * Hai thành phần tách riêng như ngoài đời:
 *  - SỨC ÉP (sóng nổ): chỉ mạnh vài mét. Theo luật tỉ lệ Hopkinson-Cranz, cùng mức phá hủy ở cùng khoảng cách quy đổi
 *    Z = d / W^(1/3) (d: mét, W: kg thuốc nổ) -> giảm rất nhanh theo khoảng cách (~1/Z^3).
 *  - MẢNH VĂNG: bay xa hơn nhiều. Mật độ mảnh trên mục tiêu ~ 1/d^2 (mảnh toả trên mặt cầu), mỗi mảnh mất dần tốc độ
 *    vì lực cản không khí (~e^(-d/L)). Gần tâm thì gần như chắc chắn trúng nhiều mảnh -> bão hoà.
 *    Mảnh của đạn pháo bắn ra thành VÀNH vuông góc với thân đạn (side spray): đạn rơi dốc -> vành nằm ngang toả đều
 *    xung quanh; đạn bay là là -> mảnh dồn hai cánh trái / phải, phía trước & sau ít hẳn.
 *  - Giáp: xe tăng gần như miễn nhiễm mảnh văng (chỉ hư phụ kiện), xe bánh lốp / xe tải bị mảnh xé nát.
 *
 * Khoảng cách d tính trong không gian 3D tới BỀ MẶT thân xe (hộp thân), không phải tới tâm xe.
 * Đơn vị game: 8 = 1 m.
 */
const BlastPhysics = (() => {
  const U = 8;   // đơn vị game / m

  // W: kg thuốc nổ. blast / frag: sát thương gốc (máu, trước hệ số giáp) khi nổ sát thân xe.
  // r0 (m): khoảng cách mục tiêu bắt đầu thưa mảnh (~1 mảnh nặng / mục tiêu). L (m): quãng mảnh mất ~63% tốc độ.
  // rmax (m): ngoài tầm này mảnh không còn gây hư hại đáng kể cho xe. spray: mảnh văng theo vành thân đạn.
  const SPEC = {
    NORMAL: { W: 1.5, blast: 0.6, frag: 0.6, r0: 4.5, L: 40, rmax: 30, spray: true },            // 120mm đa năng (nổ lõm + vỏ phân mảnh)
    HE: { W: 2.2, blast: 0.8, frag: 0.9, r0: 6, L: 50, rmax: 45, spray: true },                  // 120mm nổ phá: vỏ thép dày, nhiều mảnh
    HE155: { W: 6.6, blast: 1.1, frag: 1.3, r0: 10, L: 70, rmax: 80, spray: true },              // 155mm: ~40 kg vỏ thép -> vài nghìn mảnh
    CLUSTER: { W: 1.6, blast: 0.6, frag: 0.6, r0: 4.5, L: 40, rmax: 30, spray: true },
    CLUSTER155: { W: 2.4, blast: 0.75, frag: 0.75, r0: 5.5, L: 45, rmax: 40, spray: true },
    CLUSTER_SUBMUNITION: { W: 0.03, blast: 0.15, frag: 0.35, r0: 1.5, L: 15, rmax: 10, spray: false },   // bom con ~30 g thuốc nổ
    RPG: { W: 0.7, blast: 0.5, frag: 0.15, r0: 2, L: 20, rmax: 12, spray: false },               // nổ lõm: năng lượng dồn vào luồng xuyên, ít mảnh
    ANTI_TANK_MISSILE: { W: 4.5, blast: 0.8, frag: 0.25, r0: 3, L: 25, rmax: 20, spray: false }
  };

  // Hệ số giáp riêng cho từng thành phần (cấp giáp ở vehicle_damage.js ARMOR[..].cls)
  const ARMOR_BLAST = { heavy: 0.35, medium: 0.55, light: 1.0, soft: 1.1 };
  const ARMOR_FRAG = { heavy: 0.06, medium: 0.25, light: 1.0, soft: 1.3 };

  const MAX_SPLASH = 2.6;   // trần 1 phát nổ lan (dưới ngưỡng máy chủ, ~máu xe tăng chủ lực còn lại sau 1 phát)
  const MIN_SPLASH = 0.015; // dưới mức này coi như không trúng (mảnh xa lác đác) -> không trừ máu / báo tin

  /** Thông số nổ theo loại đạn; null = đạn không có thuốc nổ đáng kể (AP, đạn súng máy) -> dùng luật cũ */
  function spec(ammo, heavy) {
    if (heavy && (ammo === 'HE' || ammo === 'NORMAL')) return SPEC.HE155;
    if (heavy && ammo === 'CLUSTER') return SPEC.CLUSTER155;
    return SPEC[ammo] || null;
  }

  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  /** Sức ép theo khoảng cách d (m) tới thân xe: 1 khi sát thân, ~0.5 ở Z ~2.2, tắt hẳn ở Z ~7 */
  function blastLoad(S, dM) {
    const Z = dM / Math.cbrt(S.W);
    return (1 / (1 + Math.pow(Z / 2.2, 3))) * (1 - smooth(5, 7, Z));
  }

  /** Mảnh văng theo khoảng cách d (m): bão hoà sát tâm, ~1/d^2 khi xa, mất tốc độ dần, tắt ở rmax */
  function fragLoad(S, dM) {
    const d = Math.max(0.05, dM);
    const hits = (S.r0 / d) * (S.r0 / d);
    return (1 - Math.exp(-hits)) * Math.exp(-d / S.L) * (1 - smooth(S.rmax * 0.7, S.rmax, d));
  }

  /**
   * Mật độ mảnh theo hướng (side spray), = 1 ở hướng vuông góc thân đạn, ~0.25 dọc theo thân đạn (mũi / đuôi).
   * axis: hướng bay của đạn (không cần chuẩn hoá); t: hướng từ tâm nổ tới mục tiêu (đã chuẩn hoá)
   */
  function sprayFactor(axis, t) {
    if (!axis) return 1;
    const L = Math.hypot(axis.x || 0, axis.y || 0, axis.z || 0);
    if (L < 1e-6) return 1;
    const c = ((axis.x || 0) * t.x + (axis.y || 0) * t.y + (axis.z || 0) * t.z) / L;
    return 0.25 + 0.75 * Math.exp(-(c * c) / (0.4 * 0.4));
  }

  /** Bốc ngẫu nhiên một hướng mảnh theo đúng phân bố sprayFactor (để hình ảnh khớp với sát thương). Trả về {x,y,z} */
  function sampleSpray(axis, rnd = Math.random) {
    const L = axis ? Math.hypot(axis.x || 0, axis.y || 0, axis.z || 0) : 0;
    for (let i = 0; i < 12; i++) {
      // hướng đều trên mặt cầu rồi lọc theo mật độ (xác suất giữ = sprayFactor, tối đa 1)
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const t = { x: s * Math.cos(a), y: u, z: s * Math.sin(a) };
      if (L < 1e-6 || rnd() < sprayFactor(axis, t)) return t;
    }
    const a = rnd() * Math.PI * 2;
    return { x: Math.cos(a), y: 0, z: Math.sin(a) };
  }

  /**
   * Điểm gần nhất trên hộp thân xe tới tâm nổ P (toạ độ thế giới) + mặt bị đánh.
   * box: {minX,maxX,minY,maxY,minZ,maxZ} hệ toạ độ xe (xoay theo bodyAngle quanh trục đứng). uy: cao độ đáy xe.
   * Trả về { d (đơn vị game), t: hướng chuẩn hoá từ P tới điểm gần nhất, face: 'front'|'side'|'rear'|'top' }
   */
  function hullDistance(P, unit, box, uy) {
    const c = Math.cos(unit.bodyAngle || 0), s = Math.sin(unit.bodyAngle || 0);
    const dx = P.x - unit.x, dz = P.z - unit.z;
    // thế giới -> xe (nghịch đảo phép xoay dùng ở Strongholds.shelterFactor: wx = x + lx*c + lz*s, wz = z - lx*s + lz*c)
    const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = P.y - uy;
    const qx = Math.max(box.minX, Math.min(box.maxX, lx));
    const qy = Math.max(box.minY, Math.min(box.maxY, ly));
    const qz = Math.max(box.minZ, Math.min(box.maxZ, lz));
    const ex = qx - lx, ey = qy - ly, ez = qz - lz;
    const d = Math.hypot(ex, ey, ez);
    // mặt bị đánh: trục lệch nhiều nhất khỏi hộp (nổ ngay trong hộp -> theo hướng tới tâm)
    const ox = lx < box.minX ? box.minX - lx : lx > box.maxX ? lx - box.maxX : 0;
    const oz = lz < box.minZ ? box.minZ - lz : lz > box.maxZ ? lz - box.maxZ : 0;
    const oy = ly > box.maxY ? ly - box.maxY : 0;
    let face = 'side';
    if (oy > 0 && oy >= ox && oy >= oz) face = 'top';
    else if (oz > ox) face = lz < box.minZ ? 'front' : 'rear';   // mũi xe hướng -Z cục bộ
    // hướng tới mục tiêu (thế giới). Nổ trong hộp: lấy hướng tới tâm xe
    let tx, ty, tz;
    if (d > 1e-3) {
      tx = ex * c + ez * s; tz = -ex * s + ez * c; ty = ey;
    } else {
      tx = unit.x - P.x; tz = unit.z - P.z; ty = (uy + (box.minY + box.maxY) / 2) - P.y;
    }
    const tl = Math.hypot(tx, ty, tz) || 1;
    // nửa cỡ thân xe: xe ở gần che cả một góc nhìn rộng -> chắc chắn hứng phần đậm của vành mảnh
    const span = ((box.maxX - box.minX) + (box.maxY - box.minY)) / 4;
    return { d, t: { x: tx / tl, y: ty / tl, z: tz / tl }, face, span };
  }

  /**
   * Sát thương nổ lan lên một xe.
   * S: spec(); dGame: khoảng cách tới thân xe (đơn vị game); t: hướng tới mục tiêu; axis: hướng bay đạn;
   * cls: cấp giáp; faceK: hệ số mặt giáp bị đánh; span: nửa cỡ thân xe (đơn vị game, từ hullDistance).
   * Trả về { dmg, blast, frag } (máu, đã nhân giáp)
   */
  function damage(S, dGame, t, axis, cls, faceK = 1, span = 0) {
    const dM = dGame / U;
    // Hướng mảnh: xe càng gần càng chiếm góc nhìn rộng -> kiểu gì cũng nằm trong vành mảnh
    let spray = S.spray ? sprayFactor(axis, t) : 1;
    if (span > 0) spray += (1 - spray) * span / (dGame + span);
    const blast = S.blast * blastLoad(S, dM) * (ARMOR_BLAST[cls] || 1) * faceK;
    const frag = S.frag * fragLoad(S, dM) * spray * (ARMOR_FRAG[cls] || 1) * faceK;
    return { dmg: Math.min(MAX_SPLASH, blast + frag), blast, frag };
  }

  /** Tầm xa nhất (đơn vị game) cần xét xe bị ảnh hưởng */
  function reach(S) { return Math.max(S.rmax, 7 * Math.cbrt(S.W)) * U; }

  return { U, SPEC, ARMOR_BLAST, ARMOR_FRAG, MAX_SPLASH, MIN_SPLASH, spec, blastLoad, fragLoad, sprayFactor, sampleSpray, hullDistance, damage, reach };
})();
if (typeof window !== 'undefined') window.BlastPhysics = BlastPhysics;
if (typeof module !== 'undefined' && module.exports) module.exports = BlastPhysics;
