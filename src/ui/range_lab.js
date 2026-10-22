/**
 * PHÒNG THỬ ĐẠN TRÊN GAME THẬT (index.html?lab=range — mở từ nút "PHÒNG THỬ ĐẠN" ở màn xem xe 3D)
 *
 * - Chạy đúng engine trận đấu: camera bám đuôi, kính ngắm Ctrl (vạch ly giác, phóng đại, rung / độ tản, khóa chuột,
 *   Tab khóa mục tiêu), HUD, drone trinh sát của pháo, đường đạn / sát thương / phá hủy như trong trận
 * - Bản đồ thật (mặc định đồng cỏ cao nguyên): chọn sẵn một làng có nhà, xe xuất phát trên bãi trống nhìn về làng;
 *   4 xe mục tiêu đứng giữa đồng, cạnh nhà, sau nhà, trong làng ở nhiều cự ly
 * - Bảng điều khiển: đổi xe, đổi bản đồ, về chỗ xuất phát, hồi sinh mục tiêu, mục tiêu bắn trả, bất tử,
 *   DỰNG LẠI BẢN ĐỒ (nhà / cây / hàng rào / hố đạn về nguyên trạng)
 * - Xe mang đúng bộ trang bị đang lắp của tài khoản; đạn mua thêm bắn trong phòng thử không bị trừ kho
 * - TRANG BỊ THỬ: lắp / tháo bất kỳ món nào hợp với xe (miễn phí, không lưu vào bộ đồ thật) — giáp, phụ kiện, nóc tháp,
 *   mũi xe, vũ khí chính, UAV, động cơ, đạn cao cấp; "Sửa xe" đưa xe về nguyên vẹn
 * - BẮN TRẢ: bia gần nhất bắn xe mình bằng vũ khí chọn (pháo tăng AP / nổ lõm, RPG, tên lửa, tên lửa tấn công đỉnh,
 *   súng 12.7, lựu 40mm, UAV cảm tử) để thấy ERA, APS, lồng thép, khiên chữ V, máy phá khóa hoạt động
 * - BIA MANG GIÁP: bia lắp ERA + lồng thép / tấm ghép + APS để thử đạn của mình
 * - Bất tử: hư hại bộ phận / giáp vẫn chạy đủ, máu chỉ không xuống dưới 10%; bảng PHÁT TRÚNG đọc mặt giáp, độ dày,
 *   độ xuyên, hệ số, sát thương của từng phát
 *
 * Tham số URL: map=HIGHLAND|RIVER_LAKE|JUNGLE|DESERT|URBAN, seed=<số>, tank=ALL_ROUNDER|GATLING|ARTILLERY|SCOUT
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('lab') !== 'range') return;
  window.RANGE_LAB = true;
  // Chơi độc lập: không vào sảnh mạng
  try { window.NetTransport = undefined; } catch (e) { /* bỏ qua */ }

  const MAPS = [['HIGHLAND', 'Đồng cỏ'], ['RIVER_LAKE', 'Sông hồ'], ['JUNGLE', 'Rừng'], ['DESERT', 'Sa mạc'], ['URBAN', 'Đô thị']];
  const TYPES = [['ALL_ROUNDER', 'HALBERD MK.3'], ['GATLING', 'HAILSTORM R6'], ['ARTILLERY', 'ARBALEST 155'], ['SCOUT', 'MARTEN R4']];
  let BIOME = (q.get('map') || 'HIGHLAND').toUpperCase();
  if (!MAPS.some(m => m[0] === BIOME)) BIOME = 'HIGHLAND';
  const SEED = (parseInt(q.get('seed'), 10) || 20261022) >>> 0;
  let tankType = (q.get('tank') || 'ALL_ROUNDER').toUpperCase();
  if (!TYPES.some(t => t[0] === tankType)) tankType = 'ALL_ROUNDER';

  // Màn chờ: nạp script + dựng bản đồ mất vài giây, trước đây chỉ thấy trang trống / sảnh lóe lên
  const loader = (() => {
    // index.html đã phủ sẵn màn chờ ngay đầu trang: dùng lại
    const pre = document.getElementById('range-lab-loading');
    if (pre) {
      return {
        stage(t) { const s = document.getElementById('range-lab-stage'); if (s) s.textContent = t; },
        done() { requestAnimationFrame(() => requestAnimationFrame(() => { pre.style.opacity = '0'; setTimeout(() => pre.remove(), 400); })); }
      };
    }
    const el = document.createElement('div');
    el.id = 'range-lab-loading';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0b0f0c;color:#d6e2c8;font:600 14px/1.4 system-ui,sans-serif;letter-spacing:.12em;transition:opacity .35s';
    el.innerHTML = '<style>@keyframes rlspin{to{transform:rotate(360deg)}}</style>'
      + '<div style="width:46px;height:46px;border-radius:50%;border:3px solid rgba(214,226,200,.18);border-top-color:#ffb700;animation:rlspin .8s linear infinite"></div>'
      + '<div style="font-size:18px;color:#ffb700">PHÒNG THỬ ĐẠN</div><div id="range-lab-stage">ĐANG KHỞI ĐỘNG…</div>';
    (document.body || document.documentElement).appendChild(el);
    return {
      stage(t) { const s = document.getElementById('range-lab-stage'); if (s) s.textContent = t; },
      done() {
        // chờ 2 khung hình để cảnh đầu tiên đã vẽ xong rồi mới mờ màn chờ
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }));
      }
    };
  })();

  const lab = { g: null, dummies: [], home: null, village: null, god: true, fireBack: false, fireMode: 'off', dummyArmor: 0, keepWreck: false, log: [], hits: [], kit: null, kamis: [] };
  // Vũ khí bia bắn trả: [mã, tên]
  const FIRE_MODES = [['off', 'Tắt'], ['ap', 'Pháo AP'], ['heat', 'Pháo nổ lõm'], ['rpg', 'RPG'], ['atgm', 'Tên lửa'], ['top', 'Tên lửa đỉnh'],
    ['mg', 'Súng 12.7'], ['agl', 'Lựu 40mm'], ['kami', 'UAV cảm tử']];
  const ARMOR_SETS = [['Không giáp', []], ['ERA + lồng thép', ['era', 'slat']], ['Tấm ghép + APS', ['applique', 'spall', 'aps']]];
  const deg = r => r * 180 / Math.PI;

  // ---------------------------------------------------------------------------
  // KHỞI ĐỘNG: chờ game dựng xong -> dựng bản đồ -> vào trận thử
  // ---------------------------------------------------------------------------
  function boot() {
    const g = window.game;
    if (!g || !g.terrain || !g.matchmaking) { setTimeout(boot, 60); return; }
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME; mm.mapSeed = SEED; mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    clearInterval(mm.searchInterval);
    loader.stage('ĐANG DỰNG BẢN ĐỒ…');
    // nhường một nhịp cho trình duyệt vẽ chữ trước khi dựng bản đồ (chạy liền một mạch, chặn khung hình)
    setTimeout(() => start(g, mm), 30);
  }

  function start(g, mm) {
    g.prepareMap(BIOME, SEED);
    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');
    mm.selectedTankType = tankType;
    if (mm.music) mm.music('battle');
    g.startMatchWithSlots([{ id: 0, team: 'BLUE', title: 'THỬ ĐẠN', name: 'XE THỬ ĐẠN', isHuman: true, isMe: true, peerId: 'lab-me', tankType, ready: true }], 'lab-me');
    setup(g);
  }

  function setup(g) {
    lab.g = g;
    // Luật trận thường không áp dụng trong phòng thử
    g.matchDuration = 1e9;
    if (g.zone) g.zone.update = function () {};
    g.airdropTimer = 1e9;
    if (g.supplyManager) g.supplyManager.airdropTimer = 1e9;
    g.respawnWaitPenalty = 3;
    const cpm = g.capturePointsManager;
    if (cpm) {
      (cpm.points || []).forEach(cp => cp.group && cp.group.parent && cp.group.parent.remove(cp.group));
      cpm.points = [];
      if (cpm.updateCapturePointsUI) try { cpm.updateCapturePointsUI(); } catch (e) { /* bỏ qua */ }
    }
    // Hồi sinh tại chỗ xuất phát / chỗ đứng của mục tiêu (không về căn cứ)
    g.updateRespawnQueue = function (dt) {
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const it = this.respawnQueue[i];
        if (lab.keepWreck && !it.unit.isPlayer) continue;
        it.timer -= dt;
        if (it.timer > 0) continue;
        const h = it.unit._labHome || { x: it.unit.x, z: it.unit.z, a: it.unit.bodyAngle, az: it.unit.azimuth };
        it.unit.respawn(h.x, h.z);
        place(it.unit, h.x, h.z, h.a, h.az);
        if (it.unit.isPlayer) { const b = document.getElementById('player-respawn-banner'); if (b) b.classList.add('hidden'); }
        this.respawnQueue.splice(i, 1);
        this.updateAliveCount();
      }
    };
    preparePlayer(g.player);
    // phòng thử: xe nguyên vẹn (không mang giáp hỏng chưa sửa của tài khoản)
    if (g.player.kit && g.player.kit.d) { delete g.player.kit.d; if (typeof VehicleDamage !== 'undefined') VehicleDamage.reset(g.player); }
    placeAll();
    const origUpdate = g.update;
    g.update = function (dt) { origUpdate.call(this, dt); tick(dt); };
    buildUI();
    hookHits(g);
    spawnUAVs(g);
    addLog('Ctrl: kính ngắm như trong trận · Tab: khóa mục tiêu · Space / chuột trái: bắn · M: bản đồ', 'info');
    window.rangeLab = lab;
    loader.done();
  }

  // ---------------------------------------------------------------------------
  // CHỌN CHỖ: làng có nhiều nhà nhất, chỗ xuất phát trên bãi trống nhìn về làng, mục tiêu ở nhiều cự ly
  // ---------------------------------------------------------------------------
  // relax: nới điều kiện (bỏ qua cây, cho dốc hơn) khi không tìm được chỗ đẹp
  function openSpot(x, z, clear, relax) {
    const T = lab.g.terrain, half = T.width / 2 - 260;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const info = T.getTerrainInfoAt ? T.getTerrainInfoAt(x, z) : null;
    if (info && (info.type === 'WATER' || info.type === 'BRIDGE')) return false;
    if (T.nearStronghold && T.nearStronghold(x, z, 60)) return false;
    for (const b of T.buildings || []) if (Math.hypot(b.x - x, b.z - z) < (b.radius || 30) + clear) return false;
    const trees = !relax && T.trees && T.trees.items;
    if (trees) for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 16) return false;
    // không đứng trên dốc gắt
    const e = 12, gx = T.getElevationAt(x + e, z) - T.getElevationAt(x - e, z), gz = T.getElevationAt(x, z + e) - T.getElevationAt(x, z - e);
    return Math.hypot(gx, gz) / (2 * e) < (relax ? 0.4 : 0.22);
  }

  function findVillage() {
    const B = lab.g.terrain.buildings || [];
    let best = null, bestN = -1;
    for (const b of B) {
      const n = B.filter(o => Math.hypot(o.x - b.x, o.z - b.z) < 320).length;
      if (n > bestN) { bestN = n; best = b; }
    }
    if (!best) return { x: 0, z: 0, n: 0 };
    const near = B.filter(o => Math.hypot(o.x - best.x, o.z - best.z) < 320);
    return { x: near.reduce((s, o) => s + o.x, 0) / near.length, z: near.reduce((s, o) => s + o.z, 0) / near.length, n: near.length };
  }

  function placeAll() {
    const g = lab.g, V = lab.village = findVillage();
    // chỗ xuất phát: vòng quanh làng ở 520-760, ưu tiên hướng về giữa bản đồ
    const toC = Math.atan2(-V.z, -V.x);
    let spawn = null;
    for (let k = 0; k < 48 && !spawn; k++) {
      const a = toC + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, r = 560 + (k % 3) * 90;
      const x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r;
      if (openSpot(x, z, 70)) spawn = { x, z };
    }
    if (!spawn) spawn = { x: V.x + 600, z: V.z };
    // mũi xe & tháp nhìn về làng (quy ước game: bodyAngle = atan2(-dx, -dz), azimuth = atan2(dx, -dz) độ)
    const dx = V.x - spawn.x, dz = V.z - spawn.z;
    lab.home = { x: spawn.x, z: spawn.z, a: Math.atan2(-dx, -dz), az: (deg(Math.atan2(dx, -dz)) + 360) % 360 };
    teleport();
    // mục tiêu: giữa đồng (~220), cạnh nhà, sau nhà, trong làng — lệch góc để không xếp hàng dọc
    for (const d of lab.dummies) { d.isDead = true; if (d.group && d.group.parent) d.group.parent.remove(d.group); }
    g.units = g.units.filter(u => !lab.dummies.includes(u));
    lab.dummies = [];
    const D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
    // ?ew=1: thử máy phá sóng — chỉ 1 xe tăng địch (tự bật phá sóng khi drone mình bay tới gần, ew_jammer.js)
    const plan = q.get('ew') === '1' ? [[1300, 0, 'ALL_ROUNDER']]
      : [[220, -0.18, 'ALL_ROUNDER'], [D - 90, 0.12, 'GATLING'], [D + 40, -0.06, 'ALL_ROUNDER'], [D + 170, 0.2, 'ARTILLERY']];
    plan.forEach(([r0, off, type], i) => {
      let p = null;
      for (let k = 0; k < 160 && !p; k++) {
        const r = r0 + (k % 5) * 22 - 44, o = off + (Math.floor(k / 5) % 2 ? 1 : -1) * Math.floor(k / 10) * 0.05;
        const c = Math.cos(o), s = Math.sin(o), vx = ux * c - uz * s, vz = ux * s + uz * c;
        const x = spawn.x + vx * r, z = spawn.z + vz * r;
        if (openSpot(x, z, k < 80 ? 22 : 10, k >= 80)) p = { x, z };
      }
      if (!p) return;
      const tx = spawn.x - p.x, tz = spawn.z - p.z;
      mkDummy(`MỤC TIÊU ${i + 1}`, { x: p.x, z: p.z, a: Math.atan2(-tx, -tz), az: (deg(Math.atan2(tx, -tz)) + 360) % 360 }, type);
    });
    if (g.updateAliveCount) g.updateAliveCount();
  }

  function mkDummy(name, s, type) {
    const g = lab.g;
    const u = new SPGUnit3D(g.scene, { name, isPlayer: false, team: 'RED', tankType: type, x: s.x, z: s.z, bodyAngle: s.a, azimuth: s.az, elevation: 0, charge: 2 });
    u.updateAI = () => {};          // đứng yên, không tự lái / tự bắn
    u._labHome = s;
    // bia mang giáp (thử đạn mình xuyên ERA / lồng thép / tấm ghép, APS bắn chặn)
    const set = ARMOR_SETS[lab.dummyArmor] && ARMOR_SETS[lab.dummyArmor][1];
    if (set && set.length && typeof Equipment !== 'undefined') {
      try { Equipment.equip(u, { m: set.filter(id => Equipment.compatible(id, type)), p: [], a: {} }, null); } catch (e) { /* bỏ qua */ }
    }
    place(u, s.x, s.z, s.a, s.az);
    g.units.push(u);
    lab.dummies.push(u);
    return u;
  }

  // Bất tử: mọi đường hư hại (giáp, ERA, APS, bộ phận) vẫn chạy như trận thật, chỉ giữ máu không dưới 10%
  function preparePlayer(u) {
    const td = u.takeDamage.bind(u);
    u.takeDamage = function (amount, attacker, source) {
      if (lab.god) amount = Math.min(amount, Math.max(0, this.hp - (this.maxHp || 1) * 0.1));
      return td(amount, attacker, source);
    };
  }
  // Sửa xe: dựng lại nguyên vẹn (giáp, gạch ERA, bộ phận, đạn APS, máu), máy nguội
  function repairPlayer() {
    const p = lab.g.player;
    if (!p || p.isDead) return;
    if (typeof VehicleDamage !== 'undefined') VehicleDamage.reset(p);
    p.hp = p.maxHp;
    if (p._eng) { p._eng.heat = 0; p._eng.lock = false; p._eng.lvl = 0; }
    addLog('[[tool]] Đã sửa xe về nguyên vẹn', 'ok');
  }

  function place(u, x, z, a, az) {
    const t = lab.g.terrain;
    u.x = x; u.z = z; u.bodyAngle = a; u.prevBodyAngle = a; u.speed = 0;
    if (az !== undefined) u.azimuth = az;
    u.y = t.getVehicleGroundAt ? t.getVehicleGroundAt(x, z) : t.getElevationAt(x, z);
    u._turretYaw = undefined; u._clearYaw = undefined;
    u.group.position.set(x, u.y, z);
    u.group.rotation.set(0, a, 0);
    u.lastTrackPos = { x, z };
  }

  function teleport() {
    const s = lab.home, u = lab.g.player;
    if (!s || !u) return;
    if (u.isDead) u.respawn(s.x, s.z);
    u.invulnerableTimer = 0;
    place(u, s.x, s.z, s.a, s.az);
    u.elevation = 0;
    u._labHome = s;
    if (lab.g.setSightMode && lab.g._sight) lab.g.setSightMode(false);
    if (lab.g._cam) lab.g._cam.unit = null;   // camera bám đuôi đặt lại ngay sau lưng xe ở chỗ mới
  }

  function revive(u) {
    const g = lab.g, h = u._labHome;
    g.respawnQueue = g.respawnQueue.filter(it => it.unit !== u);
    u.respawn(h.x, h.z);
    place(u, h.x, h.z, h.a, h.az);
  }

  function swapVehicle(type) {
    const g = lab.g, old = g.player;
    if (!old || old.tankType === type) return;
    lab.kit = null;   // đổi xe: về bộ đồ tài khoản của xe đó
    rebuildPlayer(type);
    addLog(`Đổi xe: ${TYPES.find(t => t[0] === type)[1]}`, 'info');
  }
  // Bộ đồ đang thử: lab.kit (bảng TRANG BỊ THỬ) hoặc bộ đồ tài khoản; luôn mang đủ mọi loại đạn đặc chủng
  function labKit(type) {
    let kit = null, stock = {};
    if (window.Account && Account.kitFor) { const k = Account.kitFor(type); kit = k.kit; stock = Object.assign({}, k.stock || {}); }
    if (lab.kit) kit = lab.kit;
    kit = kit ? JSON.parse(JSON.stringify(kit)) : { m: [], p: [], a: {} };
    delete kit.d;   // phòng thử: xe nguyên vẹn
    const shop = (typeof Equipment !== 'undefined' && Equipment.AMMO_SHOP[type]) || {};
    kit.a = {};
    for (const k in shop) { kit.a[k] = shop[k].max; stock[k] = Math.max(stock[k] || 0, shop[k].max * 10); }
    return { kit, stock };
  }
  function rebuildPlayer(type) {
    const g = lab.g, old = g.player;
    if (!old) return;
    if (g._sight) g.setSightMode(false);
    const idx = g.units.indexOf(old);
    old.isDead = true;
    g.scene.remove(old.group);
    if (old.trackMarks) old.trackMarks.forEach(m => m.mesh && g.scene.remove(m.mesh));
    const s = lab.home;
    const u = new SPGUnit3D(g.scene, { name: 'XE THỬ ĐẠN', isPlayer: true, team: 'BLUE', tankType: type, x: s.x, z: s.z, bodyAngle: s.a, azimuth: s.az, elevation: 0, charge: 2 });
    u.peerId = 'lab-me';
    // bộ trang bị đang thử (mặc định: bộ đồ tài khoản, như lúc vào trận)
    if (typeof Equipment !== 'undefined') {
      const k = labKit(type);
      try { Equipment.equip(u, k.kit, { local: false, stock: k.stock }); } catch (e) { console.warn('[LAB] equip', e); }
    }
    if (idx >= 0) g.units[idx] = u; else g.units.push(u);
    g.player = u;
    g.respawnQueue = g.respawnQueue.filter(it => it.unit !== old);
    tankType = type;
    if (g.matchmaking) g.matchmaking.selectedTankType = type;
    g.lockedTarget = null;
    preparePlayer(u);
    teleport();
    try { g.syncHUDControls(); g.updateAmmoUI(); if (g.hud && g.hud.refresh) g.hud.refresh(); } catch (e) { /* bỏ qua */ }
    syncUrl();
    renderUI();
    renderKit();
  }

  // Dựng lại bản đồ: nhà / cây / hàng rào / hố đạn về nguyên trạng (cùng loại + hạt giống), xe về chỗ cũ
  function rebuildMap() {
    const g = lab.g, T = g.terrain;
    addLog('[[refresh]] Đang dựng lại bản đồ…', 'info');
    renderLog();
    setTimeout(() => {
      if (g._sight) g.setSightMode(false);
      const fx = g.effectsManager && g.effectsManager.fx;
      if (fx && fx.clear) try { fx.clear(); } catch (e) { /* bỏ qua */ }
      if (typeof ExplosionFX !== 'undefined' && ExplosionFX.clearGroundHoles) ExplosionFX.clearGroundHoles();
      T.built = false;
      g.prepareMap(T.mapType, T.seed);
      const P = g.player;
      if (P) place(P, P.x, P.z, P.bodyAngle, P.azimuth);
      for (const d of lab.dummies) revive(d);
      if (g._cam) g._cam.unit = null;
      addLog('[[check]] Đã dựng lại bản đồ', 'ok');
    }, 60);
  }

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set('lab', 'range'); u.searchParams.set('map', BIOME); u.searchParams.set('tank', tankType);
    history.replaceState(null, '', u.toString());
  }

  // ---------------------------------------------------------------------------
  // MỖI KHUNG HÌNH
  // ---------------------------------------------------------------------------
  let uiT = 0;
  // Phòng thử: không giới hạn đạn (mọi loại đạn đặc biệt, tên lửa, dây đạn trạm súng nóc) — kho đạn luôn đầy lại
  const AMMO_KEYS = ['apAmmoCount', 'heAmmoCount', 'clusterAmmoCount', 'incendiaryAmmoCount', 'missileAmmoCount', 'specialAmmoCount'];
  function refillAmmo(u) {
    if (!u || u.isDead) return;
    let changed = false;
    for (const k of AMMO_KEYS) {
      if (u[k] === undefined) continue;
      const full = u._labAmmoFull ? u._labAmmoFull[k] : undefined;
      if (!u._labAmmoFull) u._labAmmoFull = {};
      if (full === undefined) u._labAmmoFull[k] = Math.max(u[k], k === 'incendiaryAmmoCount' ? 80 : 3);
      if (u[k] < u._labAmmoFull[k]) { u[k] = u._labAmmoFull[k]; changed = true; }
    }
    if (u._rcws && typeof DroneAir !== 'undefined' && DroneAir.C && DroneAir.C.RCWS) { u._rcws.mag = DroneAir.C.RCWS.mag; u._rcws.reload = 0; }
    if (changed) { const g = lab.g; try { g.updateAmmoUI(); } catch (e) { /* bỏ qua */ } }
  }

  function tick(dt) {
    const g = lab.g, p = g.player;
    refillAmmo(p);
    if (lab.fireMode !== 'off') fireBackTick(dt);
    updateKamis(dt);
    for (const d of lab.dummies) {
      if (d.isDead) continue;
      d.speed = 0;
      if (!lab.fireBack || !p || p.isDead) { if (lab.fireMode === 'off') { d.azimuth = d._labHome.az; d.elevation = 0; } continue; }
      const dx = p.x - d.x, dz = p.z - d.z;
      if (Math.hypot(dx, dz) > 1600) continue;
      d.azimuth = (deg(Math.atan2(dx, -dz)) + 360) % 360;
      d._fireT = (d._fireT === undefined ? 1 + Math.random() * 2 : d._fireT) - dt;
      if (d._fireT <= 0) {
        d._fireT = 2.8 + Math.random() * 1.8;
        const sol = g.ballistics.solveAimingForTarget(d.x, d.y, d.z, p.x, p.z, g.terrain, d);
        if (sol) d.elevation = sol.elevation;
        d._fireDelay = 0.3;
      }
      if (d._fireDelay !== undefined) {
        d._fireDelay -= dt;
        if (d._fireDelay <= 0) { d._fireDelay = undefined; d.reloadTimer = 0; try { d.fire(g.ballistics, g.radar); } catch (e) { /* bỏ qua */ } }
      }
    }
    // Phòng thử: luôn thấy mục tiêu (bỏ qua sương mù chiến tranh / tầm nhìn đồng đội)
    for (const d of lab.dummies) if (!d.isDead) { d.group.visible = true; d.isHiddenFromPlayer = false; }
    if (root) root.style.display = (g.tacticalMap && g.tacticalMap.isOpen) || g._sight ? 'none' : '';
    uiT += dt;
    if (uiT > 0.2) { uiT = 0; renderStatus(); }
  }

  // ---------------------------------------------------------------------------
  // BIA BẮN TRẢ THEO VŨ KHÍ CHỌN: bia còn sống gần nhất (pháo tăng: bia xe tăng gần nhất) bắn vào xe mình
  // ---------------------------------------------------------------------------
  function nearestDummy(p, tankOnly) {
    let best = null, bd = 1800;
    for (const d of lab.dummies) {
      if (d.isDead || (tankOnly && d.tankType !== 'ALL_ROUNDER')) continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  function fireBackTick(dt) {
    const g = lab.g, p = g.player, B = g.ballistics, M = lab.fireMode;
    if (!p || p.isDead || !B) return;
    lab._fbT = (lab._fbT === undefined ? 1.5 : lab._fbT) - dt;
    const burst = M === 'mg' || M === 'agl';
    if (lab._fbT > 0 && !(burst && lab._burst > 0)) return;
    const d = nearestDummy(p, M === 'ap' || M === 'heat');
    if (!d) return;
    const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
    const az = (deg(Math.atan2(dx, -dz)) + 360) % 360;
    d.azimuth = az;
    const aimY = (p.y || g.terrain.getElevationAt(p.x, p.z)) + 8;
    const muzzle = () => {
      const m = d.getMuzzleWorldTransform ? d.getMuzzleWorldTransform() : null;
      return m ? m.position.clone() : new THREE.Vector3(d.x, (d.y || 0) + 14, d.z);
    };
    const shoot = (ammo, az2, el2, opt) => {
      const pos = muzzle(), e = el2 * Math.PI / 180, a = az2 * Math.PI / 180;
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
      d._launchOverride = { position: pos.addScaledVector(dir, 4), direction: dir };
      let sh = null;
      try { sh = B.fireShell3D(d, az2, el2, 1, ammo); } catch (e2) { console.warn('[LAB] bắn trả', e2); } finally { d._launchOverride = null; }
      if (sh && opt) opt(sh);
      return sh;
    };
    if (burst) {
      if (!(lab._burst > 0)) { lab._burst = M === 'mg' ? 8 : 5; lab._bT = 0; }
      lab._bT -= dt;
      if (lab._bT > 0) return;
      lab._bT = M === 'mg' ? 0.11 : 0.3;
      lab._burst--;
      if (lab._burst <= 0) lab._fbT = 2.5;
      const S = g.airShotSolution ? g.airShotSolution(d, M === 'mg' ? 'MG762' : 'AGL40', p.x, aimY, p.z, 0, 0, 0) : null;
      if (!S) return;
      const j = () => (Math.random() - 0.5) * (M === 'mg' ? 0.5 : 0.9);
      if (M === 'mg') shoot('SCOUT_BULLET', S.az + j(), S.el + j());
      else {
        // quả lựu 40mm: như trạm phóng lựu nóc tháp (drone_air.fireRoofAGL) — sơ tốc thấp, nổ mảnh
        const R = typeof DroneAir !== 'undefined' && DroneAir.C && DroneAir.C.ROOF && DroneAir.C.ROOF.agl;
        shoot('GATLING_BULLET', S.az + j(), S.el + j(), sh => {
          const k = (R && R.v) || 0.3;
          sh.vx *= k; sh.vy *= k; sh.vz *= k;
          sh.isGatling = false; sh.gl40 = true;
          sh.roofDirect = R ? R.direct : 0.32; sh.roofSplash = R ? R.splash : 0.5; sh.roofBlast = R ? R.blast : { radius: 26, core: 6 };
        });
        if (window.soundEngine && window.soundEngine.playGrenadeLauncher) window.soundEngine.playGrenadeLauncher(Math.max(1, dist), { x: d.x, z: d.z }, d.id);
      }
      return;
    }
    lab._fbT = M === 'kami' ? 7 : 3.6 + Math.random();
    if (M === 'kami') { spawnKami(d, p); return; }
    if (M === 'ap' || M === 'heat') {
      d.selectedAmmo = M === 'ap' ? 'AP' : 'NORMAL';
      const sol = B.solveAimingForTarget(d.x, d.y, d.z, p.x, p.z, g.terrain, d, { atUnit: true });
      if (sol) d.elevation = sol.elevation;
      d.reloadTimer = 0;
      try { d.fire(B, g.radar); } catch (e) { /* bỏ qua */ }
      return;
    }
    // RPG / tên lửa / tên lửa tấn công đỉnh: phóng từ bia, dẫn về xe mình
    const ammo = M === 'rpg' ? 'RPG' : 'ANTI_TANK_MISSILE';
    d.missileTarget = { unit: p };
    d.ammoMods = M === 'top' ? { ANTI_TANK_MISSILE: { top: true } } : {};
    let el = 3;
    if (M === 'rpg') {
      // RPG không điều khiển: giải góc bắn thẳng vào giữa thân xe như xạ thủ thật
      const keep = d.selectedAmmo;
      d.selectedAmmo = 'RPG';
      const sol = B.solveAimingForTarget(d.x, d.y, d.z, p.x, p.z, g.terrain, d, { atUnit: true });
      d.selectedAmmo = keep;
      el = sol ? sol.elevation : Math.atan2(aimY - ((d.y || 0) + 14), dist) * 180 / Math.PI;
    }
    shoot(ammo, az, el);
    const SE = window.soundEngine, snd = SE && (M === 'rpg' ? SE.playRocketLaunch : SE.playMissileLaunch);
    if (snd) snd.call(SE, Math.max(1, dist), { x: d.x, z: d.z });
  }
  // UAV cảm tử của bia: bay thấp tới xe mình rồi bổ nhào, chạm thì kích nổ đầu nổ lõm-mảnh trên nóc (như kamikaze_uav.js)
  function spawnKami(d) {
    if (typeof KamiUAV === 'undefined') return;
    const g = lab.g, m = KamiUAV.build('RED');
    g.scene.add(m);
    lab.kamis.push({ d, m, x: d.x, y: (d.y || 0) + 60, z: d.z, v: 140 });
    addLog('[[drone]] Bia phóng UAV cảm tử về phía xe bạn!', 'hit');
  }
  function updateKamis(dt) {
    const g = lab.g, p = g.player, B = g.ballistics;
    for (let i = lab.kamis.length - 1; i >= 0; i--) {
      const K = lab.kamis[i];
      if (!p || p.isDead) { g.scene.remove(K.m); lab.kamis.splice(i, 1); continue; }
      const ty = (p.y || 0) + 9, dx = p.x - K.x, dz = p.z - K.z, hd = Math.hypot(dx, dz);
      const dive = hd < 160;
      K.v = Math.min(dive ? 420 : 160, K.v + dt * (dive ? 400 : 60));
      const wantY = dive ? ty : Math.max(ty + 45, g.terrain.getElevationAt(K.x, K.z) + 40);
      const dy = wantY - K.y, L = Math.hypot(dx, dy, dz) || 1;
      K.x += dx / L * K.v * dt; K.y += dy / L * K.v * dt; K.z += dz / L * K.v * dt;
      K.m.position.set(K.x, K.y, K.z);
      K.m.rotation.set(dive ? -0.9 : -0.1, Math.atan2(-dx, -dz), 0);
      KamiUAV.animate(K.m, dt, 1, 1);
      if (Math.hypot(p.x - K.x, ty - K.y, p.z - K.z) < 10 || K.y < g.terrain.getElevationAt(K.x, K.z) + 1) {
        const pos = new THREE.Vector3(p.x, (p.y || 0) + 24, p.z), dir = new THREE.Vector3(0.02, -1, 0.02).normalize();
        const C = KamiUAV.C || { direct: 3.4, splash: 1.5, blast: { radius: 46, core: 14 } };
        K.d._launchOverride = { position: pos, direction: dir };
        let sh = null;
        try { sh = B.fireShell3D(K.d, 0, -88, 1, 'RPG'); } finally { K.d._launchOverride = null; }
        if (sh) { sh.vx = dir.x * 360; sh.vy = dir.y * 360; sh.vz = dir.z * 360; sh.roofDirect = C.direct; sh.roofSplash = C.splash; sh.roofBlast = C.blast; sh.kami = true; }
        g.scene.remove(K.m);
        lab.kamis.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // BẢNG PHÁT TRÚNG: mặt giáp, độ dày quy đổi, độ xuyên, hệ số, máu mất, bộ phận hỏng (VehicleDamage d.last)
  // ---------------------------------------------------------------------------
  const FACE = { front: 'mũi', rear: 'đuôi', sideL: 'sườn trái', sideR: 'sườn phải', top: 'nóc' };
  const AMMO_NAME = { AP: 'đạn xuyên giáp', NORMAL: 'đạn nổ lõm', HE: 'đạn nổ mạnh', RPG: 'RPG', ANTI_TANK_MISSILE: 'tên lửa', GATLING_BULLET: 'đạn 30mm', SCOUT_BULLET: 'đạn 12.7', INCENDIARY: 'đạn cháy', CLUSTER: 'đạn chùm' };
  function hookHits(g) {
    const orig = g.handleShellImpact;
    g.handleShellImpact = function (shell, ht, tgt) {
      const watch = [g.player, ...lab.dummies].filter(u => u && !u.isDead);
      const hp0 = watch.map(u => u.hp), t0 = Date.now();
      const r = orig.call(this, shell, ht, tgt);
      try {
        watch.forEach((u, i) => {
          const lost = hp0[i] - u.hp, L = u.dmg && u.dmg.last;
          const direct = ht === 'DIRECT_HIT' && tgt === u;
          if (!direct && !(lost > 0.001)) return;
          const who = u === g.player ? 'XE BẠN' : u.name;
          const nm = shell.kami ? 'UAV cảm tử' : shell.gl40 ? 'lựu 40mm' : (AMMO_NAME[shell.ammoType] || shell.ammoType);
          let txt = `${who} ← ${nm}`;
          if (direct && L && L.at >= t0 && L.intercepted) txt += ': HỆ THỐNG ĐÁNH CHẶN (APS) BẮN HẠ trước khi chạm xe';
          else if (direct && L && L.at >= t0) {
            txt += `: ${FACE[L.face] || L.face}${L.onTurret ? ' tháp' : ''}`;
            if (L.armorMm !== undefined) txt += ` · giáp ${L.armorMm}mm / xuyên ${L.penMm}mm · ${L.pen ? 'XUYÊN' : 'không xuyên'}`;
            if (L.mul !== undefined) txt += ` · hệ số ${(+L.mul).toFixed(2)}`;
            const ev = (L.events || []).map(e => e.text).filter(Boolean).slice(0, 2);
            if (ev.length) txt += ` · ${ev.join(' · ')}`;
          } else if (!direct) txt += ' (nổ gần)';
          txt += ` · −${Math.max(0, lost).toFixed(2)} máu`;
          lab.hits.unshift(txt);
          lab.hits.length = Math.min(lab.hits.length, 5);
          renderHits();
        });
      } catch (e) { /* bỏ qua */ }
      return r;
    };
  }

  // ---------------------------------------------------------------------------
  // TRANG BỊ THỬ: lắp / tháo bất kỳ món nào hợp với xe (miễn phí, chỉ trong phòng thử)
  // ---------------------------------------------------------------------------
  function curKit() {
    const P = lab.g.player;
    return lab.kit || (P && P.kit ? JSON.parse(JSON.stringify(P.kit)) : { m: [], p: [], a: {} });
  }
  function toggleItem(id) {
    const Eq = Equipment, type = lab.g.player.tankType, k = curKit();
    k.m = k.m || []; k.p = k.p || [];
    if (Eq.PREMIUM[id]) {
      k.p = k.p.includes(id) ? k.p.filter(x => x !== id) : k.p.concat(id);
    } else {
      const M = Eq.MODULES[id];
      if (!M) return;
      if (k.m.includes(id)) k.m = k.m.filter(x => x !== id);
      else {
        if ((Eq.MOUNT_CATS || []).includes(M.cat)) k.m = k.m.filter(x => !(Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat));
        const C = Eq.CATS[M.cat];
        const same = k.m.filter(x => Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat);
        if (C && same.length >= C.slots) k.m = k.m.filter(x => x !== same[0]);   // nhóm đủ ô: thay món lắp sớm nhất
        k.m.push(id);
      }
    }
    lab.kit = Eq.sanitize(k, type);
    rebuildPlayer(type);
    const nm = (Eq.MODULES[id] || Eq.PREMIUM[id]).name;
    addLog(`[[tool]] Thử: ${nm} ${(lab.kit.m.includes(id) || lab.kit.p.includes(id)) ? 'đã lắp' : 'đã tháo'}`, 'info');
  }
  function renderKit() {
    const el = root && root.querySelector('#rg-kit'), P = lab.g && lab.g.player;
    if (!el || !P || typeof Equipment === 'undefined') return;
    const Eq = Equipment, type = P.tankType, k = P.kit || { m: [], p: [] };
    let h = '';
    for (const c in Eq.CATS) {
      if (c === 'ammo') continue;
      const ids = Object.keys(Eq.MODULES).filter(id => Eq.MODULES[id].cat === c && Eq.compatible(id, type));
      if (!ids.length) continue;
      h += `<div class="kc">${Eq.CATS[c].name}</div><div class="row">`;
      for (const id of ids) {
        const on = k.m.includes(id) || (Eq.slotOf && !k.m.some(x => Eq.MODULES[x] && Eq.MODULES[x].cat === c) && Eq.slotOf(k, type, c) === id);
        h += `<button data-kit="${id}" class="${on ? 'on' : ''}" title="${Eq.MODULES[id].desc.replace(/"/g, '&quot;')}">${Eq.MODULES[id].name}</button>`;
      }
      h += '</div>';
    }
    const prem = Object.keys(Eq.PREMIUM).filter(id => Eq.PREMIUM[id].tank === type);
    if (prem.length) {
      h += '<div class="kc">ĐẠN CAO CẤP</div><div class="row">';
      for (const id of prem) h += `<button data-kit="${id}" class="${(k.p || []).includes(id) ? 'on' : ''}">${Eq.PREMIUM[id].name}</button>`;
      h += '</div>';
    }
    el.innerHTML = h;
  }
  function renderHits() {
    const el = root && root.querySelector('#rg-hits');
    if (!el) return;
    el.innerHTML = lab.hits.length ? lab.hits.map(t => `<div>${t.replace(/</g, '&lt;')}</div>`).join('') : '<div class="dim">Chưa có phát trúng</div>';
  }

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  function addLog(text, kind) {
    const last = lab.log[0];
    if (last && last.text === text) last.n++;
    else lab.log.unshift({ text, kind, n: 1 });
    lab.log.length = Math.min(lab.log.length, 5);
    renderLog();
  }
  const icon = s => s.replace(/\[\[([\w-]+)\]\]/g, '<i class="ti ti-$1" aria-hidden="true"></i>');

  let root = null;
  function buildUI() {
    const css = document.createElement('style');
    css.textContent = `
      #rg-lab{position:fixed;top:72px;right:14px;width:296px;z-index:9000;display:flex;flex-direction:column;max-height:calc(100vh - 90px);
        font:12px/1.35 var(--font-tech);color:var(--tc-text);user-select:none;background:var(--tc-panel);border:1px solid var(--tc-line);
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 10px 40px rgba(0,0,0,.5)}
      #rg-lab::before,#rg-lab::after{content:'';position:absolute;width:14px;height:14px;pointer-events:none;border:0 solid var(--tc-accent);opacity:.85}
      #rg-lab::before{top:-1px;left:-1px;border-width:2px 0 0 2px}#rg-lab::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
      #rg-lab .rg-head{display:flex;align-items:center;gap:9px;padding:10px 12px 9px;border-bottom:1px solid var(--tc-line)}
      #rg-lab .rg-head>.ti{font-size:22px;color:var(--tc-accent)}
      #rg-lab h1{margin:0;font-size:14px;font-weight:700;letter-spacing:2px;color:var(--tc-bright)}
      #rg-lab .rg-sub{font-size:10.5px;color:var(--tc-dim)}
      #rg-lab .rg-head a{margin-left:auto;display:flex;align-items:center;gap:4px;padding:4px 8px;font-size:11px;font-weight:600;color:var(--tc-dim);text-decoration:none;border:1px solid var(--tc-line)}
      #rg-lab .rg-head a:hover{color:var(--tc-text);border-color:var(--tc-line-2)}
      #rg-lab .rg-body{flex:1;min-height:0;overflow:auto;padding:4px 12px 12px}
      #rg-lab .lbl{margin:9px 0 4px;font-size:10.5px;font-weight:700;letter-spacing:1.4px;color:var(--tc-dim)}
      #rg-lab .row{display:flex;flex-wrap:wrap;gap:4px}
      #rg-lab button{flex:1 1 auto;min-width:60px;padding:5px 6px;cursor:pointer;font:600 11.5px/1.3 var(--font-tech);color:var(--tc-text);
        background:rgba(200,210,192,.04);border:1px solid var(--tc-line);transition:color .15s,border-color .15s,background .15s}
      #rg-lab button:hover{border-color:var(--tc-line-2);background:rgba(200,210,192,.08)}
      #rg-lab button.on{color:var(--tc-accent-2);border-color:var(--tc-accent);background:var(--tc-accent-soft)}
      #rg-lab button.go{color:#0a0d0c;background:var(--tc-accent);border-color:var(--tc-accent)}#rg-lab button.go:hover{background:var(--tc-accent-2)}
      #rg-lab .tg{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin-top:4px;font-size:11px}
      #rg-lab .tg span:nth-child(2n){font-family:var(--font-mono);color:var(--tc-dim)}
      #rg-lab .tg .dead{color:var(--tc-red)}
      #rg-lab .log{margin-top:8px;display:grid;gap:3px;font-size:11px;color:var(--tc-dim)}
      #rg-lab .log .ok{color:var(--tc-ok)}#rg-lab .log .hit{color:var(--tc-red)}
      #rg-lab .kc{margin:6px 0 2px;font-size:9.5px;letter-spacing:1.2px;color:var(--tc-dim)}
      #rg-lab #rg-kit button,#rg-lab #rg-fm button{min-width:0;font-size:10.5px;padding:4px 5px}
      #rg-lab .hits{margin-top:4px;display:grid;gap:4px;font-size:10.5px;line-height:1.35;color:var(--tc-text)}
      #rg-lab .hits div{padding:3px 5px;background:rgba(200,210,192,.05);border-left:2px solid var(--tc-accent)}
      #rg-lab .hits .dim{color:var(--tc-dim);border-left-color:var(--tc-line)}
      #rg-lab details>summary{cursor:pointer;list-style:none}#rg-lab details>summary::-webkit-details-marker{display:none}
      #rg-lab kbd{font:10px var(--font-mono);color:var(--tc-text);padding:0 4px;border:1px solid var(--tc-line-2);border-bottom-width:2px}`;
    document.head.appendChild(css);
    root = document.createElement('div');
    root.id = 'rg-lab';
    root.addEventListener('keydown', e => e.stopPropagation());
    // Không giữ focus trên nút (Space để bắn sẽ không bấm lại nút)
    root.addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });
    document.body.appendChild(root);
    root.innerHTML = `
      <div class="rg-head"><i class="ti ti-target-arrow" aria-hidden="true"></i><div><h1>PHÒNG THỬ ĐẠN</h1>
        <div class="rg-sub">Lái & bắn như trong trận — <kbd>Ctrl</kbd> kính ngắm</div></div>
        <a href="index.html" title="Về sảnh chờ"><i class="ti ti-arrow-left" aria-hidden="true"></i> Sảnh</a></div>
      <div class="rg-body">
        <div class="lbl">XE</div><div class="row" id="rg-types"></div>
        <div class="lbl">BẢN ĐỒ</div><div class="row" id="rg-maps"></div>
        <div class="lbl">BÃI THỬ</div>
        <div class="row">
          <button id="rg-home"><i class="ti ti-home" aria-hidden="true"></i> Về chỗ xuất phát</button>
          <button id="rg-revive"><i class="ti ti-heart-plus" aria-hidden="true"></i> Hồi sinh mục tiêu</button>
          <button id="rg-god">Bất tử</button><button id="rg-wreck">Giữ xác mục tiêu</button>
          <button id="rg-repair"><i class="ti ti-tool" aria-hidden="true"></i> Sửa xe</button>
          <button id="rg-rebuild" class="go"><i class="ti ti-refresh" aria-hidden="true"></i> Dựng lại bản đồ</button>
        </div>
        <div class="lbl">BIA BẮN TRẢ XE BẠN</div><div class="row" id="rg-fm"></div>
        <div class="lbl">BIA MANG GIÁP</div><div class="row" id="rg-da"></div>
        <details id="rg-kitbox"><summary class="lbl">TRANG BỊ THỬ <span style="font-weight:400">(miễn phí, không lưu) ▾</span></summary>
          <div class="row"><button id="rg-kit-reset"><i class="ti ti-user" aria-hidden="true"></i> Về bộ đồ tài khoản</button></div>
          <div id="rg-kit"></div></details>
        <div class="lbl">PHÁT TRÚNG</div><div class="hits" id="rg-hits"></div>
        <div class="lbl">MỤC TIÊU</div><div class="tg" id="rg-tg"></div>
        <div class="log" id="rg-log"></div>
      </div>`;
    const types = root.querySelector('#rg-types');
    for (const [id, name] of TYPES) { const b = document.createElement('button'); b.dataset.type = id; b.textContent = name; b.onclick = () => swapVehicle(id); types.appendChild(b); }
    const maps = root.querySelector('#rg-maps');
    for (const [id, name] of MAPS) {
      const b = document.createElement('button'); b.dataset.map = id; b.textContent = name;
      b.onclick = () => { if (id === BIOME) return; try { localStorage.setItem('rg-map', id); } catch (e) { /* bỏ qua */ } const u = new URL(location.href); u.searchParams.set('map', id); u.searchParams.set('tank', tankType); location.href = u.toString(); };
      maps.appendChild(b);
    }
    root.querySelector('#rg-home').onclick = () => { teleport(); addLog('Về chỗ xuất phát', 'info'); };
    root.querySelector('#rg-revive').onclick = () => { for (const d of lab.dummies) revive(d); addLog('[[heart-plus]] Đã hồi sinh mục tiêu', 'ok'); };
    const fm = root.querySelector('#rg-fm');
    for (const [id, name] of FIRE_MODES) {
      const b = document.createElement('button'); b.dataset.fm = id; b.textContent = name;
      b.onclick = () => { lab.fireMode = id; lab._fbT = 0.8; lab._burst = 0; renderUI(); if (id !== 'off') addLog(`[[target-arrow]] Bia bắn trả bằng: ${name}`, 'hit'); };
      fm.appendChild(b);
    }
    const da = root.querySelector('#rg-da');
    ARMOR_SETS.forEach(([name], i) => {
      const b = document.createElement('button'); b.dataset.da = i; b.textContent = name;
      b.onclick = () => { if (lab.dummyArmor === i) return; lab.dummyArmor = i; placeAll(); renderUI(); addLog(`[[shield]] Bia: ${name}`, 'info'); };
      da.appendChild(b);
    });
    root.querySelector('#rg-repair').onclick = repairPlayer;
    root.querySelector('#rg-kit-reset').onclick = () => { lab.kit = null; rebuildPlayer(lab.g.player.tankType); addLog('[[user]] Về bộ đồ tài khoản', 'info'); };
    root.querySelector('#rg-kit').addEventListener('click', e => { const b = e.target.closest('[data-kit]'); if (b) toggleItem(b.dataset.kit); });
    renderKit();
    renderHits();
    root.querySelector('#rg-god').onclick = () => { lab.god = !lab.god; renderUI(); };
    root.querySelector('#rg-wreck').onclick = () => { lab.keepWreck = !lab.keepWreck; renderUI(); };
    root.querySelector('#rg-rebuild').onclick = rebuildMap;
    renderUI();
    renderStatus();
  }

  // ---------------------------------------------------------------------------
  // UAV ĐỊCH BAY NGẪU NHIÊN TRÊN TRỜI — để thử súng phòng không (nhấp vào drone để khóa, giữ Space xả đạn).
  // Không hồi sinh: bắn rơi chiếc nào mất chiếc đó (muốn có lại thì tải lại phòng thử).
  // Gắn vào danh sách mục tiêu trên không của DroneAir (updateOtherDrones) nên khóa / đón đầu / radar phòng không /
  // trúng đạn / rơi cháy đều chạy đúng như drone thật trong trận.
  // ---------------------------------------------------------------------------
  const UAV_N = 4;
  function spawnUAVs(g) {
    if (typeof ReconDrone === 'undefined' || !g.updateOtherDrones) return;
    const p = g.player, cx = p ? p.x : 0, cz = p ? p.z : 0;
    lab.uavs = [];
    for (let i = 0; i < UAV_N; i++) {
      const a = Math.random() * Math.PI * 2, d = 500 + Math.random() * 900;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      lab.uavs.push({ key: 'lab' + i, lab: true, team: 'RED', state: 'flying', hp: 1, net: false, seen: true,
        x, z, y: g.terrain.getElevationAt(x, z) + 200 + Math.random() * 250, yaw: Math.random() * 6.28,
        wvx: 0, wvy: 0, wvz: 0, model: null, cx, cz, wp: null, sp: 60 + Math.random() * 90, alt: 0 });
    }
    const origOther = g.updateOtherDrones;
    g.updateOtherDrones = function (dt, list) {
      origOther.call(this, dt, list);
      for (const R of lab.uavs) if (R.hp > 0) { flyUAV(this, R, dt); list.push(R); }
    };
    const origShot = g.onDroneShot;
    g.onDroneShot = function (s, dr, h) {
      origShot.call(this, s, dr, h);   // tia lửa + tiếng trúng
      if (!dr || !dr.lab || dr.hp <= 0) return;
      const C = DroneAir.C;
      const dmg = (s.aaMG ? C.RCWS.dmgDrone : (C.DMG[s.ammoType] || 0)) * (h && h.d > C.HIT_R ? (C.FRAG_K || 0.5) : 1);
      if (!dmg) return;
      dr.hp -= dmg;
      if (this.player && s.shooterId === this.player.id) this._droneHitMark = 0.35;
      if (dr.hp > 0) return;
      if (dr.model && dr.model.parent) dr.model.parent.remove(dr.model);
      this.startDroneFall(dr.team, dr.x, dr.y, dr.z, dr.wvx, dr.wvz, dr.yaw, false);
      if (this._airAim && this._airAim.dr === dr) this._airAim = null;
      const left = lab.uavs.filter(u => u.hp > 0).length;
      addLog(`[[drone-off]] Đã bắn rơi UAV · còn ${left}/${UAV_N}`, 'ok');
    };
    addLog(`[[drone]] ${UAV_N} UAV địch đang bay trên trời — nhấp vào drone để khóa, giữ Space xả đạn`, 'info');
  }

  // Bay lượn ngẫu nhiên: chọn điểm đến bất kỳ quanh bãi thử, bay tới đó (quay đầu dần, lên xuống độ cao) rồi chọn điểm mới
  function flyUAV(g, R, dt) {
    const T = g.terrain;
    if (!R.wp || Math.hypot(R.wp.x - R.x, R.wp.z - R.z) < 60) {
      const a = Math.random() * Math.PI * 2, d = 300 + Math.random() * 1200;
      R.wp = { x: R.cx + Math.cos(a) * d, z: R.cz + Math.sin(a) * d };
      R.alt = 160 + Math.random() * 320;
      R.sp = 60 + Math.random() * 100;
    }
    const want = Math.atan2(-(R.wp.x - R.x), -(R.wp.z - R.z));
    let dy = want - R.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    R.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, dy));
    // bay theo hướng mũi (mũi quay về -z khi yaw = 0, như drone trong trận)
    R.x += -Math.sin(R.yaw) * R.sp * dt;
    R.z += -Math.cos(R.yaw) * R.sp * dt;
    const gy = T.getElevationAt(R.x, R.z), ty = gy + R.alt;
    R.y += Math.max(-40 * dt, Math.min(40 * dt, ty - R.y));
    R.y = Math.max(R.y, gy + 60);
    g.trackDroneVel(R, dt);
    if (!R.model) R.model = ReconDrone.build(R.team);
    const m = R.model;
    if (m.parent !== g.scene) g.scene.add(m);
    m.visible = true;
    m.position.set(R.x, R.y, R.z);
    const tilt = Math.min(0.25, Math.hypot(R.wvx, R.wvz) / 2400);
    m.rotation.set(-tilt, R.yaw, 0);
    ReconDrone.animate(m, dt, 1);
  }

  function renderUI() {
    if (!root) return;
    root.querySelectorAll('#rg-types button').forEach(b => b.classList.toggle('on', b.dataset.type === tankType));
    root.querySelectorAll('#rg-maps button').forEach(b => b.classList.toggle('on', b.dataset.map === BIOME));
    root.querySelectorAll('#rg-fm button').forEach(b => b.classList.toggle('on', b.dataset.fm === lab.fireMode));
    root.querySelectorAll('#rg-da button').forEach(b => b.classList.toggle('on', +b.dataset.da === lab.dummyArmor));
    root.querySelector('#rg-god').classList.toggle('on', lab.god);
    root.querySelector('#rg-wreck').classList.toggle('on', lab.keepWreck);
  }

  function renderStatus() {
    const el = root && root.querySelector('#rg-tg'), p = lab.g && lab.g.player;
    if (!el || !p) return;
    const html = lab.dummies.map(d => `<span class="${d.isDead ? 'dead' : ''}">${d.name}${d.isDead ? ' · ĐÃ HẠ' : ''}</span><span>${Math.round(Math.hypot(d.x - p.x, d.z - p.z))} M · ${Math.round(Math.max(0, d.hp) / (d.maxHp || 1) * 100)}%</span>`).join('');
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }

  function renderLog() {
    const el = root && root.querySelector('#rg-log');
    if (!el) return;
    el.innerHTML = lab.log.map(l => `<div class="${l.kind || ''}">${icon(l.text)}${l.n > 1 ? ' ×' + l.n : ''}</div>`).join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
