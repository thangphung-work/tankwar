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
  const SLOTS = 3;
  const START_SILVER = 3000;

  // ---------------------------------------------------------------------------
  // DANH MỤC
  // ---------------------------------------------------------------------------
  // speed / accel: hệ số nhân tốc độ tối đa / gia tốc (giáp nặng làm xe chậm đi)
  const MODULES = {
    era: {
      name: 'Giáp phản ứng nổ', icon: 'bolt', price: 3200, tanks: ['ALL_ROUNDER', 'GATLING', 'SCOUT'], speed: 0.97,
      desc: 'Gạch nổ phủ mũi, sườn và tháp. Mỗi viên gạch kích nổ chặn gần hết một phát đạn nổ lõm / RPG, giảm sức xuyên đạn xuyên giáp. Gạch đã nổ thì mất.'
    },
    slat: {
      name: 'Giáp lồng chống RPG', icon: 'grid-dots', price: 1800, tanks: ALL, speed: 0.98,
      desc: 'Lồng thép quanh sườn sau và đuôi xe. Bóp méo đầu đạn RPG trước khi nổ (chặn ~6/10 phát RPG, ~1/4 tên lửa).'
    },
    applique: {
      name: 'Tấm giáp tăng cường', icon: 'shield', price: 3800, tanks: ALL, speed: 0.94, accel: 0.94,
      desc: 'Giáp composite gắn thêm ở sườn và má tháp: giáp sườn dày thêm ~45%, mũi ~20%. Xe nặng hơn, chậm hơn một chút.'
    },
    spall: {
      name: 'Lớp lót chống mảnh', icon: 'layers-subtract', price: 2800, tanks: ALL,
      desc: 'Lớp sợi aramid trong khoang: khi bị bắn thủng, mảnh vỡ gây ít sát thương hơn (-15%), kho đạn khó bị kích nổ hơn.'
    },
    aps: {
      name: 'Hệ thống đánh chặn chủ động', icon: 'radar', price: 7000, tanks: ['ALL_ROUNDER', 'GATLING'],
      desc: 'Radar + đạn đánh chặn trên nóc tháp tự bắn hạ RPG và tên lửa chống tăng bay tới (2 lần mỗi lần xuất kích). Radar bị bắn hỏng thì ngừng hoạt động.'
    },
    smoke: {
      name: 'Ống phóng lựu khói', icon: 'cloud', price: 1500, tanks: ALL,
      desc: 'Phím G: phóng màn khói dày trước mũi xe, che khuất tầm nhìn của địch ~14 giây (2 lần mỗi lần xuất kích).'
    },
    camo: {
      name: 'Lưới ngụy trang', icon: 'leaf', price: 1600, tanks: ALL,
      desc: 'Khi đứng yên hoặc chạy chậm, địch phải tới gần hơn ~25% mới phát hiện được xe bạn.'
    },
    fireext: {
      name: 'Bình chữa cháy tự động', icon: 'fire-extinguisher', price: 1200, tanks: ALL,
      desc: 'Dập lửa trên xe nhanh gấp 2,5 lần, cháy do đạn cháy gây sát thương giảm một nửa.'
    },
    turbo: {
      name: 'Động cơ tăng áp', icon: 'engine', price: 3000, tanks: ALL, speed: 1.08, accel: 1.15,
      desc: 'Tăng áp & chỉnh hộp số: tốc độ tối đa +8%, tăng tốc nhanh hơn 15%.'
    }
  };

  // Đạn cao cấp: mua 1 lần cho 1 xe, luôn dùng. pen: hệ số độ xuyên; splash: hệ số sát thương nổ lan; tandem: đầu nổ kép
  const PREMIUM = {
    ap_du: { tank: 'ALL_ROUNDER', ammo: 'AP', name: 'Đạn xuyên lõi hợp kim nặng', icon: 'arrow-big-right-lines', price: 4500, pen: 1.22, desc: 'Đạn xuyên giáp xuyên sâu hơn 22%, ít mất sức xuyên khi bắn xa.' },
    heat_tandem: { tank: 'ALL_ROUNDER', ammo: 'NORMAL', name: 'Đạn nổ lõm 2 tầng', icon: 'flame', price: 3500, pen: 1.1, tandem: true, desc: 'Đạn thường có đầu nổ mồi phá gạch giáp nổ trước, xuyên thêm 10%.' },
    apds30: { tank: 'GATLING', ammo: 'GATLING_BULLET', name: 'Đạn 30mm xuyên dưới cỡ', icon: 'arrow-big-right-lines', price: 3800, pen: 1.36, desc: 'Đạn 30mm lõi tungsten: xuyên sâu hơn 36%, đục thủng sườn xe tăng nhanh hơn.' },
    slap127: { tank: 'SCOUT', ammo: 'SCOUT_BULLET', name: 'Đạn 12.7mm SLAP', icon: 'arrow-big-right-lines', price: 2600, pen: 1.6, desc: 'Đạn 12.7mm xuyên dưới cỡ có đai nhựa: xuyên sâu gấp 1,6 lần.' },
    he_frag: { tank: 'ARTILLERY', ammo: 'HE', name: 'Lựu đạn mảnh định sẵn', icon: 'atom-2', price: 3500, splash: 1.15, desc: 'Vỏ đạn 155mm khía rãnh tạo mảnh đều: sát thương nổ lan +15%.' }
  };

  // Đạn mang thêm (tiêu hao): giá 1 viên, bán theo gói `pack` viên, tối đa `max` viên mang thêm mỗi lần xuất kích
  const AMMO_SHOP = {
    ALL_ROUNDER: { AP: { name: 'Đạn xuyên giáp', price: 45, pack: 5, max: 6 }, HE: { name: 'Đạn nổ mạnh', price: 30, pack: 5, max: 6 } },
    ARTILLERY: { HE: { name: 'Lựu đạn nổ mạnh 155', price: 40, pack: 5, max: 6 }, CLUSTER: { name: 'Đạn chùm 155', price: 70, pack: 2, max: 4 } },
    GATLING: { INCENDIARY: { name: 'Đạn cháy 30mm', price: 1, pack: 50, max: 150 } },
    SCOUT: { RPG: { name: 'Đạn RPG', price: 60, pack: 2, max: 4 }, INCENDIARY: { name: 'Đạn cháy 12.7mm', price: 1, pack: 50, max: 90 } }
  };
  // Số đạn đặc chủng miễn phí mỗi lần xuất kích (như trước khi có cửa hàng)
  const BASE_AMMO = { ALL_ROUNDER: { AP: 3, HE: 3 }, ARTILLERY: { HE: 4, CLUSTER: 3 }, GATLING: { INCENDIARY: 80 }, SCOUT: { INCENDIARY: 45, RPG: 4 } };
  const AMMO_PROP = { AP: 'apAmmoCount', HE: 'heAmmoCount', CLUSTER: 'clusterAmmoCount', INCENDIARY: 'incendiaryAmmoCount', RPG: 'rpgAmmoCount' };

  function compatible(id, tank) {
    const m = MODULES[id];
    if (m) return m.tanks.includes(tank);
    const p = PREMIUM[id];
    return !!(p && p.tank === tank);
  }
  function priceOf(id) {
    return (MODULES[id] && MODULES[id].price) || (PREMIUM[id] && PREMIUM[id].price) || 0;
  }

  /** Bộ trang bị hợp lệ cho xe `tank` (lọc mã lạ / không lắp được, giới hạn số ô & số đạn) */
  function sanitize(kit, tank) {
    const out = { m: [], p: [], a: {} };
    if (!kit || typeof kit !== 'object' || !TANKS.includes(tank)) return out;
    for (const id of Array.isArray(kit.m) ? kit.m : []) {
      if (out.m.length >= SLOTS) break;
      if (MODULES[id] && compatible(id, tank) && !out.m.includes(id)) out.m.push(id);
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
    return { m, p: [], a: {} };
  }

  // Bạc nhận được sau trận (máy chủ tính)
  function silverFor(result, kills, damage, durSec) {
    return Math.round(250 + (result === 'win' ? 300 : result === 'draw' ? 150 : 0) + kills * 90 + damage * 30 + Math.min(durSec, 900) / 3);
  }

  const API = { TANKS, SLOTS, START_SILVER, MODULES, PREMIUM, AMMO_SHOP, BASE_AMMO, AMMO_PROP, compatible, priceOf, sanitize, botKit, silverFor };
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
    u._eq = { local: !!(opts && opts.local), stock: Object.assign({}, (opts && opts.stock) || {}), used: {}, loaded: {} };
    // Đạn cao cấp
    u.ammoMods = {};
    for (const id of u.kit.p) { const P = PREMIUM[id]; u.ammoMods[P.ammo] = P; }
    // Chỉ số (tốc độ / gia tốc) — áp trước khi hệ thống hư hại chụp chỉ số gốc
    let sp = 1, ac = 1;
    for (const id of u.kit.m) { sp *= MODULES[id].speed || 1; ac *= MODULES[id].accel || 1; }
    if (u.baseMaxSpeed) u.baseMaxSpeed *= sp;
    if (u.acceleration) u.acceleration *= ac;
    if (u.dmg && u.dmg.base) { if (u.dmg.base.baseMaxSpeed) u.dmg.base.baseMaxSpeed *= sp; if (u.dmg.base.acceleration) u.dmg.base.acceleration *= ac; }
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
  }
  /** Tổng đạn mua thêm đã tiêu trong trận (gửi máy chủ để trừ kho) */
  function paidUsed(u) {
    const E = u && u._eq, out = {};
    if (!E) return out;
    for (const k in E.loaded) { const n = (E.used[k] || 0) + lifeUsed(u, k); if (n > 0) out[k] = n; }
    for (const k in E.used) if (!(k in out) && E.used[k] > 0) out[k] = E.used[k];
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
  // Lưới ngụy trang: hệ số tầm phát hiện xe này (đứng yên / chạy chậm, chưa vừa nổ súng)
  function camoFactor(t) {
    if (!has(t, 'camo') || lost(t, 'camoKit')) return 1;
    if ((t.revealTimer || 0) > 0) return 1;
    const v = Math.abs(t.speed || 0), vmax = t.baseMaxSpeed || 120;
    return v < vmax * 0.2 ? 0.75 : 0.9;
  }
  function fireMul(u) { return has(u, 'fireext') ? 2.5 : 1; }
  function burnDamageMul(u) { return has(u, 'fireext') ? 0.5 : 1; }

  // ---------------------------------------------------------------------------
  // HÌNH BỘ PHẬN GẮN THÊM
  // ---------------------------------------------------------------------------
  // Kích thước khung từng xe (đo từ mô hình: hệ tọa độ thân xe, mũi xe hướng -z; tháp theo hệ tọa độ tháp)
  const FIT = {
    // netY: độ cao nóc thân để phủ lưới ngụy trang; tur.roof: nóc tháp
    ALL_ROUNDER: { hw: 16.5, y0: 6.4, y1: 11.6, zF: -31, zR: 30.8, eraZ1: 4, netY: 12.9, tur: { hw: 12.8, h: 9.7, roof: 9.4, zF: -19.2, zR: 20.7 } },
    GATLING: { hw: 17.2, y0: 7.6, y1: 13.4, zF: -37, zR: 33.2, eraZ1: 2, netY: 14.3, tur: { hw: 13.6, h: 8.8, roof: 8.6, zF: -16.7, zR: 14.8 } },
    ARTILLERY: { hw: 13.4, y0: 9.5, y1: 15.5, zF: -40.1, zR: 41.2, eraZ1: 0, netY: 12.6, tur: { hw: 11.4, h: 16.6, roof: 10.8, zF: -11, zR: 14.9 } },
    SCOUT: { hw: 8.7, y0: 7.2, y1: 13, zF: -20, zR: 19.5, eraZ1: 6, netY: 15.5, tur: null }
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
    return (matCache[key] = { era, plate: era, steel, net, net2, sensor });
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

  function buildVisuals(u) {
    if (u._eqBuilt || !u.kit || !u.kit.m.length || !u.chassisGroup || !window.VehicleKit) return;
    u._eqBuilt = true;
    const F = FIT[u.tankType];
    if (!F) return;
    const M = kitMats(u.team);
    const hull = batch(u), tur = batch(u);
    const T = F.tur;
    const len = F.zR - F.zF;

    if (has(u, 'applique')) {
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
    if (has(u, 'era')) {
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
    if (has(u, 'slat')) {
      // Lồng thanh thép cách vỏ ~2 đơn vị: nửa sau 2 sườn + đuôi xe
      const sz0 = F.zF + len * 0.52, sz1 = F.zR + 1.5, yT = F.y1 + 1.8, yB = F.y0 - 0.6, so = F.hw + 2.4 + (has(u, 'applique') ? 0.8 : 0);
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'cageKitL' : 'cageKitR');
        for (let z = sz0; z <= sz1; z += 1.5) hull.box(0.28, yT - yB, 0.28, M.steel, [s * so, (yT + yB) / 2, z]);
        for (const y of [yB + 0.3, (yB + yT) / 2, yT - 0.2]) hull.box(0.35, 0.35, sz1 - sz0, M.steel, [s * so, y, (sz0 + sz1) / 2]);
        for (const z of [sz0, (sz0 + sz1) / 2]) hull.box(so - F.hw, 0.35, 0.35, M.steel, [s * (F.hw + (so - F.hw) / 2), yT - 0.2, z]);
      }
      hull.setTag('cageKitB');
      const bz = F.zR + 2.6;
      for (let x = -so; x <= so + 0.01; x += 1.5) hull.box(0.28, yT - yB, 0.28, M.steel, [x, (yT + yB) / 2, bz]);
      for (const y of [yB + 0.3, (yB + yT) / 2, yT - 0.2]) hull.box(so * 2, 0.35, 0.35, M.steel, [0, y, bz]);
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
    if (has(u, 'camo')) {
      // Lưới ngụy trang cuộn / phủ trên nóc thân & tháp: các mảnh vải xếp lệch, đổi màu
      hull.setTag('camoKit');
      const rnd = (window.VehicleKit && VehicleKit.mulberry32) ? VehicleKit.mulberry32(1234 + u.tankType.length) : Math.random;
      for (let i = 0; i < 10; i++) {
        const x = (rnd() - 0.5) * F.hw * 1.5, z = F.zF + len * (0.55 + rnd() * 0.4), w = 5 + rnd() * 5;
        hull.box(w, 0.35, 3 + rnd() * 4, i % 2 ? M.net : M.net2, [x, F.netY + 0.3 + rnd() * 0.5, z], [rnd() * 0.25 - 0.12, rnd() * 3, rnd() * 0.25 - 0.12]);
      }
      if (T && u.turretGroup) {
        tur.setTag('camoKit');
        for (let i = 0; i < 6; i++) {
          const x = (rnd() - 0.5) * T.hw * 1.4, z = T.zF + (T.zR - T.zF) * (0.4 + rnd() * 0.55);
          tur.box(4 + rnd() * 4, 0.35, 3 + rnd() * 3, i % 2 ? M.net : M.net2, [x, T.roof + 0.35 + rnd() * 0.4, z], [rnd() * 0.2 - 0.1, rnd() * 3, rnd() * 0.2 - 0.1]);
        }
      }
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
    if (S && typeof S.playMetalClank === 'function') { S.playMetalClank(0, 0.35, 260); S.playMetalClank(0.08, 0.3, 300); }
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
    has, equip, onRespawn, paidUsed, startLife,
    armorMul, eraBonus, penMul, isTandem, splashMul, spallMul, slatDefeats, apsLeft, apsTry, camoFactor, fireMul, burnDamageMul,
    deploySmoke, triggerSmoke, smokeBlocks, clearSmoke, update, buildVisuals, FIT,
    APS_CHARGES, SMOKE_CHARGES
  });
});
