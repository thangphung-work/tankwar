/**
 * LỰU 40MM NỔ MẢNH - NỔ LÕM (HEDP, kiểu M430) — sát thương lên xe bọc thép
 *
 * Quả lựu bay theo hệ đạn 30mm (ammoType GATLING_BULLET + cờ gl40) nên VehicleDamage xếp vào nhóm "đạn pháo nhỏ": với
 * xe tăng chỉ còn ~0.2 hệ số và gần như không bao giờ xuyên -> bắn cả dây lựu vào xe tăng "không xi nhê". Đạn thật có liều
 * nổ lõm nhỏ xuyên ~65 mm thép: thủng nóc / đuôi / sườn mỏng của xe bọc thép, còn trúng giáp dày vẫn làm hỏng đồ gắn ngoài
 * (kính, ăng-ten, ống phóng khói, xích...) bằng sức nổ & mảnh văng. Ở đây:
 *  - xe tăng / xe 6 nòng: giáp hiệu dụng tại chỗ trúng < 65 mm -> xuyên (sát thương khá), không xuyên -> sát thương theo mặt
 *    trúng (nóc / đuôi nhiều, sườn ít, giáp trước gần như không), luôn có thể phá bộ phận gắn ngoài sát điểm nổ
 *  - xe nhẹ / xe tải: giữ như cũ (đạn nhóm pháo nhỏ đã mạnh với giáp mỏng)
 */
const Grenade40 = (() => {
  const PEN_MM = 65;
  // hệ số khi không xuyên (nhân với sát thương gốc của quả lựu) theo mặt giáp bị trúng
  const NONPEN = { top: 0.35, rear: 0.3, side: 0.16, turretSide: 0.12, hullFront: 0.05, turretFront: 0.04 };
  const PEN_MUL = 0.75;
  const PART_R = 7;          // bán kính mảnh văng phá đồ gắn ngoài (đv)
  // không phá bằng cách gỡ rời: giáp / gạch nổ (hệ phân khối riêng), bánh xe / xích (có hàm riêng), nắp
  const SKIP = /^(armor|applique|era|cage|skirt|wheel|track|hatch|hull|turret|crew|gun|barrel|engine)/i;

  const penOf = (AO) => (AO && AO.armor !== undefined ? PEN_MM > AO.armor : false);

  function onHit(u, opts, r) {
    if (!opts || !opts.gl40 || !u || u.isDead || !r || r.intercepted) return;
    if (u.tankType !== 'ALL_ROUNDER' && u.tankType !== 'GATLING') return;
    const VD = window.VehicleDamage, d = VD.state(u), AO = d.lastOutcome;
    const hit = opts.hit, events = r.events || (r.events = []);
    if (hit && hit.ricochet) { r.mul = Math.max(r.mul, 0.02); return; }
    const key = (AO && AO.key) || 'side';
    const pen = penOf(AO);
    r.pen = pen;   // vết trên vỏ (ExplosionFX.armorHitMarks): lỗ thủng chỉ khi thật sự xuyên
    r.mul = pen ? PEN_MUL : (NONPEN[key] !== undefined ? NONPEN[key] : 0.12);
    if (pen) events.push({ type: 'gl40', text: `LỰU 40MM XUYÊN ${key === 'top' ? 'NÓC' : key === 'rear' ? 'ĐUÔI' : 'SƯỜN'} (${PEN_MM} mm > ${Math.round(AO.armor)} mm) — luồng nổ lõm lọt vào trong` });
    // mảnh văng & sức nổ phá đồ gắn ngoài sát điểm nổ
    const point = hit && hit.point;
    if (!point || !u.partGroups) return;
    u.group.updateMatrixWorld(true);
    const v = new THREE.Vector3(), names = [];
    for (const tag in u.partGroups) {
      if (SKIP.test(tag) || d.lost.has(tag)) continue;
      const g = u.partGroups[tag];
      if (!g || !g.getWorldPosition) continue;
      g.getWorldPosition(v);
      const dist = v.distanceTo(point);
      if (dist > PART_R || Math.random() > 0.45 * (1 - dist / PART_R) + 0.1) continue;
      const imp = v.clone().sub(point).normalize().multiplyScalar(25);
      if (VD.detachTag(u, tag, imp)) names.push(tag);
    }
    // trúng sát dải xích: mảnh lựu có thể đánh đứt xích
    if (u.chassisGroup && VD.breakTrack) {
      const lp = u.chassisGroup.worldToLocal(point.clone());
      if (lp.y < 9.6 && Math.abs(lp.x) > 8 && Math.random() < 0.18) VD.breakTrack(u, lp.x < 0 ? 0 : 1, events, opts.fx || null, point);
    }
    if (names.length) {
      VD.recompute(u);
      events.push({ type: 'gl40', text: `MẢNH LỰU 40MM PHÁ ${names.length} BỘ PHẬN GẮN NGOÀI` });
    }
  }

  function hook() {
    const VD = typeof window !== 'undefined' && window.VehicleDamage;
    if (!VD || VD.__gl40) return;
    VD.__gl40 = true;
    let vis = 0;
    const oV = VD.visualOnly;
    VD.visualOnly = function (fn) { vis++; try { return oV.call(this, fn); } finally { vis--; } };
    const oH = VD.onDirectHit;
    VD.onDirectHit = function (u, opts) {
      const r = oH.apply(this, arguments);
      if (!vis) { try { onHit(u, opts, r); } catch (e) { console.error('[Grenade40]', e); } }
      // máy khác chỉ vẽ hình: vẫn dán lỗ thủng / vết sém theo cùng luật xuyên 65 mm như máy bắn
      else if (r && opts && opts.gl40 && !r.intercepted && !(opts.hit && opts.hit.ricochet) && u && (u.tankType === 'ALL_ROUNDER' || u.tankType === 'GATLING')) r.pen = penOf(VD.state(u).lastOutcome);
      return r;
    };
  }
  hook();

  return { hook, PEN_MM, NONPEN };
})();

if (typeof window !== 'undefined') window.Grenade40 = Grenade40;
