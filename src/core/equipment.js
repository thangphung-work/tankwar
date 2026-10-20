/**
 * TRANG BỊ & ĐẠN MUA THÊM (dùng chung máy chủ Node + trình duyệt)
 * - Danh mục, giá (Bạc), xe nào lắp được, kiểm tra hợp lệ bộ trang bị (sanitize) — máy chủ dùng để bán / lưu.
 * - Trong trận (chỉ trình duyệt): áp chỉ số, gắn hình bộ phận lên xe (gạch giáp nổ, lồng chống RPG, tấm giáp...),
 *   các bộ phận gắn tag như bộ phận gốc nên hệ thống hư hại tự xử lý: trúng thì kích nổ / văng ra, đồng bộ mạng.
 * - Hệ thống đánh chặn chủ động, màn khói (phím G), lưới ngụy trang, bình chữa cháy, đạn cao cấp, đạn mang thêm.
 *
 * Bộ trang bị 1 xe (gửi kèm slot khi ghép trận): { m: ['era','slat'], p: ['ap_du'], a: { AP: 4 } }
 *   m = mô-đun đang lắp (tối đa SLOTS), p = đạn cao cấp đã sở hữu (luôn dùng), a = số viên mua thêm mang theo mỗi lần xuất kích
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Equipment = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TANKS = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
  const ALL = TANKS;
  // Chế độ mở hết (freemium): mọi trang bị & đạn cao cấp dùng được ngay, không cần xem quảng cáo, mỗi nhóm lắp
  // được tất cả món hợp với xe. Đặt false để quay lại kiểu cũ: đồ nâng cao phải nhận, mỗi nhóm 2 ô.
  const ALL_FREE = true;
  const START_SILVER = 3000;

  // ---------------------------------------------------------------------------
  // DANH MỤC
  // ---------------------------------------------------------------------------
  // speed / accel: hệ số nhân tốc độ tối đa / gia tốc (giáp nặng làm xe chậm đi)
  const MODULES = {
    era: {
      name: 'Giáp phản ứng nổ', icon: 'bolt', cat: 'armor', adv: true, price: 3200, tanks: ['ALL_ROUNDER', 'GATLING', 'SCOUT'], speed: 0.97,
      desc: 'Gạch nổ phủ mũi, sườn và tháp. Mỗi viên gạch kích nổ chặn gần hết một phát đạn nổ lõm / RPG, giảm sức xuyên đạn xuyên giáp. Gạch đã nổ thì mất.'
    },
    slat: {
      name: 'Giáp lồng chống RPG', icon: 'grid-dots', cat: 'armor', price: 1800, tanks: ALL, speed: 0.98,
      desc: 'Lồng thép bắt bằng tay đỡ quanh sườn và đuôi xe (xe pháo: che cả cabin). Bóp méo đầu đạn RPG trước khi nổ (chặn ~6/10 phát RPG, ~1/4 tên lửa).'
    },
    applique: {
      name: 'Tấm giáp tăng cường', icon: 'shield', cat: 'armor', adv: true, price: 3800, tanks: ALL, speed: 0.94, accel: 0.94,
      desc: 'Giáp composite gắn thêm ở sườn và má tháp: giáp sườn dày thêm ~45%, mũi ~20%. Xe nặng hơn, chậm hơn một chút.'
    },
    spall: {
      name: 'Lớp lót chống mảnh', icon: 'layers-subtract', cat: 'armor', price: 2800, tanks: ALL,
      desc: 'Lớp sợi aramid lót bên trong khoang (không nhìn thấy từ ngoài): khi bị bắn thủng, mảnh vỡ gây ít sát thương hơn (-15%, trúng kho đạn -25%), xe bị hạ ít khi nổ tung kho đạn hơn.'
    },
    aps: {
      name: 'Hệ thống đánh chặn chủ động', icon: 'shield-bolt', cat: 'gear', adv: true, price: 7000, tanks: ['ALL_ROUNDER', 'GATLING'],
      desc: 'Radar + đạn đánh chặn trên nóc tháp tự bắn hạ RPG và tên lửa chống tăng bay tới (2 lần mỗi lần xuất kích). Radar bị bắn hỏng thì ngừng hoạt động.'
    },
    smoke: {
      name: 'Ống phóng lựu khói', icon: 'cloud', cat: 'gear', price: 1500, tanks: ALL,
      desc: 'Phím G: phóng màn khói dày trước mũi xe, che khuất tầm nhìn của địch ~14 giây (2 lần mỗi lần xuất kích).'
    },
    camo: {
      name: 'Lưới ngụy trang', icon: 'leaf', cat: 'gear', price: 1600, tanks: ALL,
      desc: 'Phủ kín lá cây & cành lên xe, nhìn như một bụi cây. Khi đứng yên: địch phải tới gần hơn ~35% mới thấy và khóa được, radar chỉ bắt được ở ~60% tầm. Chạy hoặc nổ súng là lộ.'
    },
    fireext: {
      name: 'Bình chữa cháy tự động', icon: 'fire-extinguisher', cat: 'gear', price: 1200, tanks: ALL,
      desc: 'Dập lửa trên xe nhanh gấp 2,5 lần, cháy do đạn cháy gây sát thương giảm một nửa.'
    },
    turbo: {
      name: 'Động cơ tăng áp', icon: 'engine', cat: 'gear', adv: true, price: 3000, tanks: ALL, speed: 1.08, accel: 1.15,
      desc: 'Tăng áp & chỉnh hộp số: tốc độ tối đa +8%, tăng tốc nhanh hơn 15%.'
    },
    radar: {
      name: 'Radar dò tìm', icon: 'radar-2', cat: 'gear', adv: true, price: 5000, tanks: ['ALL_ROUNDER', 'GATLING', 'ARTILLERY'],
      desc: 'Radar nhỏ trên nóc tháp quét quanh xe: bắt được xe địch trong bán kính ~75 m kể cả khi núp bụi, hiện chấm trên bản đồ. Xe trinh sát đã có radar riêng.'
    },
    jammer: {
      name: 'Máy gây nhiễu', icon: 'antenna-bars-off', cat: 'gear', adv: true, price: 5000, tanks: ALL,
      desc: 'Phát nhiễu điện tử: đầu dò tên lửa địch mất gấp đôi thời gian mới khóa được bạn, tên lửa đang bay dễ lệch hướng, radar địch bắt bạn chập chờn.'
    }
  };
  // Nhóm trong bảng chọn trang bị & số ô tối đa mỗi nhóm (đạn cao cấp không chiếm ô)
  const catSize = (c) => Object.keys(MODULES).filter(id => MODULES[id].cat === c).length;
  const CATS = {
    armor: { name: 'GIÁP', icon: 'shield-half-filled', slots: ALL_FREE ? catSize('armor') : 2 },
    ammo: { name: 'ĐẠN', icon: 'rocket', slots: 0 },
    gear: { name: 'PHỤ KIỆN', icon: 'cpu', slots: ALL_FREE ? catSize('gear') : 2 }
  };
  const SLOTS = CATS.armor.slots + CATS.gear.slots;   // tổng số ô các nhóm
  const EQ_RADAR_RANGE = 600;   // radar lắp thêm (xe trinh sát: 950)

  // Đạn cao cấp: mua 1 lần cho 1 xe, luôn dùng. pen: hệ số độ xuyên; splash: hệ số sát thương nổ lan; tandem: đầu nổ kép
  const PREMIUM = {
    ap_du: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'AP', name: 'Đạn xuyên lõi hợp kim nặng', icon: 'arrow-big-right-lines', price: 4500, pen: 1.22, desc: 'Đạn xuyên giáp xuyên sâu hơn 22%, ít mất sức xuyên khi bắn xa.' },
    heat_tandem: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'NORMAL', name: 'Đạn nổ lõm 2 tầng', icon: 'flame', price: 3500, pen: 1.1, tandem: true, desc: 'Đạn thường có đầu nổ mồi phá gạch giáp nổ trước, xuyên thêm 10%.' },
    apds30: { tank: 'GATLING', cat: 'ammo', adv: true, ammo: 'GATLING_BULLET', name: 'Đạn 30mm xuyên dưới cỡ', icon: 'arrow-big-right-lines', price: 3800, pen: 1.36, desc: 'Đạn 30mm lõi tungsten: xuyên sâu hơn 36%, đục thủng sườn xe tăng nhanh hơn.' },
    slap127: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'SCOUT_BULLET', name: 'Đạn 12.7mm SLAP', icon: 'arrow-big-right-lines', price: 2600, pen: 1.6, desc: 'Đạn 12.7mm xuyên dưới cỡ có đai nhựa: xuyên sâu gấp 1,6 lần.' },
    he_frag: { tank: 'ARTILLERY', cat: 'ammo', adv: true, ammo: 'HE', name: 'Lựu đạn mảnh định sẵn', icon: 'atom-2', price: 3500, splash: 1.15, desc: 'Vỏ đạn 155mm khía rãnh tạo mảnh đều: sát thương nổ lan +15%.' }
  };

  // Đạn mang thêm (tiêu hao): giá 1 viên, bán theo gói `pack` viên, tối đa `max` viên mang thêm mỗi lần xuất kích
  const AMMO_SHOP = {
    ALL_ROUNDER: { AP: { name: 'Đạn xuyên giáp', price: 45, pack: 5, max: 6 }, HE: { name: 'Đạn nổ mạnh', price: 30, pack: 5, max: 6 } },
    ARTILLERY: { HE: { name: 'Lựu đạn nổ mạnh 155', price: 40, pack: 5, max: 6 }, CLUSTER: { name: 'Đạn chùm 155', price: 70, pack: 2, max: 4 } },
    GATLING: { INCENDIARY: { name: 'Đạn cháy 30mm', price: 1, pack: 50, max: 150 } },
    SCOUT: { RPG: { name: 'Đạn RPG', price: 60, pack: 2, max: 4 }, INCENDIARY: { name: 'Đạn cháy 12.7mm', price: 1, pack: 50, max: 90 }, ANTI_TANK_MISSILE: { name: 'Tên lửa chống tăng', price: 150, pack: 1, max: 4 } }
  };
  // Đạn đặc chủng miễn phí mỗi lần xuất kích: KHÔNG CÒN — ngoài đạn chính (không giới hạn), mọi loại đạn khác phải
  // mua bằng Bạc (đạn đã mua tự mang theo tới mức tối đa mỗi lần xuất kích). Giữ đủ khóa để startLife đặt lại số đạn.
  const BASE_AMMO = { ALL_ROUNDER: { AP: 0, HE: 0 }, ARTILLERY: { HE: 0, CLUSTER: 0 }, GATLING: { INCENDIARY: 0 }, SCOUT: { INCENDIARY: 0, RPG: 0, ANTI_TANK_MISSILE: 0 } };
  // Xe do máy điều khiển không mua sắm: mang cơ số như trước khi có cửa hàng để trận không dễ đi
  const BOT_AMMO = { ALL_ROUNDER: { AP: 3, HE: 3 }, ARTILLERY: { HE: 4, CLUSTER: 3 }, GATLING: { INCENDIARY: 80 }, SCOUT: { INCENDIARY: 45, RPG: 4, ANTI_TANK_MISSILE: 4 } };
  const AMMO_PROP = { AP: 'apAmmoCount', HE: 'heAmmoCount', CLUSTER: 'clusterAmmoCount', INCENDIARY: 'incendiaryAmmoCount', RPG: 'rpgAmmoCount', ANTI_TANK_MISSILE: 'missileAmmoCount' };

  function compatible(id, tank) {
    const m = MODULES[id];
    if (m) return m.tanks.includes(tank);
    const p = PREMIUM[id];
    return !!(p && p.tank === tank);
  }
  // Đồ cơ bản: chọn lắp miễn phí; đồ nâng cao (adv): phải nhận trước (xem quảng cáo), máy chủ lưu vào kho 'owned'
  // Chế độ mở hết chỉ áp cho trang bị (mô-đun); đạn cao cấp vẫn phải mua
  function isFree(id) { const it = MODULES[id] || PREMIUM[id]; return !!it && ((ALL_FREE && !!MODULES[id]) || !it.adv); }
  function catOf(id) { const it = MODULES[id] || PREMIUM[id]; return it ? it.cat : null; }
  function priceOf(id) {
    return (MODULES[id] && MODULES[id].price) || (PREMIUM[id] && PREMIUM[id].price) || 0;
  }

  /** Bộ trang bị hợp lệ cho xe `tank` (lọc mã lạ / không lắp được, giới hạn số ô & số đạn) */
  function sanitize(kit, tank) {
    const out = { m: [], p: [], a: {} };
    if (!kit || typeof kit !== 'object' || !TANKS.includes(tank)) return out;
    for (const id of Array.isArray(kit.m) ? kit.m : []) {
      if (out.m.length >= SLOTS) break;
      if (!MODULES[id] || !compatible(id, tank) || out.m.includes(id)) continue;
      const c = MODULES[id].cat;
      if (out.m.filter(x => MODULES[x].cat === c).length >= ((CATS[c] && CATS[c].slots) || 0)) continue;   // nhóm đã đủ ô
      out.m.push(id);
    }
    for (const id of Array.isArray(kit.p) ? kit.p : []) if (PREMIUM[id] && PREMIUM[id].tank === tank && !out.p.includes(id)) out.p.push(id);
    const shop = AMMO_SHOP[tank] || {};
    for (const k in shop) {
      const n = Math.floor(Number(kit.a && kit.a[k]) || 0);
      if (n > 0) out.a[k] = Math.min(shop[k].max, n);
    }
    return out;
  }

  // Xe do máy điều khiển: 0-2 mô-đun ngẫu nhiên theo hạt giống chung (mọi máy trong phòng ra cùng kết quả)
  function botKit(tank, rnd) {
    const pool = Object.keys(MODULES).filter(id => compatible(id, tank) && id !== 'aps');
    const n = Math.floor(rnd() * 3);
    const m = [];
    while (m.length < n && pool.length) m.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return { m, p: [], a: Object.assign({}, BOT_AMMO[tank] || {}) };
  }

  // Bạc nhận được sau trận (máy chủ tính)
  function silverFor(result, kills, damage, durSec) {
    return Math.round(250 + (result === 'win' ? 300 : result === 'draw' ? 150 : 0) + kills * 90 + damage * 30 + Math.min(durSec, 900) / 3);
  }

  // Thưởng top 3 hạ gục / bị hạ (K/D) cả trận, cộng thêm vào thưởng trận: [hạng 1, hạng 2, hạng 3]
  const KD_BONUS = [{ xp: 120, silver: 800 }, { xp: 80, silver: 500 }, { xp: 50, silver: 300 }];
  /**
   * Xếp hạng K/D: list = [{ key, kills, deaths, damage }] -> 3 phần tử đứng đầu (đã sắp xếp).
   * Phải hạ được ít nhất 1 xe; bằng K/D thì xét số hạ gục, rồi sát thương.
   */
  function rankKD(list) {
    const kd = (u) => u.kills / Math.max(1, u.deaths);
    return list.filter(u => u.kills >= 1)
      .sort((a, b) => kd(b) - kd(a) || b.kills - a.kills || b.damage - a.damage)
      .slice(0, 3);
  }

  const API = { TANKS, ALL_FREE, SLOTS, CATS, EQ_RADAR_RANGE, START_SILVER, MODULES, PREMIUM, AMMO_SHOP, BASE_AMMO, BOT_AMMO, AMMO_PROP, KD_BONUS, compatible, isFree, catOf, priceOf, sanitize, botKit, silverFor, rankKD };
  if (typeof window === 'undefined' || typeof THREE === 'undefined') return API;

  // ===========================================================================
  // PHẦN TRONG TRẬN (TRÌNH DUYỆT)
  // ===========================================================================
  const has = (u, id) => !!(u && u.kit && u.kit.m && u.kit.m.indexOf(id) >= 0);
  const lost = (u, tag) => !!(u && u.dmg && u.dmg.lost && u.dmg.lost.has(tag));
  const APS_CHARGES = 2, SMOKE_CHARGES = 2;

  /**
   * Lắp bộ trang bị cho xe (gọi 1 lần lúc tạo xe trong trận). opts.local: xe của người chơi máy này;
   * opts.stock: số đạn mua thêm còn trong kho (chỉ người chơi) -> không mang quá số đã mua.
   */
  function equip(u, kit, opts) {
    if (!u) return;
    u.kit = sanitize(kit, u.tankType);
    u._eq = { local: !!(opts && opts.local), stock: Object.assign({}, (opts && opts.stock) || {}), used: {}, loaded: {}, reported: {} };
    // Đạn cao cấp
    u.ammoMods = {};
    for (const id of u.kit.p) { const P = PREMIUM[id]; u.ammoMods[P.ammo] = P; }
    // Chỉ số (tốc độ / gia tốc) — áp trước khi hệ thống hư hại chụp chỉ số gốc
    let sp = 1, ac = 1;
    for (const id of u.kit.m) { sp *= MODULES[id].speed || 1; ac *= MODULES[id].accel || 1; }
    if (u.baseMaxSpeed) u.baseMaxSpeed *= sp;
    if (u.acceleration) u.acceleration *= ac;
    if (u.dmg && u.dmg.base) { if (u.dmg.base.baseMaxSpeed) u.dmg.base.baseMaxSpeed *= sp; if (u.dmg.base.acceleration) u.dmg.base.acceleration *= ac; }
    // Ống phóng lựu khói có sẵn trên mô hình chỉ hiện khi đã lắp trang bị khói (bật / tắt thấy ngay trên xe)
    try { setStockSmoke(u, has(u, 'smoke')); } catch (e) { console.warn('[EQ] Không ẩn được ống khói', e); }
    try { buildVisuals(u); } catch (e) { console.warn('[EQ] Không gắn được hình trang bị', e); }
    startLife(u);
  }

  // Mỗi lần xuất kích: nạp lại đạn đặc chủng (miễn phí + mua thêm), khói, đánh chặn
  function startLife(u) {
    const E = u._eq;
    if (!E) return;
    const base = BASE_AMMO[u.tankType] || {};
    for (const k in base) {
      let extra = u.kit.a[k] || 0;
      if (E.local) extra = Math.max(0, Math.min(extra, (E.stock[k] || 0) - (E.used[k] || 0)));
      E.loaded[k] = extra;
      u[AMMO_PROP[k]] = base[k] + extra;
    }
    u.smokeLeft = has(u, 'smoke') ? SMOKE_CHARGES : 0;
  }
  // Đạn mua thêm đã bắn trong lần xuất kích này (bắn đạn miễn phí trước, hết mới tới đạn mua)
  function lifeUsed(u, k) {
    const E = u._eq, n = E.loaded[k] || 0;
    if (!n) return 0;
    return Math.max(0, Math.min(n, n - (u[AMMO_PROP[k]] || 0)));
  }
  function onRespawn(u) {
    const E = u && u._eq;
    if (!E) return;
    for (const k in E.loaded) E.used[k] = (E.used[k] || 0) + lifeUsed(u, k);
    startLife(u);
    // đạn mua đã bắn ở lần xuất kích trước: báo máy chủ trừ kho ngay, không đợi hết trận
    if (E.local && typeof window !== 'undefined' && window.Account && Account.flushAmmo) Account.flushAmmo(u);
  }
  /** Tổng đạn mua thêm đã tiêu trong trận (gửi máy chủ để trừ kho) */
  function paidUsed(u) {
    const E = u && u._eq, out = {};
    if (!E) return out;
    for (const k in E.loaded) { const n = (E.used[k] || 0) + lifeUsed(u, k); if (n > 0) out[k] = n; }
    for (const k in E.used) if (!(k in out) && E.used[k] > 0) out[k] = E.used[k];
    return out;
  }

  /**
   * Phần đạn mua thêm đã bắn nhưng chưa báo máy chủ trừ kho (chỉ xe người chơi); gọi là đánh dấu đã báo.
   * giveBack: gửi thất bại -> trả lại phần đó để lần sau gửi tiếp.
   */
  function ammoDelta(u, giveBack) {
    const E = u && u._eq, out = {};
    if (!E || !E.local) return out;
    if (giveBack) { for (const k in giveBack) E.reported[k] = Math.max(0, (E.reported[k] || 0) - giveBack[k]); return out; }
    const all = paidUsed(u);
    for (const k in all) { const n = all[k] - (E.reported[k] || 0); if (n > 0) { out[k] = n; E.reported[k] = all[k]; } }
    return out;
  }

  // ---------- Hệ số dùng trong mô hình xuyên giáp (vehicle_damage.js) ----------
  // Giáp quy đổi: tấm giáp tăng cường còn trên mặt bị trúng
  function armorMul(u, face, onTurret) {
    if (!has(u, 'applique')) return 1;
    if (onTurret) return (face === 'front' || face === 'sideL' || face === 'sideR') && !lost(u, 'appliqueKitT') ? 1.2 : 1;
    if (face === 'sideL') return lost(u, 'appliqueKitL') ? 1 : 1.45;
    if (face === 'sideR') return lost(u, 'appliqueKitR') ? 1 : 1.45;
    if (face === 'front') return (lost(u, 'appliqueKitL') && lost(u, 'appliqueKitR')) ? 1 : 1.2;
    return 1;
  }
  // Gạch giáp nổ mua thêm bị trúng: cộng giáp quy đổi cho phát này (gạch kích nổ rồi văng — vehicle_damage tự tách)
  function eraBonus(tag, kind, tandem) {
    if (!tag || !/^eraKit/.test(tag)) return 0;
    if (kind === 'CE') return tandem ? 60 : 450;
    return kind === 'KE' ? 90 : 0;
  }
  function penMul(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return P && P.pen ? P.pen : 1;
  }
  function isTandem(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return !!(P && P.tandem);
  }
  function splashMul(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return P && P.splash ? P.splash : 1;
  }
  function spallMul(u, zone) {
    if (!has(u, 'spall')) return 1;
    return zone === 'ammo' ? 0.75 : 0.85;
  }
  // Lồng thép bị trúng bởi RPG / tên lửa: xác suất đầu đạn bị bóp méo, không nổ đúng cách
  function slatDefeats(tag, ammo) {
    if (!tag || !/^cage/.test(tag)) return false;
    if (ammo === 'RPG') return Math.random() < 0.6;
    if (ammo === 'ANTI_TANK_MISSILE') return Math.random() < 0.25;
    return false;
  }
  // Hệ thống đánh chặn: còn lượt + radar chưa bị bắn hỏng
  function apsLeft(u) {
    if (!has(u, 'aps') || lost(u, 'apsKit')) return 0;
    return Math.max(0, APS_CHARGES - ((u.dmg && u.dmg.apsUsed) || 0));
  }
  function apsTry(u, ammo) {
    if (ammo !== 'RPG' && ammo !== 'ANTI_TANK_MISSILE') return false;
    if (apsLeft(u) <= 0) return false;
    const d = (typeof VehicleDamage !== 'undefined') ? VehicleDamage.state(u) : (u.dmg || (u.dmg = {}));
    d.apsUsed = (d.apsUsed || 0) + 1;
    return Math.random() < 0.85;
  }
  // Lưới lá ngụy trang chỉ có tác dụng khi xe ĐỨNG YÊN (dưới ~6% tốc độ tối đa) và chưa vừa nổ súng:
  // chạy là cành lá rung, lộ hình xe -> mất tác dụng hoàn toàn. Lưới rách / cháy (mất cụm 'camoKit') cũng mất.
  function camoHidden(t) {
    if (!has(t, 'camo') || lost(t, 'camoKit')) return false;
    // lưới đang cháy (lửa, khói lộ vị trí) hoặc đã cháy quá nửa: hết tác dụng (CamoFire)
    if (typeof CamoFire !== 'undefined' && CamoFire.blocks(t)) return false;
    if ((t.revealTimer || 0) > 0) return false;
    return Math.abs(t.speed || 0) < (t.baseMaxSpeed || 120) * 0.06;
  }
  // Hệ số tầm nhìn của địch tới xe này: phải vào gần hơn ~35% mới thấy / mới khóa được
  function camoFactor(t) { return camoHidden(t) ? 0.65 : 1; }
  // Lưới ngụy trang + xe ĐỨNG YÊN (chưa vừa nổ súng): radar địch chỉ bắt được trong ~60% tầm quét
  // (lá cây & lưới tản sóng làm vết radar yếu, lẫn vào nền cây cối). Chạy là mất tác dụng.
  function camoRadarFactor(t) { return camoHidden(t) ? 0.6 : 1; }
  function fireMul(u) { return has(u, 'fireext') ? 2.5 : 1; }
  function burnDamageMul(u) { return has(u, 'fireext') ? 0.5 : 1; }

  // ---------------------------------------------------------------------------
  // HÌNH BỘ PHẬN GẮN THÊM
  // ---------------------------------------------------------------------------
  // Kích thước khung từng xe (đo từ mô hình: hệ tọa độ thân xe, mũi xe hướng -z; tháp theo hệ tọa độ tháp)
  const FIT = {
    // netY: độ cao nóc thân để phủ lưới ngụy trang; tur.roof: nóc tháp
    ALL_ROUNDER: { hw: 15.8, y0: 6.4, y1: 11.6, zF: -31, zR: 30.8, eraZ1: 4, netY: 12.9, tur: { hw: 12.8, h: 9.7, roof: 9.4, zF: -19.2, zR: 20.7 } },
    GATLING: { hw: 17.2, y0: 7.6, y1: 13.4, zF: -37, zR: 33.2, eraZ1: 2, netY: 14.3, tur: { hw: 13.6, h: 8.8, roof: 8.6, zF: -16.7, zR: 14.8 } },
    ARTILLERY: { hw: 13.4, y0: 9.5, y1: 15.5, zF: -40.1, zR: 41.2, eraZ1: 0, netY: 12.6, tur: { hw: 11.4, h: 16.6, roof: 10.8, zF: -11, zR: 14.9 } },
    SCOUT: { hw: 8.7, y0: 7.2, y1: 13, zF: -20, zR: 19.5, eraZ1: 6, netY: 15.5, tur: null }
  };
  // Nóc thật (tháp: hệ tọa độ tháp; Marten không tháp: nóc thân) — FIT.tur.roof đo cả kính ngắm / hộp pháo nên cao hơn
  const REAL_ROOF = { ALL_ROUNDER: 7.0, GATLING: 5.6, ARTILLERY: 9.6, SCOUT: 15.4 };
  // Chỗ trống trên nóc để gắn radar dò tìm / máy gây nhiễu [x, z] (tránh nắp, kính, ăng-ten, tấm nhận diện)
  const ROOF_SPOT = { ALL_ROUNDER: { radar: [-3.0, 16.0], jam: [3.2, 16.0] }, GATLING: { radar: [-4.5, 9.6], jam: [4.6, 10.8] }, ARTILLERY: { radar: [-2.8, 12.9], jam: [-7.0, 2.0] }, SCOUT: { jam: [3.4, 12.8] } };
  // Giáp lồng (đo bề mặt thật từng mô hình bằng tia quét): mỗi tấm = khung + nan thép dẹt cách vỏ ~2 đơn vị,
  // bắt vào thân bằng tay đỡ. side: mặt phẳng x = ±at, trải theo z a0..a1; end: mặt phẳng z = at, trải theo x a0..a1.
  // hull / hullTop: mặt vỏ chỗ tay đỡ dưới / trên bắt vào; bottomFree: mép dưới không có gì để bắt -> giằng chéo
  // từ tay đỡ trên xuống; arms: vị trí tay đỡ (mặc định cách đều ~6.5); skip: khoảng không đặt tay đỡ.
  // Không có tấm nào lọt vào vòng quay của tháp (tháp quét được mọi hướng).
  const CAGE = {
    ALL_ROUNDER: [
      { kind: 'side', at: 17.6, a0: 2, a1: 32.6, y0: 5.0, y1: 13.6, hull: 15.6, hullTop: 15.0, tag: 'cageKit' },
      { kind: 'end', at: 32.6, a0: -17.6, a1: 17.6, y0: 5.0, y1: 13.6, hull: 30.2, hullTop: 28.8, tag: 'cageKitB', arms: [-13.5, -5.5, 5.5, 13.5] }
    ],
    // Hailstorm có sẵn lồng đuôi + 2 cánh lồng sau: lắp thêm lồng 2 sườn nối tới cánh lồng
    GATLING: [
      { kind: 'side', at: 18.6, a0: -4, a1: 26.6, y0: 4.6, y1: 14.4, hull: 17.0, hullTop: 15.2, tag: 'cageKit' }
    ],
    // Xe pháo: lồng che cabin + khoang máy (cao tới gần nóc cabin), mặt trước cabin dưới kính, sườn sàn sau thấp
    // dưới tầm quay của tháp; đuôi xe để trống cho lưỡi càng
    ARTILLERY: [
      { kind: 'side', at: 12.6, a0: -33.4, a1: -18.9, y0: 12.9, y1: 21.4, hull: 10.7, hullTop: 10.8, tag: 'cageKit' },
      { kind: 'side', at: 12.6, a0: -18.5, a1: -11.4, y0: 13.4, y1: 21.4, hull: 9.6, hullTop: 9.1, tag: 'cageKit' },
      { kind: 'side', at: 12.9, a0: -10.6, a1: 36.8, y0: 6.6, y1: 13.4, hull: 10.4, bottomFree: true, tag: 'cageKit', skip: [[31.5, 35.8]] },
      { kind: 'end', at: -41.2, a0: -10.6, a1: 10.6, y0: 10.7, y1: 15.2, hull: -37.4, hullTop: -37.0, tag: 'cageKitF', arms: [-9.4, -3.2, 3.2, 9.4] }
    ],
    SCOUT: [
      { kind: 'side', at: 10.2, a0: -6.2, a1: 20.6, y0: 6.4, y1: 14.8, hull: 8.0, hullTop: 7.6, tag: 'cageKit' },
      { kind: 'end', at: 20.6, a0: -10.2, a1: 10.2, y0: 6.4, y1: 14.8, hull: 18.2, hullTop: 17.8, tag: 'cageKitB', arms: [-8.6, -1.6, 1.6, 8.6] }
    ]
  };
  // Bình chữa cháy gắn ngoài (bình đỏ trên giá kẹp): [x, y đáy, z, trục ('y' đứng | 'z' nằm dọc xe), hướng mặt giá (pháp tuyến tấm đỡ)]
  const EXT_SPOT = {
    ALL_ROUNDER: [[-9.0, 7.6, 30.9, 'y', [0, 0, -1]], [9.0, 7.6, 30.9, 'y', [0, 0, -1]]],
    GATLING: [[-11.2, 14.2, 25.5, 'z', [0, -1, 0]], [11.2, 14.2, 25.5, 'z', [0, -1, 0]]],
    ARTILLERY: [[-8.8, 12.4, -9.6, 'y', [0, 0, -1]], [8.6, 12.4, -9.4, 'y', [0, 0, -1]]],
    SCOUT: [[-1.7, 11.0, 18.45, 'y', [0, 0, -1]]]
  };
  const matCache = {};
  function kitMats(team) {
    const key = team === 'RED' ? 'RED' : 'BLUE';
    if (matCache[key]) return matCache[key];
    const K = window.VehicleKit;
    const M = K ? K.createMaterials(key) : {};
    const net = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x4d5a34 : 0x9a8659, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const net2 = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x36402a : 0x7d6a45, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const era = M.paint || new THREE.MeshStandardMaterial({ color: 0x5c6450, roughness: 0.8, metalness: 0.2 });
    const steel = M.dark || new THREE.MeshStandardMaterial({ color: 0x2b2c27, roughness: 0.7, metalness: 0.4 });
    const sensor = new THREE.MeshStandardMaterial({ color: 0x2e3228, roughness: 0.5, metalness: 0.4, emissive: 0x0b1f14, emissiveIntensity: 0.4 });
    const ext = new THREE.MeshStandardMaterial({ color: 0x9a2219, roughness: 0.45, metalness: 0.25 });
    return (matCache[key] = { era, plate: era, steel, net, net2, sensor, ext, rubber: M.rubber || steel, metal: M.steel || steel });
  }

  // Một tấm giáp lồng (xem CAGE). s: ±1 cho tấm sườn
  function cagePanel(b, P, M, s) {
    const steel = M.steel, side = P.kind === 'side';
    const at = side ? s * P.at : P.at, nrm = side ? s : Math.sign(P.at);
    const span = P.a1 - P.a0, mid = (P.a0 + P.a1) / 2, H = P.y1 - P.y0, yc = (P.y0 + P.y1) / 2;
    const pos = (a, y, plane = at) => side ? [plane, y, a] : [a, y, plane];
    const box = (along, h, normal, p) => side ? b.box(normal, h, along, steel, p) : b.box(along, h, normal, steel, p);
    // nan thép dẹt (bản rộng quay theo pháp tuyến, như lồng RPG thật) + khung 3 thanh ngang, 2 cột góc
    const n = Math.max(2, Math.round(span / 1.25));
    for (let i = 1; i < n; i++) box(0.16, H - 0.2, 0.62, pos(P.a0 + span * i / n, yc));
    for (const y of [P.y0 + 0.2, yc, P.y1 - 0.2]) box(span + 0.3, 0.32, 0.36, pos(mid, y));
    for (const a of [P.a0, P.a1]) box(0.42, H + 0.1, 0.42, pos(a, yc));
    // tay đỡ bắt vào vỏ xe (đế bắt bu-lông trên vỏ), mép dưới tự do thì giằng chéo
    let arms = P.arms;
    if (!arms) {
      const k = Math.max(1, Math.round(span / 6.5));
      arms = [];
      for (let i = 0; i <= k; i++) arms.push(P.a0 + 0.5 + (span - 1) * i / k);
    }
    const hT = P.hullTop !== undefined ? P.hullTop : P.hull;
    const sgn = side ? s : 1;
    const arm = (a, y, hull) => {
      const h = sgn * hull, len = Math.abs(at - h);
      if (len < 0.05) return;
      box(0.3, 0.3, len, pos(a, y, (at + h) / 2));
      box(1.1, 1.1, 0.22, pos(a, y, h + nrm * 0.11));
    };
    for (const a of arms) {
      if (P.skip && P.skip.some(([lo, hi]) => a > lo && a < hi)) continue;
      const yt = P.y1 - 0.45, yb = P.y0 + 0.45;
      arm(a, yt, hT);
      if (P.bottomFree) b.strut(pos(a, yt, sgn * hT), pos(a, yb, at), 0.13, steel, 5);
      else arm(a, yb, P.hull);
    }
  }

  // Bình chữa cháy trên giá kẹp: thân đỏ, cổ van, tay bóp, vòi rủ, 2 đai kẹp + tấm đỡ
  function extinguisher(b, M, x, y0, z, axis, n) {
    const L = 2.7, R = 0.55;
    const c = axis === 'y' ? [x, y0 + L / 2, z] : [x, y0 + R + 0.25, z];
    const along = axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const p = (t, o = [0, 0, 0]) => [c[0] + along[0] * t + o[0], c[1] + along[1] * t + o[1], c[2] + along[2] * t + o[2]];
    b.cyl(R, R, L, 12, M.ext, c, axis);
    b.cyl(R * 0.98, R * 0.7, 0.35, 12, M.ext, p(L / 2 + 0.17), axis);          // vai bình
    b.cyl(0.17, 0.2, 0.45, 8, M.metal, p(L / 2 + 0.55), axis);                 // van
    b.box(axis === 'y' ? 0.9 : 0.22, 0.22, axis === 'y' ? 0.22 : 0.9, M.steel, p(L / 2 + 0.78));   // tay bóp
    b.strut(p(L / 2 + 0.6), p(L / 2 - 0.9, axis === 'y' ? [R + 0.12, 0, 0] : [R + 0.12, 0, 0]), 0.09, M.rubber, 5);   // vòi
    for (const t of [-L * 0.28, L * 0.28]) {
      b.add(new THREE.TorusGeometry(R + 0.06, 0.08, 5, 14), M.steel, p(t), axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
    }
    // tấm đỡ phía sau bình (nằm về phía vỏ xe)
    const back = [c[0] + n[0] * (R + 0.15), c[1] + n[1] * (R + 0.15), c[2] + n[2] * (R + 0.15)];
    if (axis === 'y') b.box(1.3, L * 0.85, 0.16, M.steel, back, [0, Math.abs(n[0]) > 0.5 ? Math.PI / 2 : 0, 0]);
    else b.box(1.3, 0.16, L * 0.85, M.steel, back);
  }

  // Ống phóng lựu khói có sẵn trên mô hình (tag smokeL / smokeR): chưa lắp trang bị "Ống phóng lựu khói" thì gỡ đi
  // (thu gọn các đỉnh về 1 điểm + bỏ khỏi danh sách bộ phận để hệ thống hư hại không nhắm tới)
  function setStockSmoke(u, on) {
    const R = u.partRegistry;
    if (!R) return;
    const H = u._stockSmokeHidden || (u._stockSmokeHidden = {});
    for (const tag of ['smokeL', 'smokeR']) {
      if (on) {
        // lắp lại: trả các đỉnh về chỗ cũ
        const hid = H[tag];
        if (!hid) continue;
        for (const e of hid) {
          const pos = e.mesh.geometry.attributes.position;
          e.ranges.forEach(([st], k) => pos.array.set(e.saved[k], st * 3));
          pos.needsUpdate = true;
          e.mesh.geometry.computeBoundingSphere();
        }
        R[tag] = hid;
        delete H[tag];
        continue;
      }
      const list = R[tag];
      if (!list) continue;
      H[tag] = list;
      for (const e of list) {
        const pos = e.mesh.geometry.attributes.position;
        e.saved = e.ranges.map(([st, n]) => pos.array.slice(st * 3, (st + n) * 3));
        for (const [st, n] of e.ranges) {
          const x = pos.getX(st), y = pos.getY(st), z = pos.getZ(st);
          for (let i = st; i < st + n; i++) pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
        e.mesh.geometry.computeBoundingSphere();
      }
      delete R[tag];
    }
    if (u._partCenters) { delete u._partCenters.smokeL; delete u._partCenters.smokeR; }
  }
  function batch(u) {
    const PB = window.VehicleKit && VehicleKit.PartBatch;
    if (!PB) return null;
    const b = new PB(0);
    return b;
  }
  function buildBatch(u, b, parent) {
    const PB = VehicleKit.PartBatch;
    const prev = PB.registry;
    PB.registry = u.partRegistry || (u.partRegistry = {});
    try { b.build(parent, null, { castShadow: true }); } finally { PB.registry = prev; }
  }

  // ---- Lá ngụy trang ----
  // 'green' (rừng / đồng cỏ) | 'dry' (sa mạc: bụi khô ngả vàng ô-liu). Trong trận theo bản đồ, phòng xem theo phe.
  function foliageKind(u) {
    if (u._foliageKind === 'green' || u._foliageKind === 'dry') return u._foliageKind;   // phòng thử ép loại lá
    const g = window.game;
    if (g && u.scene && u.scene === g.scene && g.currentMapType) return g.currentMapType === 'DESERT' ? 'dry' : 'green';
    return u.team === 'RED' ? 'dry' : 'green';
  }
  const foliageCache = {};
  function foliageMats(kind) {
    if (foliageCache[kind]) return foliageCache[kind];
    // Atlas 256 x 128: nửa trái = lá dày (khối bụi lá), nửa phải = chùm lá thưa dần ra mép (tấm lá rủ có viền lởm chởm)
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const pal = kind === 'dry'
      ? [[96, 90, 54], [114, 104, 62], [78, 72, 42], [86, 70, 44]]
      : [[40, 52, 27], [52, 66, 33], [31, 41, 22], [50, 52, 30]];
    let seed = kind === 'dry' ? 11 : 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const leafAt = (x, y, i, sc) => {
      const p = pal[i % pal.length], k = 0.75 + r() * 0.45;
      g.fillStyle = `rgba(${p[0] * k | 0},${p[1] * k | 0},${p[2] * k | 0},0.97)`;
      g.beginPath(); g.ellipse(x, y, (3 + r() * 4) * sc, (1.3 + r() * 2) * sc, r() * 6.3, 0, 6.3); g.fill();
    };
    g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.clip();
    for (let i = 0; i < 640; i++) leafAt(r() * 128, r() * 128, i, 1);
    g.restore();
    g.save(); g.beginPath(); g.rect(129, 0, 127, 128); g.clip();
    // cuống / cành nhỏ treo lá
    g.strokeStyle = kind === 'dry' ? 'rgba(80,66,44,0.95)' : 'rgba(52,44,30,0.95)'; g.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) { const x = 140 + r() * 104; g.beginPath(); g.moveTo(x, 4); g.lineTo(x + (r() - 0.5) * 30, 40 + r() * 70); g.stroke(); }
    for (let i = 0; i < 900; i++) {
      const x = 129 + r() * 127, y = r() * 128;
      // dày ở giữa & mép trên (chỗ buộc vào lưới), thưa dần xuống dưới và ra hai bên -> viền lởm chởm
      const dx = Math.abs(x - 192.5) / 64, dy = y / 128;
      if (r() > 1.15 - dx * 0.75 - dy * 0.75) continue;
      leafAt(x, y, i, 1.1);
    }
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const leaf = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const twig = new THREE.MeshStandardMaterial({ color: kind === 'dry' ? 0x5a4a34 : 0x3b3223, roughness: 0.95, metalness: 0 });
    leaf.userData.surface = twig.userData.surface = 'cloth';
    return (foliageCache[kind] = { leaf, twig });
  }
  // Khối tán lá: cầu đa diện méo ngẫu nhiên (đỉnh trùng nhau dời cùng một lượng -> không hở mặt)
  let clumpGeo = null;
  function foliageClump() {
    if (!clumpGeo) {
      clumpGeo = new THREE.IcosahedronGeometry(1, 1);
      const p = clumpGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        const k = 0.78 + (h - Math.floor(h)) * 0.4;
        p.setXYZ(i, x * k, y * k * (y < 0 ? 0.55 : 1), z * k);   // đáy bẹt áp lên vỏ xe
      }
      clumpGeo.computeVertexNormals();
      const uv = clumpGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.497);   // nửa trái atlas: lá dày
    }
    return clumpGeo.clone();
  }

  // ---------------------------------------------------------------------------
  // LƯỚI LÁ NGỤY TRANG: "bụi cây di động"
  // - nhiều lớp bụi lá chồng nhau (lá cắt viền alpha), mép lởm chởm rủ xuống che bánh / xích, cành nhô phá đường viền
  // - lá nhiều sắc độ (ô-liu, xanh rêu, nâu khô) bằng vertex color -> vẫn 1 vật liệu, 1 draw call mỗi nhóm
  // - lá quấn dọc nòng (gắn barrelGroup: xoay tháp, nâng hạ, giật nòng đều theo), chừa bầu hút khói & đầu nòng
  // - lá đung đưa (vertex shader): gió nhẹ, rung mạnh khi xe chạy / bắn / trúng đạn; trúng đạn rơi vài lá
  // - tấm vải màu phe đặt trên lớp lá: vẫn nhận ra phe từ trên cao
  // ---------------------------------------------------------------------------
  const LEAF_TINTS = {
    green: [[1, 1, 1], [0.8, 0.96, 0.72], [1.34, 1.08, 0.7], [0.7, 0.8, 0.6]],     // ô-liu, xanh rêu, nâu khô, rêu sẫm
    dry: [[1, 1, 1], [0.86, 0.92, 0.72], [1.18, 0.96, 0.74], [0.76, 0.72, 0.6]]
  };
  // Dải lá trên nòng (hệ tọa độ barrelGroup: trục nòng = -Z): đoạn [z đầu, z cuối] chừa bầu hút khói & 1/3 đầu nòng
  const BARREL_LEAF = {
    // phủ gần hết nòng tới sát đầu nòng (chừa bầu hút khói, miệng nòng / hãm lùi; Arbalest chừa chỗ nòng gác lên giá khóa)
    ALL_ROUNDER: { r: 1.3, segs: [[-6.5, -20.6], [-29.2, -53.6]] },
    ARTILLERY: { r: 1.45, segs: [[-5, -30.2], [-38.2, -64.6]] }
  };
  let clumpLoGeo = null;
  function foliageClumpLo() {   // khối lá thô (20 tam giác) cho lớp phụ & nòng
    if (!clumpLoGeo) {
      clumpLoGeo = new THREE.IcosahedronGeometry(1, 0);
      const p = clumpLoGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (p.getY(i) < 0 ? 0.55 : 1));
      clumpLoGeo.computeVertexNormals();
      const uv = clumpLoGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.497);
    }
    return clumpLoGeo.clone();
  }
  // Tấm lá rủ: mặt phẳng lấy nửa phải atlas (chùm lá dày ở trên, thưa dần ra mép -> viền lởm chởm)
  function leafCardGeo() {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.503 + uv.getX(i) * 0.497);
    return g;
  }
  function tinted(geo, c) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  // Vật liệu lá riêng từng xe (độ rung riêng), dùng chung chương trình shader
  function swayLeafMat(kind) {
    const base = foliageMats(kind).leaf;
    const m = base.clone();
    m.vertexColors = true;
    const U = { uTime: { value: Math.random() * 20 }, uAmp: { value: 0.12 }, uShake: { value: 0 }, uFT: { value: 0 } };
    m.userData.sway = U;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uAmp = U.uAmp;
      sh.uniforms.uShake = U.uShake;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uShake;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float vkPh = position.x * 0.37 + position.z * 0.29 + position.y * 0.53;
          float vkW = 0.55 + 0.45 * sin(position.y * 1.7 + position.x * 0.9);
          transformed.x += sin(uTime * 2.1 + vkPh) * uAmp * vkW;
          transformed.z += cos(uTime * 1.7 + vkPh * 1.3) * uAmp * vkW;
          transformed.y += sin(uTime * 2.9 + vkPh * 0.7) * uAmp * 0.3 * vkW;
          // sóng nổ đầu nòng / trúng đạn: cả lớp lá giật rung nhanh rồi tắt dần (uShake 1 -> 0)
          transformed.x += sin(uTime * 37.0 + vkPh * 3.1) * uShake * 0.55 * vkW;
          transformed.y += sin(uTime * 43.0 + vkPh * 2.3) * uShake * 0.35 * vkW;
          transformed.z += cos(uTime * 41.0 + vkPh * 2.7) * uShake * 0.55 * vkW;`);
      // lá bắt lửa: héo, cháy xém, quăn, tàn thành tro (src/gameplay/camo_fire.js)
      if (window.CamoFire) CamoFire.patchShader(sh, U);
    };
    m.customProgramCacheKey = () => (window.CamoFire ? 'vkLeafSway3' : 'vkLeafSway2');
    return m;
  }
  const PANEL_MAT = {};
  function factionPanelMat(team) {
    const k = team === 'RED' ? 'RED' : 'BLUE';
    return PANEL_MAT[k] || (PANEL_MAT[k] = new THREE.MeshStandardMaterial({
      color: k === 'BLUE' ? 0x2f62a6 : 0xb4422b, emissive: k === 'BLUE' ? 0x0b2a5c : 0x5c140b, emissiveIntensity: 0.22, roughness: 0.95, metalness: 0, side: THREE.DoubleSide
    }));
  }

  function buildFoliage(u, F, T, len) {
    const kind = foliageKind(u), Lm = foliageMats(kind), leaf = swayLeafMat(kind), tw = Lm.twig, tints = LEAF_TINTS[kind];
    const rnd = (window.VehicleKit && VehicleKit.mulberry32) ? VehicleKit.mulberry32(977 + u.tankType.length * 31 + (u.team === 'RED' ? 7 : 0)) : Math.random;
    const R = (a, b) => a + rnd() * (b - a);
    const tint = () => { const r = rnd(); return tints[r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.88 ? 2 : 3]; };
    // Ô cháy (CamoFire): mỗi bụi lá / tấm lá rủ là một ô; ghi thứ tự & số đỉnh từng mảnh lá trong mesh gộp của batch
    const cfCells = [], cfRec = new Map();
    let cfCur = -1;
    const cfCell = (b, x, y, z, r) => { cfCells.push({ b, x, y, z, r }); return cfCells.length - 1; };
    const cfAdd = (b, g, x, y, z, r) => {
      const c = cfCur >= 0 ? cfCur : cfCell(b, x, y, z, r);
      let L = cfRec.get(b);
      if (!L) cfRec.set(b, (L = []));
      L.push(c, g.attributes.position.count);
      return g;
    };
    const clump = (b, x, y, z, sx, sy, sz, lo) => b.add(cfAdd(b, tinted(lo ? foliageClumpLo() : foliageClump(), tint()), x, y, z, Math.max(sx, sz)), leaf, [x, y, z], [R(-0.3, 0.3), R(0, 6.28), R(-0.3, 0.3)], [sx, sy, sz]);
    const card = (b, pos, rot, sc) => b.add(cfAdd(b, tinted(leafCardGeo(), tint()), pos[0], pos[1], pos[2], Math.max(sc[0], sc[1]) * 0.5), leaf, pos, rot, sc);
    const twig = (b, x, y, z, h) => b.strut([x, y, z], [x + R(-1.6, 1.6), y + h, z + R(-1.6, 1.6)], 0.12, tw, 4, 0.04);
    const bush = (b, x, y, z, sx, sy, sz) => {
      cfCur = cfCell(b, x, y + sy * 0.3, z, Math.max(sx, sz));
      try { bushParts(b, x, y, z, sx, sy, sz); } finally { cfCur = -1; }
    };
    const bushParts = (b, x, y, z, sx, sy, sz) => {
      clump(b, x, y, z, sx, sy, sz);
      // lớp lá thứ 2 nhỏ hơn chồng lệch lên trên -> dày, nhiều lớp
      if (rnd() < 0.7) clump(b, x + R(-0.5, 0.5) * sx, y + sy * R(0.35, 0.6), z + R(-0.5, 0.5) * sz, sx * R(0.5, 0.7), sy * R(0.55, 0.75), sz * R(0.5, 0.7), true);
      card(b, [x + R(-0.4, 0.4) * sx, y + sy * 0.5, z + R(-0.4, 0.4) * sz], [R(-0.5, 0.5), R(0, 3.14), R(-0.4, 0.4)], [sx * 1.7, sy * 1.7, 1]);
      if (rnd() < 0.7) twig(b, x, y, z, sy * R(1.4, 2.6));
    };
    // Mỗi nhóm lá một nhãn bộ phận riêng: khi bị hất văng, mỗi phần giữ đúng hệ tọa độ của nhóm cha
    // (trước đây chung 1 nhãn -> lá trên nòng bị đặt theo hệ thân xe, rơi thành khối nằm ngang dưới đất)
    const fh = batch(u), ft = batch(u), fb = batch(u), fp = batch(u);
    fh.setTag('camoKit'); ft.setTag('camoKitT'); fb.setTag('camoKitB'); fp.setTag('camoKitP');

    // ---- THÂN XE ----
    const top = F.y1 + 0.6, z0 = F.zF + len * 0.1, z1 = F.zR - 1.2;
    const ringClear = (x, z) => u.tankType === 'SCOUT' && Math.hypot(x, z - 2.6) < 4.6;   // chừa vòng xoay súng Marten
    const drape = (b, x, y, z, ry, w, h) => card(b, [x, y, z], [R(-0.12, 0.12), ry + R(-0.3, 0.3), R(-0.15, 0.15)], [w, h, 1]);
    if (u.tankType === 'SCOUT') {
      // Marten: phủ nóc + phần sau thân; CHỪA kính chắn gió, ô kính cửa, đèn pha, gương (lái xe & trưởng xe vẫn nhìn được)
      const RY = 15.4;
      for (let z = -5.4; z <= 17.2; z += R(2.6, 3.2)) {
        for (const s of [-1, 1]) {
          const x = s * R(5.6, 6.6);
          if (!ringClear(x, z) && !(z < -3.2 && Math.abs(x) > 5.4)) bush(fh, x, RY + 0.3, z, R(3.0, 3.8), R(1.6, 2.3), R(3.0, 3.8));
          if (!ringClear(s * 2.2, z)) bush(fh, s * R(1.6, 2.8), RY + 0.4, z, R(2.8, 3.6), R(1.4, 2.1), R(2.8, 3.6));
          // viền lá ngắn rủ mép nóc: chỉ tới trên mép ô kính cửa (y ~14.6)
          drape(fh, s * 7.9, RY - 0.2, z, Math.PI / 2, R(3.2, 4.2), R(1.2, 1.6));
        }
      }
      // mép nóc trước: diềm lá rất ngắn trên mép kính chắn gió (không rủ xuống kính)
      for (let x = -6; x <= 6.01; x += 3) drape(fh, x, RY + 0.2, -6.6, 0, R(3, 3.8), R(0.9, 1.2));
      // khoang sau cửa sau (không có kính): lá rủ phủ kín sườn tới vè sau
      for (const s of [-1, 1]) for (let z = 8.6; z <= 17.4; z += R(2.4, 3.0)) {
        drape(fh, s * 8.4, 12.4, z, Math.PI / 2, R(3.6, 4.6), R(3.4, 4.2));
        drape(fh, s * 8.6, 9.0, z + 1, Math.PI / 2, R(3.2, 4.2), R(2.6, 3.4));
      }
      // đuôi xe: lá rủ kín cửa sau (cửa sau không có kính)
      for (let x = -6.6; x <= 6.61; x += R(2.8, 3.4)) { drape(fh, x, 13.4, 18.6, 0, R(3.4, 4.2), R(3.2, 4)); drape(fh, x + 1, 9.6, 18.8, 0, R(3, 3.8), R(2.6, 3.2)); }
    } else if (u.tankType === 'ARTILLERY') {
      // Arbalest: nóc + diềm cabin (chừa kính chắn gió, kính cửa, đèn và hành lang nòng gác trên giá khóa),
      // lưới tản nhiệt mặt trước, nóc khoang máy (tránh ống xả nóng), sàn trước tháp, sườn sàn rủ trùm bánh
      const CR = 22.5;
      for (let z = -33.0; z <= -19.6; z += R(2.6, 3.2)) {
        for (const s of [-1, 1]) {
          bush(fh, s * R(7.4, 8.8), CR + 0.3, z, R(3.0, 3.8), R(1.6, 2.3), R(3.0, 3.8));
          if (Math.abs(z + 21.6) > 2.2) bush(fh, s * R(4.4, 5.6), CR + 0.3, z, R(2.6, 3.2), R(1.4, 2.0), R(2.6, 3.2));
          drape(fh, s * 11.0, CR - 0.4, z, Math.PI / 2, R(3.4, 4.2), R(1.2, 1.6));          // diềm sườn trên mép kính cửa
          drape(fh, s * 11.0, 11.4, z + R(-0.5, 0.5), Math.PI / 2, R(3.2, 4.0), R(2.0, 2.6));   // ốp lá dưới cửa, trên hốc bánh
        }
      }
      for (let x = -9.6; x <= 9.61; x += 2.4) drape(fh, x, CR, -34.4, 0, R(2.8, 3.4), R(1.0, 1.4));      // diềm trên kính chắn gió
      for (let x = -6.4; x <= 6.41; x += R(2.6, 3.2)) drape(fh, x, 13.2, -38.2, 0, R(3.2, 4.0), R(2.8, 3.4));   // lưới tản nhiệt
      for (const s of [-1, 1]) drape(fh, s * 9.8, 13.6, -38.0, 0, R(2.4, 3.0), R(2.4, 3.0));
      for (let z = -18.0; z <= -11.6; z += R(2.6, 3.0)) for (const x of [-6.5, -2.2, 2.2, 6.0]) {
        if (Math.hypot(x - 9.6, z + 12) < 3.2) continue;
        bush(fh, x + R(-0.6, 0.6), 17.4, z, R(2.8, 3.4), R(1.4, 2.0), R(2.8, 3.4));
      }
      for (const s of [-1, 1]) for (let z = -18.0; z <= -11.8; z += 3.2) drape(fh, s * 9.9, 15.0, z, Math.PI / 2, R(3.2, 3.8), R(3.2, 4.0));
      // sàn trước tháp (ngoài vòng quay của tháp) + sườn sàn: lá rủ trùm nửa trên bánh
      for (let z = -10.2; z <= -2.4; z += R(2.6, 3.2)) for (const s of [-1, 1]) bush(fh, s * R(7.6, 9.2), 13.0, z, R(3.0, 3.6), R(1.5, 2.2), R(3.0, 3.6));
      for (const s of [-1, 1]) for (let z = -10.2; z <= 36.6; z += R(2.6, 3.4)) drape(fh, s * 10.9, 10.4, z, Math.PI / 2, R(3.6, 4.6), R(3.2, 4.2));
    } else {
    // Giáp mũi xe xích: lá phủ dọc mép trên & sườn giáp mũi, chừa giữa (kính tiềm vọng lái xe)
    const gl = u.tankType === 'ALL_ROUNDER' ? (z) => Math.min(12.8, 9.4 + (z + 31) * 0.34) : (z) => Math.min(14.2, 9.6 + (z + 30.6) * 0.286);
    for (let z = F.zF + 1.5; z < z0 + 1; z += R(2.4, 3.0)) {
      for (let x = -F.hw + 2.6; x <= F.hw - 2.6; x += R(3.2, 3.9)) {
        if (Math.abs(x) < 3.4) continue;
        bush(fh, x, gl(z) + 0.2, z, R(3.0, 3.8), R(1.5, 2.2), R(3.0, 3.6));
      }
    }
    for (let x = -F.hw + 1.5; x <= F.hw - 1.4; x += R(3.0, 3.8)) if (Math.abs(x) > 3.2) drape(fh, x, gl(F.zF) - 0.6, F.zF - 0.6, 0, R(3.4, 4.4), R(2.4, 3.2));
    for (const s of [-1, 1]) {
      for (let z = z0; z <= z1; z += R(2.5, 3.1)) bush(fh, s * (F.hw - R(0.4, 1.8)), top - R(0, 0.8), z, R(3.8, 4.8), R(2.3, 3.3), R(3.6, 4.6));
      for (let z = z0 + 1.5; z <= z1; z += R(3.2, 4.0)) { const x = s * (F.hw - R(4, 5.5)); if (!ringClear(x, z)) bush(fh, x, top - R(0.2, 0.6), z, R(3.2, 4.2), R(1.6, 2.4), R(3.2, 4.2)); }
      // mép lá lởm chởm rủ xuống sườn: tầng trên + tầng dưới phủ tới đỉnh bánh / xích / váy xích
      for (let z = z0; z <= z1; z += R(2.6, 3.6)) card(fh, [s * (F.hw + 0.7), top - 2.0, z], [0, Math.PI / 2 + R(-0.3, 0.3), R(-0.15, 0.15)], [R(4.5, 6.5), R(3.2, 4.6), 1]);
      for (let z = z0 + 1; z <= z1; z += R(3.2, 4.4)) card(fh, [s * (F.hw + 1.0), F.y0 + R(0.4, 1.4), z], [0, Math.PI / 2 + R(-0.35, 0.35), R(-0.2, 0.2)], [R(4, 6), R(3, 4.4), 1]);
    }
    // đuôi xe: lá rủ
    for (let x = -F.hw * 0.85; x <= F.hw * 0.86; x += R(3.5, 5)) card(fh, [x, top - 2.2, F.zR + 0.8], [R(-0.2, 0.2), R(-0.3, 0.3), R(-0.2, 0.2)], [R(4, 5.5), R(3, 4.4), 1]);
    // sàn sau (sau tháp) / nóc xe không tháp
    const rz0 = T ? Math.min(F.zR - 4, T.zR + 3) : F.zF + len * 0.35;
    for (let z = rz0; z <= z1; z += R(3.0, 3.8)) {
      for (let x = -F.hw * 0.62; x <= F.hw * 0.63; x += R(3.4, 4.4)) { const xx = x + R(-1, 1); if (!ringClear(xx, z)) bush(fh, xx, F.netY + 0.4, z, R(3.6, 4.6), R(1.8, 2.8), R(3.6, 4.6)); }
    }
    }
    let panelHost = null, panelPos = null;
    // ---- THÁP ----
    if (T && u.turretGroup) {
      const ty = (REAL_ROOF[u.tankType] || T.roof) + 0.4, tl = T.zR - T.zF;
      for (let i = 0; i < 18; i++) {   // lá rủ quanh sườn tháp
        const a = (i / 18) * Math.PI * 2 + 0.3;
        const x = Math.sin(a) * (T.hw + 0.4), z = (T.zF + T.zR) / 2 - Math.cos(a) * tl * 0.5;
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.5) continue;
        card(ft, [x, ty - 2.4, z], [0, a + R(-0.25, 0.25), R(-0.15, 0.15)], [R(4.2, 6), R(3, 4.4), 1]);
      }
      for (let i = 0; i < 28; i++) {   // viền nóc tháp (trừ giữa phía trước: nòng + kính ngắm)
        const a = (i / 28) * Math.PI * 2;
        const x = Math.sin(a) * T.hw * 0.92, z = (T.zF + T.zR) / 2 - Math.cos(a) * tl * 0.46;
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.45) continue;
        bush(ft, x, ty - R(0, 1.2), z, R(3.0, 4.0), R(1.9, 2.8), R(3.0, 4.0));
      }
      for (let i = 0; i < 14; i++) {   // giữa-sau nóc tháp
        const x = R(-T.hw * 0.65, T.hw * 0.65), z = T.zF + tl * R(0.4, 0.95);
        if (u.tankType === 'ARTILLERY' && Math.abs(x) < 5.4 && z < 6.5) continue;   // chừa hộp bệ nòng 155
        bush(ft, x, ty + 0.2, z, R(3.2, 4.2), R(1.5, 2.2), R(3.2, 4.2));
      }
      panelHost = ft; panelPos = [T.hw * 0.25, ty + 3.0, T.zF + tl * 0.7];
    } else if (u.turretGroup && u.tankType === 'SCOUT') {
      // Marten: lá cắm trên mép tấm chắn súng & quanh vòng xoay (không che đường đạn súng máy)
      for (const s of [-1, 1]) {
        clump(ft, s * 1.6, 4.55, -2.6, R(1.3, 1.7), R(0.8, 1.1), R(1.1, 1.4));
        card(ft, [s * 2.55, 3.2, -2.5], [0, Math.PI / 2 + s * 0.3, R(-0.2, 0.2)], [2.4, 2.6, 1]);
      }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; if (Math.cos(a) > 0.6) continue; card(ft, [Math.sin(a) * 2.4, 0.9, Math.cos(a) * 2.4], [0, a, 0], [2.4, 1.6, 1]); }
      panelHost = fh; panelPos = [0, F.netY + 3.2, F.zR - 7];
    }
    // ---- NÒNG / HỘP PHÁO ----
    const BL = BARREL_LEAF[u.tankType];
    if (BL && u.barrelGroup) {
      for (const [a, b] of BL.segs) {
        for (let z = a; z >= b; z -= R(1.5, 2.0)) {
          clump(fb, R(-0.3, 0.3), BL.r * 0.55, z, R(1.5, 2.1), R(0.9, 1.3), R(1.6, 2.2), true);
          if (rnd() < 0.6) for (const s of [-1, 1]) card(fb, [s * (BL.r + 0.25), -BL.r * 0.25, z], [0, Math.PI / 2 + R(-0.3, 0.3), s * R(0.1, 0.3)], [R(2.0, 2.8), R(1.6, 2.2), 1]);
        }
      }
    } else if (u.tankType === 'GATLING' && u.barrelPivot) {
      // pháo 6 nòng: lá trên hộp giáp bao khối pháo, không che cụm nòng xoay
      for (let z = -5.2; z <= 1.6; z += R(1.8, 2.4)) for (const x of [-2.2, 0, 2.2]) clump(fp, x + R(-0.4, 0.4), 2.9, z, R(1.6, 2.1), R(0.9, 1.3), R(1.6, 2.1), true);
      for (const s of [-1, 1]) for (let z = -4.6; z <= 1.2; z += 2.6) card(fp, [s * 3.9, 0.6, z], [0, Math.PI / 2 + R(-0.3, 0.3), R(-0.2, 0.2)], [2.8, 3.2, 1]);
    }
    // tấm vải màu phe nằm trên lớp lá (nhận ra phe từ trên cao)
    if (panelHost) panelHost.box(4.6, 0.08, 3.2, factionPanelMat(u.team), panelPos, [R(-0.08, 0.08), R(-0.3, 0.3), R(-0.08, 0.08)]);

    const meshes = [], cfParts = [];
    const grab = (b, parent, tag) => {
      const kids = parent.children.length;
      buildBatch(u, b, parent);
      const mine = [];
      for (let i = kids; i < parent.children.length; i++) { meshes.push(parent.children[i]); mine.push(parent.children[i]); }
      if (cfRec.has(b)) cfParts.push({ b, parent, tag, mesh: mine.find(m => m.material === leaf) || null, rec: cfRec.get(b), panel: mine.find(m => m.material === factionPanelMat(u.team)) || null });
    };
    grab(fh, u.chassisGroup, 'camoKit');
    if (u.turretGroup) grab(ft, u.turretGroup, 'camoKitT');
    if (u.barrelGroup && fb.buckets.size) grab(fb, u.barrelGroup, 'camoKitB');
    if (u.barrelPivot && fp.buckets.size) grab(fp, u.barrelPivot, 'camoKitP');
    if (window.CamoFire && cfCells.length) {
      const pi = new Map(cfParts.map((p, i) => [p.b, i]));
      for (const c of cfCells) { c.p = pi.has(c.b) ? pi.get(c.b) : -1; delete c.b; }
      let panel = null;
      const pp = cfParts.find(p => p.panel);
      if (pp && panelPos) {
        let best = -1, bd = Infinity;
        const k = cfParts.indexOf(pp);
        cfCells.forEach((c, i) => { if (c.p !== k) return; const d = (c.x - panelPos[0]) ** 2 + (c.y - panelPos[1]) ** 2 + (c.z - panelPos[2]) ** 2; if (d < bd) { bd = d; best = i; } });
        panel = { mesh: pp.panel, cell: best };
      }
      CamoFire.prepare(u, { kind, leaf, twig: tw, cells: cfCells, parts: cfParts.map(p => ({ parent: p.parent, tag: p.tag, mesh: p.mesh, rec: p.rec })), panel });
    }
    // Lá không chặn đạn (tia dò đạn đi xuyên, như lá thật) và không bị bóp méo khi xe thành xác
    for (const m of meshes) { m.userData.isFxDecal = true; m.userData.noDeform = true; }
    // cành & lá trên nòng là chi tiết nhỏ: ẩn khi xe ở xa (Equipment.update)
    u._camoDetail = meshes.filter(m => m.material === tw || m.parent === u.barrelGroup || m.parent === u.barrelPivot);
    u._camoLeaf = leaf;
    u._camoMeshes = meshes;
    u._camoHp = u.hp;
    // Rung lá + lá rơi chạy theo khung hình vẽ (cả phòng xem xe lẫn trong trận)
    const host = meshes.find(m => m.material === leaf);
    if (host) {
      let last = performance.now();
      host.onBeforeRender = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        stepFoliage(u, dt);
      };
    }
  }

  // Lá rơi khi trúng đạn (mỗi xe tối đa ~24 lá đang bay)
  let leafPlane = null;
  function dropLeaves(u, n) {
    if (!u.scene || !u.chassisGroup) return;
    if (window.CamoFire && CamoFire.leafless(u)) return;   // lưới đã / đang cháy: không còn lá xanh để rụng
    const F = FIT[u.tankType];
    if (!F) return;
    const kind = foliageKind(u), mat = foliageMats(kind).leaf;
    if (!leafPlane) { leafPlane = leafCardGeo(); leafPlane.scale(1.4, 1.4, 1); }
    u._leafFx = u._leafFx || [];
    u.chassisGroup.updateMatrixWorld(true);
    for (let i = 0; i < n && u._leafFx.length < 24; i++) {
      const m = new THREE.Mesh(leafPlane, mat);
      m.position.set((Math.random() - 0.5) * F.hw * 1.8, F.y1 + 2 + Math.random() * 4, F.zF + Math.random() * (F.zR - F.zF)).applyMatrix4(u.chassisGroup.matrixWorld);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      u.scene.add(m);
      u._leafFx.push({ m, vx: (Math.random() - 0.5) * 10, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 10, life: 2.4 + Math.random() * 1.6, spin: (Math.random() - 0.5) * 6, y0: (u.y || 0) + 0.5 });
    }
  }
  function stepFoliage(u, dt) {
    const L = u._camoLeaf;
    if (!L || !(dt > 0)) return;
    u._camoT = performance.now();
    const U = L.userData.sway;
    U.uTime.value += dt;
    const vmax = u.baseMaxSpeed || 120, v = Math.min(1, Math.abs(u.speed || 0) / vmax);
    let kick = u._camoKick || 0, shake = u._camoShake || 0;
    // Khai hỏa: sóng nổ đầu nòng giật cả lưới lá (rung mạnh tức thì rồi tắt dần), pháo lớn làm rụng vài lá
    const rec = u.barrelRecoil || 0;
    if (rec > (u._camoRec || 0) + 0.5) {
      const big = u.tankType === 'ARTILLERY' || u.tankType === 'ALL_ROUNDER';
      shake = Math.max(shake, big ? 1 : 0.6); kick = Math.max(kick, 0.9);
      if (big) dropLeaves(u, 3 + Math.floor(Math.random() * 4));
    }
    u._camoRec = rec;
    if ((u.gatlingShotFlash || 0) > 0.5 || u.isFiringGatling) { shake = Math.max(shake, 0.35); kick = Math.max(kick, 0.55); }
    if (rec > 0.5) kick = Math.max(kick, 0.55);
    if (u._camoHp !== undefined && u.hp < u._camoHp - 1e-6) { kick = 1; shake = Math.max(shake, 0.8); dropLeaves(u, 6 + Math.floor(Math.random() * 5)); }
    u._camoHp = u.hp;
    kick *= Math.exp(-dt * 2.5);
    shake *= Math.exp(-dt * 4.5);
    u._camoKick = kick; u._camoShake = shake;
    const target = u.isDead ? 0 : 0.12 + v * 0.38 + kick * 0.7;
    U.uAmp.value += (target - U.uAmp.value) * Math.min(1, dt * 4);
    U.uShake.value = u.isDead ? 0 : shake;
    if (u._leafFx && u._leafFx.length) {
      for (let i = u._leafFx.length - 1; i >= 0; i--) {
        const p = u._leafFx[i];
        p.life -= dt;
        p.vy = Math.max(p.vy - 16 * dt, -7);
        p.vx *= Math.exp(-dt * 1.5); p.vz *= Math.exp(-dt * 1.5);
        p.m.position.x += (p.vx + Math.sin(p.life * 5) * 2.5) * dt;
        p.m.position.y = Math.max(p.y0, p.m.position.y + p.vy * dt);
        p.m.position.z += p.vz * dt;
        p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
        if (p.life < 0.6) p.m.scale.setScalar(Math.max(0.01, p.life / 0.6));
        if (p.life <= 0) { if (p.m.parent) p.m.parent.remove(p.m); u._leafFx.splice(i, 1); }
      }
    }
  }

  function buildVisuals(u) {
    if (u._eqBuilt || !u.kit || !u.kit.m.length || !u.chassisGroup || !window.VehicleKit) return;
    u._eqBuilt = true;
    const F = FIT[u.tankType];
    if (!F) return;
    const M = kitMats(u.team);
    const hull = batch(u), tur = batch(u);
    const T = F.tur;
    const len = F.zR - F.zF;

    const SC = u.tankType === 'SCOUT', AR = u.tankType === 'ARTILLERY';
    if (has(u, 'applique') && SC) {
      // Xe trinh sát 4x4: tấm composite ốp nửa dưới 2 cánh cửa + sườn giữa 2 hốc bánh (chừa ô kính cửa, không trùm hốc bánh)
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        for (const [z0, z1] of [[-6.2, -2.3], [-2.0, 1.9], [2.2, 6.0]]) {
          hull.box(0.9, 6.2, z1 - z0, M.plate, [s * 8.45, 9.1, (z0 + z1) / 2]);
          hull.boltRow([s * 8.92, 11.8, z0 + 0.4], [s * 8.92, 11.8, z1 - 0.4], 3, 'x', M.steel, 0.12, s);
          hull.boltRow([s * 8.92, 6.4, z0 + 0.4], [s * 8.92, 6.4, z1 - 0.4], 3, 'x', M.steel, 0.12, s);
        }
      }
    } else if (has(u, 'applique') && AR) {
      // Xe pháo: tấm composite ốp cửa cabin dưới ô kính (trên hốc bánh trước) + má tháp, sát vỏ thật
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        for (const [z0, z1] of [[-33.8, -26.9], [-26.6, -19.4]]) hull.box(1.2, 2.6, z1 - z0, M.plate, [s * 11.3, 13.6, (z0 + z1) / 2]);
      }
      if (u.turretGroup) {
        tur.setTag('appliqueKitT');
        for (const s of [-1, 1]) tur.box(1.4, 7.8, 7.6, M.plate, [s * 10.4, 5.1, -6.4]);
      }
    } else if (has(u, 'applique')) {
      // Tấm composite dày ở 2/3 trước sườn thân + má tháp
      const z0 = F.zF + 3, z1 = F.zF + len * 0.68;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        const n = 4, step = (z1 - z0) / n;
        for (let i = 0; i < n; i++) hull.box(1.4, F.y1 - F.y0 + 0.6, step - 0.4, M.plate, [s * (F.hw + 0.75), (F.y0 + F.y1) / 2, z0 + step * (i + 0.5)]);
      }
      if (T && u.turretGroup) {
        tur.setTag('appliqueKitT');
        for (const s of [-1, 1]) tur.box(1.6, T.h * 0.62, (T.zR - T.zF) * 0.38, M.plate, [s * (T.hw + 0.8), T.h * 0.42, T.zF + (T.zR - T.zF) * 0.22]);
      }
    }
    if (has(u, 'era') && SC) {
      // Xe trinh sát: gạch nổ cỡ nhỏ, mỏng ốp lên nửa dưới cửa / sườn giữa 2 hốc bánh (5 cột x 3 hàng mỗi bên)
      const off = has(u, 'applique') ? 0.9 : 0;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        for (let c = 0; c < 5; c++) {
          for (let r = 0; r < 3; r++) hull.box(0.6, 1.8, 2.2, M.era, [s * (8.0 + off + 0.32), 7.1 + r * 2.0, -4.9 + c * 2.45]);
        }
      }
    } else if (has(u, 'era')) {
      // Gạch nổ: 2 hàng trên sườn phía trước, 1 hàng ở mũi dưới, má tháp
      const off = has(u, 'applique') ? 1.6 : 0;
      const bw = 3.3, gap = 0.3, z0 = F.zF + 2.5, z1 = F.zF + len * 0.5 + F.eraZ1;
      const rows = F.y1 - F.y0 > 5 ? 2 : 1, bh = (F.y1 - F.y0) / rows - 0.3;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        for (let z = z0; z + bw <= z1; z += bw + gap) {
          for (let r = 0; r < rows; r++) hull.box(0.9, bh, bw, M.era, [s * (F.hw + 0.55 + off), F.y0 + (bh + 0.3) * (r + 0.5), z + bw / 2]);
        }
      }
      hull.setTag('eraKitF');
      const fw = F.hw - 3;
      for (let x = -fw; x + bw <= fw + 0.01; x += bw + gap) hull.box(bw, 2.6, 0.9, M.era, [x + bw / 2, F.y0 + 0.6, F.zF - 0.5]);
      if (T && u.turretGroup && u.tankType !== 'ARTILLERY') {
        for (const s of [-1, 1]) {
          tur.setTag(s < 0 ? 'eraKitTL' : 'eraKitTR');
          const tz0 = T.zF + 1, tz1 = T.zF + (T.zR - T.zF) * 0.45;
          for (let z = tz0; z + 2.8 <= tz1; z += 3.1) tur.box(0.9, T.h * 0.42, 2.8, M.era, [s * (T.hw + 0.55 + (has(u, 'applique') ? 1.7 : 0)), T.h * 0.5, z + 1.4]);
        }
        tur.setTag('eraKitTF');
        for (let x = -T.hw * 0.62; x + 2.9 <= T.hw * 0.62 + 0.01; x += 3.2) tur.box(2.9, T.h * 0.36, 0.9, M.era, [x + 1.45, T.h * 0.36, T.zF - 0.5]);
      }
    }
    if (has(u, 'slat') && CAGE[u.tankType]) {
      // Lồng thép chống RPG: tấm khung + nan dẹt cách vỏ ~2 đơn vị, tay đỡ bắt bu-lông vào thân (xem CAGE)
      for (const P of CAGE[u.tankType]) {
        if (P.kind === 'side') {
          for (const s of [-1, 1]) { hull.setTag(P.tag + (s < 0 ? 'L' : 'R')); cagePanel(hull, P, M, s); }
        } else { hull.setTag(P.tag); cagePanel(hull, P, M, 1); }
      }
    }
    if (has(u, 'fireext') && EXT_SPOT[u.tankType]) {
      // Bình chữa cháy xách tay gắn ngoài (hệ thống dập lửa tự động nằm trong khoang)
      hull.setTag('fireextKit');
      for (const [x, y, z, ax, n] of EXT_SPOT[u.tankType]) extinguisher(hull, M, x, y, z, ax, n);
    }
    if (has(u, 'aps')) {
      // 2 khối radar mảng pha ở góc nóc tháp + ống đánh chặn
      const host = T && u.turretGroup ? tur : hull;
      host.setTag('apsKit');
      const ty = T ? T.h : F.y1 + 2, tz = T ? T.zF + (T.zR - T.zF) * 0.55 : 0, tx = T ? T.hw - 2.2 : F.hw - 3;
      for (const s of [-1, 1]) {
        host.box(2.6, 2.2, 1.0, M.sensor, [s * tx, ty + 1.2, tz - 1.2], [0, s * 0.5, 0]);
        host.box(2.6, 2.2, 1.0, M.sensor, [s * tx, ty + 1.2, tz + 1.4], [0, Math.PI - s * 0.5, 0]);
        host.box(1.6, 1.2, 3.4, M.steel, [s * (tx - 3), ty + 0.7, tz + 0.2]);
      }
    }
    if (has(u, 'smoke') && !(u.partRegistry && (u.partRegistry.smokeL || u.partRegistry.smokeR))) {
      const host = T && u.turretGroup ? tur : hull;
      for (const s of [-1, 1]) {
        host.setTag(s < 0 ? 'smokeKitL' : 'smokeKitR');
        const bx = T ? s * (T.hw - 1) : s * (F.hw - 2), by = T ? T.h * 0.7 : F.y1 + 1, bz = T ? T.zF + 4 : F.zF + 6;
        for (let i = 0; i < 4; i++) host.cyl(0.55, 0.55, 2.4, 8, M.steel, [bx + s * (i % 2) * 1.2, by + Math.floor(i / 2) * 1.1, bz], 'z', [0.35, s * 0.4, 0]);
      }
    }
    if (has(u, 'camo')) buildFoliage(u, F, T, len);   // lưới lá: dựng & gắn riêng (xem buildFoliage)
    const spot = ROOF_SPOT[u.tankType] || {}, roofY = REAL_ROOF[u.tankType] || F.netY;
    if (has(u, 'radar') && spot.radar && T && u.turretGroup) {
      // Radar dò tìm: cột thép + ăng-ten mảng phẳng quay tròn (quay trong Equipment.update)
      const [rx, rz] = spot.radar;
      tur.setTag('radarKit');
      tur.box(1.4, 0.6, 1.4, M.steel, [rx, roofY + 0.3, rz]);
      tur.cyl(0.32, 0.42, 3.0, 8, M.steel, [rx, roofY + 1.8, rz]);
      const head = new THREE.Group();
      head.position.set(rx, roofY + 3.5, rz);
      const hb = batch(u);
      hb.setTag('radarKit');
      hb.box(3.4, 1.3, 0.3, M.sensor, [0, 0.45, 0]);
      hb.box(3.6, 0.16, 0.55, M.steel, [0, -0.3, 0]);
      hb.cyl(0.32, 0.32, 0.5, 8, M.steel, [0, -0.5, 0]);
      buildBatch(u, hb, head);
      u.turretGroup.add(head);
      u._eqRadarHead = head;
    }
    if (has(u, 'jammer') && spot.jam) {
      // Máy gây nhiễu: hộp điện tử + 3 ăng-ten phát nhiễu ngắn chĩa xiên
      const host = T && u.turretGroup ? tur : hull, [jx, jz] = spot.jam;
      host.setTag('jammerKit');
      host.box(2.2, 1.1, 1.6, M.sensor, [jx, roofY + 0.55, jz]);
      host.box(2.4, 0.12, 1.8, M.steel, [jx, roofY + 1.12, jz]);
      for (const k of [-0.7, 0, 0.7]) host.strut([jx + k, roofY + 1.1, jz], [jx + k * 1.7, roofY + 3.3, jz + 0.3], 0.08, M.steel, 5, 0.04);
    }
    buildBatch(u, hull, u.chassisGroup);
    if (u.turretGroup) buildBatch(u, tur, u.turretGroup);
  }

  // ---------------------------------------------------------------------------
  // MÀN KHÓI
  // ---------------------------------------------------------------------------
  const smokes = [];
  const SMOKE_LIFE = 14, SMOKE_R = 42;
  let emitAcc = 0;

  /**
   * Phóng màn khói từ xe u: 3 đám khói xếp ngang trước mũi xe (hoặc tại điểm cho trước khi nhận từ mạng).
   * Trả về { x, z, a } để gửi mạng.
   */
  function deploySmoke(game, u, at) {
    if (!u || u.isDead) return null;
    if (!at) {
      if (!(u.smokeLeft > 0)) return null;
      u.smokeLeft--;
    }
    const a = at ? at.a : (u.bodyAngle || 0);
    const fx = -Math.sin(a), fz = -Math.cos(a);   // mũi xe
    const cx = at ? at.x : u.x + fx * 55, cz = at ? at.z : u.z + fz * 55;
    for (let i = -1; i <= 1; i++) {
      smokes.push({ x: cx + fz * i * 46, z: cz - fx * i * 46, t: -0.25 * Math.abs(i), team: u.team, src: u });
    }
    const S = window.soundEngine;
    if (S && typeof S.playSmokeLaunch === 'function') {
      // nghe theo khoảng cách từ xe phóng tới người chơi (xe mình: 0)
      const me = game && game.player;
      const d = !me || me === u ? 0 : Math.max(1, Math.hypot(u.x - me.x, u.z - me.z));
      if (d < 2400) S.playSmokeLaunch(d, { x: u.x, z: u.z });
    }
    return { x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10, a: Math.round(a * 1000) / 1000 };
  }
  function smokeRadius(s) {
    if (s.t < 0) return 0;
    const grow = Math.min(1, s.t / 2.2), fade = s.t > SMOKE_LIFE - 3 ? Math.max(0, (SMOKE_LIFE - s.t) / 3) : 1;
    return SMOKE_R * (0.3 + 0.7 * grow) * (0.55 + 0.45 * fade);
  }
  // Đường ngắm (x1,z1)-(x2,z2) xuyên qua đám khói dày
  function smokeBlocks(x1, z1, x2, z2) {
    if (!smokes.length) return false;
    const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
    for (const s of smokes) {
      if (s.t < 0.8 || s.t > SMOKE_LIFE - 1) continue;
      const r = smokeRadius(s);
      let k = ((s.x - x1) * dx + (s.z - z1) * dz) / L2;
      k = Math.max(0, Math.min(1, k));
      const px = x1 + dx * k - s.x, pz = z1 + dz * k - s.z;
      if (px * px + pz * pz < r * r * 0.8) return true;
    }
    return false;
  }
  function clearSmoke() { smokes.length = 0; }

  function update(dt, game) {
    // ăng-ten radar dò tìm quay tròn (~2.4 s một vòng)
    if (game && game.units) for (const u of game.units) if (u._eqRadarHead && !u.isDead) u._eqRadarHead.rotation.y += dt * 2.6;
    // lưới lá: ẩn cành / lá trên nòng khi xe ở xa; xe đang bị ẩn (sương mù chiến tranh) vẫn cho lá rơi xong
    if (game && game.units) for (const u of game.units) {
      if (!u._camoLeaf) continue;
      const far = (u._lodD || 0) > 1400;
      if (u._camoFar !== far) { u._camoFar = far; for (const m of u._camoDetail || []) m.visible = !far && !m.userData.cfGone; }   // cfGone: cành đã cháy rụng (CamoFire)
      if (u._leafFx && u._leafFx.length && performance.now() - (u._camoT || 0) > 150) stepFoliage(u, dt);
    }
    // lưới lá bắt lửa / cháy lan (src/gameplay/camo_fire.js)
    if (game && game.units && window.CamoFire) CamoFire.update(dt, { units: game.units, fx: game.effectsManager && game.effectsManager.fx, game });
    if (!smokes.length && !game) return;
    // khói: hạt bay chậm, dày, lan rộng
    const fx = game && game.effectsManager && game.effectsManager.fx;
    const layer = fx && fx.smoke;
    const T = game && game.terrain;
    emitAcc += dt;
    const emit = emitAcc >= 0.12;
    if (emit) emitAcc = 0;
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.t += dt;
      if (s.t > SMOKE_LIFE) { smokes.splice(i, 1); continue; }
      if (!emit || !layer || s.t < 0 || s.t > SMOKE_LIFE - 3.5) continue;
      const r = smokeRadius(s), y = T ? T.getElevationAt(s.x, s.z) : 0;
      const n = s.t < 1.5 ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r * 0.7, g = 0.78 + Math.random() * 0.1;
        layer.add({ x: s.x + Math.cos(a) * rr, y: y + 4 + Math.random() * 8, z: s.z + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6,
          size: 16 + Math.random() * 10, grow: 4.5, drag: 0.7, grav: -0.4, life: 5 + Math.random() * 3, alpha: 0.85, fadeIn: 0.25, c0: [g, g, g * 0.98], c1: [g + 0.08, g + 0.08, g + 0.06], cell: 0, floor: false });
      }
    }
    // xe do máy điều khiển (máy này có quyền): vừa trúng đạn, máu thấp -> phóng khói che rút lui
    if (game && game.units) {
      const now = performance.now();
      for (const u of game.units) {
        if (!u || u.isDead || u.isPlayer || u.isRemotePlayer || !(u.smokeLeft > 0)) continue;
        if (!u._lastHitAt || now - u._lastHitAt > 1200 || u.hp > u.maxHp * 0.6) continue;
        if (u._smokeAt && now - u._smokeAt < 6000) continue;
        u._smokeAt = now;
        triggerSmoke(game, u);
      }
    }
  }
  // Phóng khói (xe của máy này) + báo các máy khác
  function triggerSmoke(game, u) {
    const r = deploySmoke(game, u, null);
    if (r && game && game.netSync && game.netSync.sendSmoke) game.netSync.sendSmoke(u, r);
    return r;
  }

  return Object.assign(API, {
    has, equip, onRespawn, paidUsed, ammoDelta, startLife,
    armorMul, eraBonus, penMul, isTandem, splashMul, spallMul, slatDefeats, apsLeft, apsTry, camoHidden, camoFactor, camoRadarFactor, fireMul, burnDamageMul,
    deploySmoke, triggerSmoke, smokeBlocks, clearSmoke, update, buildVisuals, FIT,
    kitMats, foliageMats, foliageClump,   // dùng lại ở trang render ảnh trang bị (equipment_thumbs.html)
    APS_CHARGES, SMOKE_CHARGES
  });
});
