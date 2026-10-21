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

  const lab = { g: null, dummies: [], home: null, village: null, god: true, fireBack: false, keepWreck: false, log: [] };
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
    placeAll();
    const origUpdate = g.update;
    g.update = function (dt) { origUpdate.call(this, dt); tick(dt); };
    buildUI();
    addLog('Ctrl: kính ngắm như trong trận · Tab: khóa mục tiêu · Space / chuột trái: bắn · M: bản đồ', 'info');
    window.rangeLab = lab;
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
    const plan = [[220, -0.18, 'ALL_ROUNDER'], [D - 90, 0.12, 'GATLING'], [D + 40, -0.06, 'ALL_ROUNDER'], [D + 170, 0.2, 'ARTILLERY']];
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
    place(u, s.x, s.z, s.a, s.az);
    g.units.push(u);
    lab.dummies.push(u);
    return u;
  }

  function preparePlayer(u) {
    const td = u.takeDamage.bind(u);
    u.takeDamage = function (amount, attacker, source) {
      if (lab.god) return { blocked: false, killed: false, prevHp: this.hp, currentHp: this.hp };
      return td(amount, attacker, source);
    };
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
    if (g._sight) g.setSightMode(false);
    const idx = g.units.indexOf(old);
    old.isDead = true;
    g.scene.remove(old.group);
    if (old.trackMarks) old.trackMarks.forEach(m => m.mesh && g.scene.remove(m.mesh));
    const s = lab.home;
    const u = new SPGUnit3D(g.scene, { name: 'XE THỬ ĐẠN', isPlayer: true, team: 'BLUE', tankType: type, x: s.x, z: s.z, bodyAngle: s.a, azimuth: s.az, elevation: 0, charge: 2 });
    u.peerId = 'lab-me';
    // bộ trang bị đang lắp của tài khoản (như lúc vào trận)
    if (typeof Equipment !== 'undefined') {
      let kit = null, opts = null;
      if (window.Account && Account.kitFor) { const k = Account.kitFor(type); kit = k.kit; opts = { local: true, stock: k.stock }; }
      try { Equipment.equip(u, kit, opts); } catch (e) { /* bỏ qua */ }
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
    addLog(`Đổi xe: ${TYPES.find(t => t[0] === type)[1]}`, 'info');
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
    for (const d of lab.dummies) {
      if (d.isDead) continue;
      d.speed = 0;
      if (!lab.fireBack || !p || p.isDead) { d.azimuth = d._labHome.az; d.elevation = 0; continue; }
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
          <button id="rg-fire">Mục tiêu bắn trả</button><button id="rg-god">Bất tử</button><button id="rg-wreck">Giữ xác mục tiêu</button>
          <button id="rg-rebuild" class="go"><i class="ti ti-refresh" aria-hidden="true"></i> Dựng lại bản đồ</button>
        </div>
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
    root.querySelector('#rg-fire').onclick = () => { lab.fireBack = !lab.fireBack; renderUI(); };
    root.querySelector('#rg-god').onclick = () => { lab.god = !lab.god; renderUI(); };
    root.querySelector('#rg-wreck').onclick = () => { lab.keepWreck = !lab.keepWreck; renderUI(); };
    root.querySelector('#rg-rebuild').onclick = rebuildMap;
    renderUI();
    renderStatus();
  }

  function renderUI() {
    if (!root) return;
    root.querySelectorAll('#rg-types button').forEach(b => b.classList.toggle('on', b.dataset.type === tankType));
    root.querySelectorAll('#rg-maps button').forEach(b => b.classList.toggle('on', b.dataset.map === BIOME));
    root.querySelector('#rg-fire').classList.toggle('on', lab.fireBack);
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
