/**
 * PHÒNG THỬ NGHIỆM BẢN ĐỒ CỨ ĐIỂM (mở bằng stronghold_lab.html -> index.html?lab=stronghold)
 *
 * - Bản đồ bố cục "3 cứ điểm trên 3 đồi" (A, B, C hình tam giác), không vòng bo, không giới hạn thời gian
 * - Xe người chơi thả ngay ngoài miệng cứ điểm A; đổi loại xe tại chỗ; dịch chuyển tới miệng / trong khoang A, B, C
 * - 4 xe mục tiêu đứng sẵn trong khoang B và C (đứng yên, tùy chọn bắn trả) để thử góc bắn & vùng bảo vệ
 * - Hiện vùng bảo vệ (hộp xanh) + quạt góc bắn của nòng pháo xe đang lái ở từng chỗ đứng trong khoang
 * - Nhật ký trúng đạn: bị bê tông chặn / trúng phần thò ra (máu mất, % thân xe lộ)
 * - Thử hiệu ứng ngay trong game thật (HUD thật): bắn mọi loại đạn vào xe mục tiêu / xe mình (trúng, nổ sát bên, loạt),
 *   phá từng bộ phận, phá hủy xe, bắn vào xác, giữ xác xe — đi qua đúng game.handleShellImpact & VehicleDamage
 *
 * Tham số URL: map=HIGHLAND|DESERT|JUNGLE|URBAN|RIVER_LAKE, seed=<số>, tank=ALL_ROUNDER|GATLING|ARTILLERY|SCOUT
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('lab') !== 'stronghold') return;
  window.STRONGHOLD_LAB = true;
  if (typeof MapGen !== 'undefined') MapGen.setLayout('STRONGHOLDS');
  // landmark=nuke|bio|sam|power|radar: ép công trình giữa 3 cứ điểm (mặc định theo bản đồ: MapGen MAP_LANDMARK)
  if (typeof MapGen !== 'undefined' && MapGen.setLandmark) MapGen.setLandmark(q.get('landmark'));
  // Chơi độc lập: không vào sảnh mạng
  try { window.NetTransport = undefined; } catch (e) { /* bỏ qua */ }

  const BIOME = (q.get('map') || 'HIGHLAND').toUpperCase();
  const SEED = (parseInt(q.get('seed'), 10) || 20261019) >>> 0;
  const TYPES = [
    ['ALL_ROUNDER', 'HALBERD MK.3', 'Tăng chủ lực'],
    ['GATLING', 'HAILSTORM R6', 'Hỏa lực 30mm'],
    ['ARTILLERY', 'ARBALEST 155', 'Pháo 6x6'],
    ['SCOUT', 'MARTEN R4', 'Trinh sát']
  ];
  const MAPS = [['HIGHLAND', 'Cao nguyên'], ['RIVER_LAKE', 'Sông hồ'], ['JUNGLE', 'Rừng'], ['DESERT', 'Sa mạc'], ['URBAN', 'Đô thị']];
  let tankType = (q.get('tank') || 'ALL_ROUNDER').toUpperCase();
  if (!TYPES.some(t => t[0] === tankType)) tankType = 'ALL_ROUNDER';

  const lab = { god: false, fireBack: false, overlay: false, reveal: true, dummies: [], log: [], overlayObjs: [], home: null,
    fxTarget: 0, fxAmmo: 'HE', keepWreck: true };
  // Thử hiệu ứng: loại đạn bắn thử (HE155 = lựu pháo 155mm rơi gần thẳng đứng)
  const FX_AMMO = [
    ['NORMAL', 'Thường'], ['AP', 'Xuyên giáp'], ['HE', 'Nổ mạnh'], ['HE155', 'Lựu 155'], ['CLUSTER', 'Đạn chùm'],
    ['RPG', 'Tên lửa'], ['GATLING_BULLET', '30mm'], ['SCOUT_BULLET', '12.7mm'], ['INCENDIARY', 'Đạn cháy']
  ];
  // Phá bộ phận theo loại xe (VehicleDamage.debugAction), giống phòng thử chiến xa
  const PART_ACTIONS = {
    ALL_ROUNDER: [['skirt', 'Váy xích'], ['applique', 'Bắn giáp mũi'], ['track', 'Đứt xích'], ['ring', 'Kẹt tháp'], ['gun', 'Cong nòng'], ['optic', 'Kính ngắm'], ['engine', 'Động cơ'], ['antenna', 'Ăng-ten'], ['acc', 'Phụ kiện']],
    GATLING: [['era', 'Nổ 1 viên ERA'], ['cage', 'Lồng lưới'], ['feed', 'Máng đạn'], ['track', 'Đứt xích'], ['gun', 'Cụm nòng'], ['ring', 'Kẹt tháp'], ['engine', 'Động cơ'], ['antenna', 'Ăng-ten'], ['acc', 'Phụ kiện']],
    SCOUT: [['tire', 'Xẹp lốp'], ['wheel', 'Văng bánh'], ['glass', 'Vỡ kính'], ['sensor', 'Radar'], ['atgm', 'Ống tên lửa'], ['engine', 'Động cơ'], ['antenna', 'Ăng-ten'], ['acc', 'Phụ kiện']],
    ARTILLERY: [['tire', 'Xẹp lốp'], ['wheel', 'Văng bánh'], ['glass', 'Vỡ kính'], ['fuel', 'Thùng xăng'], ['ammo', 'Nổ hòm đạn'], ['hyd', 'Thủy lực'], ['frame', 'Méo khung'], ['gun', 'Cong nòng'], ['ring', 'Kẹt bàn xoay'], ['acc', 'Phụ kiện']]
  };
  const deg = r => r * 180 / Math.PI;

  // ---------------------------------------------------------------------------
  // KHỞI ĐỘNG: chờ game dựng xong -> dựng bản đồ cứ điểm -> vào trận thử nghiệm
  // ---------------------------------------------------------------------------
  function boot() {
    const g = window.game;
    if (!g || !g.terrain || !g.matchmaking || typeof Strongholds === 'undefined') { setTimeout(boot, 60); return; }
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME; mm.mapSeed = SEED; mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    clearInterval(mm.searchInterval);
    g.prepareMap(BIOME, SEED);
    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');
    mm.selectedTankType = tankType;
    g.startMatchWithSlots([{ id: 0, team: 'BLUE', title: 'THỬ NGHIỆM', name: 'XE THỬ NGHIỆM', isHuman: true, isMe: true, peerId: 'lab-me', tankType, ready: true }], 'lab-me');
    setup(g);
  }

  function setup(g) {
    lab.g = g;
    const set = g.terrain.strongholdSet;
    if (!set) { console.warn('Bản đồ không có cứ điểm'); return; }
    const K = id => set.items.find(k => k.id === id);
    // Luật trận thường không áp dụng trong phòng thử
    g.matchDuration = 1e9;
    lab.zoneUpdate = g.zone.update.bind(g.zone);
    lab.zone = false;
    g.zone.update = function (dt, units, ox, oz) { if (lab.zone) lab.zoneUpdate(dt, units, ox, oz); };
    g.airdropTimer = 1e9;
    if (g.supplyManager) g.supplyManager.airdropTimer = 1e9;
    g.respawnWaitPenalty = 3;
    const cpm = g.capturePointsManager;
    if (cpm) {
      (cpm.points || []).forEach(cp => cp.group && cp.group.parent && cp.group.parent.remove(cp.group));
      cpm.points = [];
      if (cpm.updateCapturePointsUI) try { cpm.updateCapturePointsUI(); } catch (e) { /* bỏ qua */ }
    }
    // Hồi sinh tại chỗ đứng của phòng thử (không về căn cứ)
    g.updateRespawnQueue = function (dt) {
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const it = this.respawnQueue[i];
        if (lab.keepWreck && !it.unit.isPlayer) continue;   // giữ xác xe mục tiêu để thử hiệu ứng xác
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

    // Xe mục tiêu: 2 xe trong khoang B, 2 xe trong khoang C, quay mặt ra cửa phía A / phía B
    const S = Strongholds.S;
    const slot = (k, f, r, sg) => { const w = set.toWorld(k, f, r); const dir = { x: k.fx * sg, z: k.fz * sg }; return { x: w.x, z: w.z, a: Math.atan2(-dir.x, -dir.z), az: (deg(Math.atan2(dir.x, -dir.z)) + 360) % 360 }; };
    lab.slots = {
      A_out: slot(K('A'), -(S.END + 46), 0, 1), A_in1: slot(K('A'), 10, -S.SLOT_R, 1), A_in2: slot(K('A'), 10, S.SLOT_R, 1),
      B_out: slot(K('B'), S.END + 46, 0, -1), B_in1: slot(K('B'), 10, -S.SLOT_R, 1), B_in2: slot(K('B'), 10, 0, 1), B_in3: slot(K('B'), 10, S.SLOT_R, 1),
      C_out: slot(K('C'), -(S.END + 46), 0, 1), C_in1: slot(K('C'), 0, -S.SLOT_SPG, 1), C_in2: slot(K('C'), 0, S.SLOT_SPG, 1)
    };
    const mk = (name, s, type = 'ALL_ROUNDER') => {
      const u = new SPGUnit3D(g.scene, { name, isPlayer: false, team: 'RED', tankType: type, x: s.x, z: s.z, bodyAngle: s.a, azimuth: s.az, elevation: 0, charge: 2 });
      u.updateAI = () => {};          // đứng yên, không tự lái / tự bắn
      u._labHome = s;
      place(u, s.x, s.z, s.a, s.az);
      g.units.push(u);
      lab.dummies.push(u);
      return u;
    };
    // B: 3 xe tăng song song; C: 2 pháo tự hành 6x6 (thử sức chứa khoang)
    mk('TĂNG B-1', lab.slots.B_in1); mk('TĂNG B-2', lab.slots.B_in2); mk('TĂNG B-3', lab.slots.B_in3);
    mk('PHÁO C-1', lab.slots.C_in1, 'ARTILLERY'); mk('PHÁO C-2', lab.slots.C_in2, 'ARTILLERY');

    preparePlayer(g.player);
    // Cờ chiếm cứ điểm -> nhật ký
    set.onCapture = (k, owner, old) => {
      if (owner) addLog(`[[flag]] ${owner === 'BLUE' ? 'Phe XANH' : 'Phe ĐỎ'} đã chiếm cứ điểm ${k.id} — kéo cờ lên nắp hầm`, owner === 'BLUE' ? 'ok' : 'hit');
      else addLog(`[[flag-off]] Cứ điểm ${k.id} bị tranh chấp — cờ ${old === 'BLUE' ? 'XANH' : 'ĐỎ'} đã hạ`, 'info');
    };
    teleport('A_out');

    // Theo dõi kết quả mỗi phát trúng (bị chặn / mất máu)
    const orig = g.handleShellImpact;
    g.handleShellImpact = function (shell, hitType, target) {
      const before = this.units.map(u => u.hp);
      const exp = this.units.map(u => this.terrain.shelterFactor(u));
      orig.call(this, shell, hitType, target);
      if (shell.absorbedBy) addLog(`[[shield]] ${shell.absorbedBy.name}: bê tông chặn đạn (${ammoName(shell.ammoType)})`, 'ok');
      this.units.forEach((u, i) => {
        const d = before[i] - u.hp;
        if (d > 0.0005) addLog(`[[bomb]] ${u.name} -${d.toFixed(2)} máu · ${hitType === 'DIRECT_HIT' && u === target ? 'trúng trực tiếp' : 'sức ép nổ'} · thân lộ ${Math.round(exp[i] * 100)}%`, 'hit');
      });
    };
    const origUpdate = g.update;
    g.update = function (dt) { origUpdate.call(this, dt); tick(dt); };
    buildUI();
    rebuildOverlay();
    addLog('Lái xe vào khoang A (phía trước), thử bắn sang B ở góc chéo. Mục tiêu đứng sẵn trong B và C.', 'info');
    window.strongholdLab = lab;
  }

  function preparePlayer(u) {
    u._labAmmo = {};
    for (const k of Object.keys(u)) if (/AmmoCount$|^gatlingMag$/.test(k) && typeof u[k] === 'number') u._labAmmo[k] = u[k];
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

  function teleport(key) {
    const s = lab.slots[key], u = lab.g.player;
    if (!s || !u) return;
    if (u.isDead) u.respawn(s.x, s.z);
    u.invulnerableTimer = 0;
    place(u, s.x, s.z, s.a, s.az);
    u.elevation = 0;
    u._labHome = s;
    lab.home = key;
    if (lab.g._cam) lab.g._cam.unit = null;   // camera bám đuôi đặt lại ngay sau lưng xe ở chỗ mới
    rebuildOverlay();
  }

  function swapVehicle(type) {
    const g = lab.g, old = g.player;
    if (!old || old.tankType === type) return;
    const pos = { x: old.x, z: old.z, a: old.bodyAngle, az: old.azimuth };
    const home = old._labHome;
    const idx = g.units.indexOf(old);
    old.isDead = true;
    g.scene.remove(old.group);
    if (old.trackMarks) old.trackMarks.forEach(m => m.mesh && g.scene.remove(m.mesh));
    const u = new SPGUnit3D(g.scene, { name: 'XE THỬ NGHIỆM', isPlayer: true, team: 'BLUE', tankType: type, x: pos.x, z: pos.z, bodyAngle: pos.a, azimuth: pos.az, elevation: 0, charge: 2 });
    u.peerId = 'lab-me';
    if (idx >= 0) g.units[idx] = u; else g.units.push(u);
    g.player = u;
    g.respawnQueue = g.respawnQueue.filter(it => it.unit !== old);
    tankType = type;
    if (g.matchmaking) g.matchmaking.selectedTankType = type;
    g.lockedTarget = null;
    preparePlayer(u);
    place(u, pos.x, pos.z, pos.a, pos.az);
    u._labHome = home;
    try { g.syncHUDControls(); g.updateAmmoUI(); if (g.hud && g.hud.refresh) g.hud.refresh(); } catch (e) { /* bỏ qua */ }
    rebuildOverlay();
    renderUI();
    renderFxParts();
    addLog(`Đổi xe: ${TYPES.find(t => t[0] === type)[1]}`, 'info');
  }

  // ---------------------------------------------------------------------------
  // THỬ HIỆU ỨNG: bắn thử mọi loại đạn, phá bộ phận, phá hủy / hồi phục xe — qua đúng luồng xử lý của game
  // ---------------------------------------------------------------------------
  function fxTargetUnit() {
    return lab.fxTarget === 'me' ? lab.g.player : lab.dummies[lab.fxTarget];
  }

  // Xe "bắn" vào mục tiêu: mục tiêu là xe địch -> xe mình bắn; mục tiêu là xe mình -> một xe địch bắn
  function fxShooter(t) {
    const g = lab.g;
    return t === g.player ? (lab.dummies.find(d => !d.isDead) || lab.dummies[0]) : g.player;
  }

  // Một phát đạn chạm mục tiêu (near: nổ trên mặt đất sát bên). Bỏ qua mái che cứ điểm để luôn thấy hiệu ứng trúng xe.
  function strike(t, ammo, near = false, jitter = 0) {
    const g = lab.g;
    if (!g || !t || t.isDead && !near) return;
    const heavy = ammo === 'HE155';
    const type = heavy ? 'HE' : ammo;
    const src = fxShooter(t);
    let hx = t.x - (src && src !== t ? src.x : t.x - 300), hz = t.z - (src && src !== t ? src.z : t.z);
    const L = Math.hypot(hx, hz) || 1;
    hx /= L; hz /= L;
    const plunge = heavy || type === 'CLUSTER_SUBMUNITION';
    const dir = plunge ? new THREE.Vector3(hx * 0.4, -0.92, hz * 0.4).normalize() : new THREE.Vector3(hx, -0.06, hz).normalize();
    const j = () => (Math.random() - 0.5) * 2 * jitter;
    let x = t.x + j(), z = t.z + j(), y = (t.y || 0) + 9 + j() * 0.5;
    let hitType = 'DIRECT_HIT', target = t;
    if (near) {
      const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 18;
      x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
      y = g.terrain.getElevationAt(x, z);
      hitType = 'GROUND'; target = null;
    }
    const speed = 900;
    const shell = {
      x, y, z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, ammoType: type, isHeavyArty: heavy,
      shooterId: src && src !== t ? src.id : undefined, shooterTeam: src && src !== t ? src.team : (t.team === 'BLUE' ? 'RED' : 'BLUE')
    };
    const T = g.terrain, so = T.shelterOf, sf = T.shelterFactor, god = lab.god;
    T.shelterOf = () => null;
    if (sf) T.shelterFactor = () => 1;
    if (t === g.player && lab.fxHurtMe) lab.god = false;
    try { g.handleShellImpact(shell, hitType, target); }
    finally { T.shelterOf = so; if (sf) T.shelterFactor = sf; lab.god = god; }
  }

  function fxFire(mode) {
    const t = fxTargetUnit();
    if (!t) return;
    const a = lab.fxAmmo;
    if (a === 'CLUSTER') {
      // Đạn chùm: bung trên không, ~14 bom con rơi rải quanh mục tiêu, quả nào rơi trúng thân xe là trúng trực tiếp
      for (let i = 0; i < 14; i++) setTimeout(() => {
        const r = Math.random() * 46;
        if (r < 10 && mode !== 'near') strike(t, 'CLUSTER_SUBMUNITION', false, 5);
        else strike(t, 'CLUSTER_SUBMUNITION', true);
      }, i * 35 + Math.random() * 30);
      return;
    }
    if (mode === 'burst') {
      const small = a === 'GATLING_BULLET' || a === 'SCOUT_BULLET' || a === 'INCENDIARY';
      const n = small ? 12 : 4, gap = small ? 45 : 380;
      for (let i = 0; i < n; i++) setTimeout(() => strike(t, a, small && Math.random() < 0.25, small ? 6 : 3), i * gap);
      return;
    }
    // phát đơn cũng tản mát quanh tâm xe (trước đây tia đạn cố định -> phát nào cũng chui đúng một lỗ)
    strike(t, a, mode === 'near', mode === 'near' ? 0 : 3.5);
  }

  function fxPart(part) {
    const t = fxTargetUnit();
    if (!t || typeof VehicleDamage === 'undefined') return;
    const fx = lab.g.effectsManager && lab.g.effectsManager.fx;
    const ev = VehicleDamage.debugAction(t, part, fx) || [];
    if (!ev.length) addLog(`${t.name}: không có thay đổi`, 'info');
    ev.forEach(e => addLog(`[[tool]] ${t.name}: ${e.text}`, e.type === 'none' ? 'info' : 'hit'));
  }

  // Phá hủy xe bằng một phát lựu pháo thật (để thấy đủ cháy nổ kho đạn, tháp văng, xác xe)
  function fxDestroy() {
    const t = fxTargetUnit();
    if (!t || t.isDead) return;
    const hurt = lab.fxHurtMe;
    lab.fxHurtMe = true;
    t.invulnerableTimer = 0;
    t.hp = Math.min(t.hp, 0.05);
    strike(t, 'HE155');
    lab.fxHurtMe = hurt;
  }

  function revive(u) {
    const g = lab.g;
    g.respawnQueue = g.respawnQueue.filter(it => it.unit !== u);
    const h = u._labHome || { x: u.x, z: u.z, a: u.bodyAngle, az: u.azimuth };
    if (u.isDead) u.respawn(h.x, h.z);
    u.hp = u.maxHp; u.invulnerableTimer = 0;
    if (typeof VehicleDamage !== 'undefined') VehicleDamage.reset(u);
    place(u, h.x, h.z, h.a, h.az);
    if (u.isPlayer) { const b = document.getElementById('player-respawn-banner'); if (b) b.classList.add('hidden'); }
    g.updateAliveCount();
  }

  // ---------------------------------------------------------------------------
  // MỖI KHUNG HÌNH
  // ---------------------------------------------------------------------------
  let uiT = 0, ammoT = 0;
  function tick(dt) {
    const g = lab.g, p = g.player;
    // Nạp đầy đạn liên tục
    ammoT += dt;
    if (ammoT > 1 && p && p._labAmmo) { ammoT = 0; for (const k in p._labAmmo) if (p[k] < p._labAmmo[k]) p[k] = p._labAmmo[k]; }
    // Mục tiêu bắn trả
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
    if (lab.reveal) for (const d of lab.dummies) if (!d.isDead) { d.group.visible = true; d.isHiddenFromPlayer = false; }
    g.strongholdXray = lab.reveal;   // luôn nhìn xuyên mái hầm có mục tiêu bên trong
    // Bảng thử nghiệm ẩn khi mở bản đồ chiến thuật (không che thanh bên của bản đồ)
    if (root) root.style.display = g.tacticalMap && g.tacticalMap.isOpen ? 'none' : '';
    uiT += dt;
    if (uiT > 0.15) { uiT = 0; renderStatus(); }
  }

  // ---------------------------------------------------------------------------
  // LỚP PHỦ: vùng bảo vệ + quạt góc bắn (tính bằng nòng pháo thật của xe đang lái)
  // ---------------------------------------------------------------------------
  function barrelGeom(u) {
    // Vị trí tâm vòng tháp, độ cao nòng, chiều dài nòng (đo trên mô hình xe đang lái, tháp hướng thẳng, nòng ngang)
    const yaw = u.turretGroup.rotation.y, el = u.barrelPivot.rotation.x;
    u.turretGroup.rotation.y = 0; u.barrelPivot.rotation.x = 0;
    u.group.updateMatrixWorld(true);
    const ring = u.group.worldToLocal(u.turretGroup.getWorldPosition(new THREE.Vector3()));
    const tip = u.group.worldToLocal(u.barrelGroup.localToWorld(u.muzzleTipLocal.clone()));
    u.turretGroup.rotation.y = yaw; u.barrelPivot.rotation.x = el;
    u.group.updateMatrixWorld(true);
    return { ringFwd: -ring.z, h: tip.y, len: Math.hypot(tip.x - ring.x, tip.z - ring.z) };
  }

  function rebuildOverlay() {
    const g = lab.g;
    for (const o of lab.overlayObjs) { g.scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
    lab.overlayObjs = [];
    if (!lab.overlay || !g.player) return;
    const set = g.terrain.strongholdSet, S = Strongholds.S;
    const B = barrelGeom(g.player);
    lab.barrel = B;
    for (const K of set.items) {
      const grp = new THREE.Group();
      grp.position.set(K.x, K.G, K.z);
      grp.rotation.y = -K.angle;
      // Hộp vùng bảo vệ (dưới mái che)
      const box = new THREE.BoxGeometry(S.HB * 2, S.CEIL + S.D, S.WI * 2);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x40ff90, transparent: true, opacity: 0.9, depthTest: false }));
      edges.position.y = (S.CEIL - S.D) / 2;
      edges.renderOrder = 10;
      grp.add(edges);
      const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x30ff80, transparent: true, opacity: 0.06, depthWrite: false, depthTest: false }));
      fill.position.y = edges.position.y;
      fill.renderOrder = 9;
      grp.add(fill);
      // Quạt góc bắn tại 2 chỗ đứng, nhìn ra cả 2 cửa
      for (const r of [-S.SLOT_R, 0, S.SLOT_R]) for (const sg of [1, -1]) {
        const fan = fanFor(set, K, 10 * sg, r, sg, B);
        if (fan) grp.add(fan);
      }
      g.scene.add(grp);
      lab.overlayObjs.push(grp);
    }
  }

  function fanFor(set, K, f0, r0, sg, B) {
    // Tâm vòng tháp của xe đứng ở (f0, r0) quay mặt về hướng sg
    const cf = f0 + sg * B.ringFwd, cr = r0;
    const clear = [];
    for (let a = -176; a <= 176; a += 2) {
      const ar = a * Math.PI / 180;
      const df = Math.cos(ar) * sg, dr = Math.sin(ar);
      const w0 = set.toWorld(K, cf, cr), w1 = set.toWorld(K, cf + df * B.len, cr + dr * B.len);
      const y = K.G - Strongholds.S.D + B.h;
      clear.push(!set.barrelBlocked({ x: w0.x, y, z: w0.z }, { x: w1.x, y, z: w1.z }) ? ar : null);
    }
    const pos = [];
    const R = 340, yy = -Strongholds.S.D + B.h;
    for (let i = 0; i < clear.length - 1; i++) {
      if (clear[i] === null || clear[i + 1] === null) continue;
      const a0 = clear[i], a1 = clear[i + 1];
      pos.push(cf, yy, cr, cf + Math.cos(a0) * sg * R, yy, cr + Math.sin(a0) * R, cf + Math.cos(a1) * sg * R, yy, cr + Math.sin(a1) * R);
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const col = sg > 0 ? (r0 < 0 ? 0xffc040 : r0 > 0 ? 0xff8030 : 0xffe070) : (r0 < 0 ? 0x40c0ff : r0 > 0 ? 0x4080ff : 0x70e0ff);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    m.renderOrder = 8;
    return m;
  }

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  function ammoName(a) { return ({ NORMAL: 'đạn thường', AP: 'xuyên giáp', HE: 'nổ mạnh', GATLING_BULLET: '30mm', SCOUT_BULLET: '12.7mm', INCENDIARY: 'đạn cháy', RPG: 'tên lửa', ANTI_TANK_MISSILE: 'tên lửa', CLUSTER: 'đạn chùm', CLUSTER_SUBMUNITION: 'bom con' })[a] || a; }
  function addLog(text, kind) {
    const last = lab.log[0];
    if (last && last.text === text) { last.n++; last.t = performance.now(); }
    else lab.log.unshift({ text, kind, n: 1, t: performance.now() });
    lab.log.length = Math.min(lab.log.length, 9);
    renderLog();
  }

  let root = null;
  function buildUI() {
    const css = document.createElement('style');
    // Cùng phong cách bàn tác chiến của sảnh: màu lấy từ theme.css, góc hổ phách, mục đánh số
    css.textContent = `
      #sh-lab{position:fixed;top:72px;right:14px;width:318px;z-index:9000;display:flex;flex-direction:column;
        max-height:calc(100vh - 90px);font:12px/1.35 var(--font-tech);color:var(--tc-text);user-select:none;
        background:var(--tc-panel);border:1px solid var(--tc-line);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 10px 40px rgba(0,0,0,.5)}
      #sh-lab::before,#sh-lab::after{content:'';position:absolute;width:14px;height:14px;pointer-events:none;border:0 solid var(--tc-accent);opacity:.85}
      #sh-lab::before{top:-1px;left:-1px;border-width:2px 0 0 2px}#sh-lab::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
      #sh-lab .shl-head{flex-shrink:0;padding:10px 12px 9px;border-bottom:1px solid var(--tc-line)}
      #sh-lab .shl-brand{display:flex;align-items:center;gap:9px}
      #sh-lab .shl-brand>.ti{font-size:22px;color:var(--tc-accent);filter:drop-shadow(0 0 6px rgba(231,166,58,.35))}
      #sh-lab h1{margin:0;font-size:14px;font-weight:700;letter-spacing:2px;color:var(--tc-bright)}
      #sh-lab .shl-sub{font-size:10.5px;color:var(--tc-dim)}
      #sh-lab .shl-sub .ti{color:var(--tc-ok);font-size:9px}
      #sh-lab nav{display:flex;gap:4px;margin-top:8px}
      #sh-lab nav a{flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 5px;font-size:11px;font-weight:600;letter-spacing:.6px;white-space:nowrap;
        color:var(--tc-dim);text-decoration:none;border:1px solid var(--tc-line);background:rgba(200,210,192,.03)}
      #sh-lab nav a:hover{color:var(--tc-text);border-color:var(--tc-line-2)}
      #sh-lab nav a.home{flex:0 0 28px}
      #sh-lab nav a.on{color:var(--tc-accent-2);border-color:var(--tc-accent);background:var(--tc-accent-soft);pointer-events:none}
      #sh-lab .shl-scroll{flex:1;min-height:0;overflow:auto;padding:2px 12px 12px}
      #sh-lab h3{display:flex;align-items:center;gap:7px;margin:12px 0 6px;padding-bottom:5px;border-bottom:1px dashed var(--tc-line);
        font-size:12px;font-weight:700;letter-spacing:1.6px;color:var(--tc-bright)}
      #sh-lab h3 .n{font:11px var(--font-mono);color:#0a0d0c;background:var(--tc-accent);padding:0 5px;letter-spacing:1px}
      #sh-lab .row{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 6px}
      #sh-lab button{flex:1 1 auto;min-width:60px;padding:5px 6px;cursor:pointer;font:600 11.5px/1.3 var(--font-tech);
        color:var(--tc-text);background:rgba(200,210,192,.04);border:1px solid var(--tc-line);transition:color .15s,border-color .15s,background .15s}
      #sh-lab button:hover{border-color:var(--tc-line-2);background:rgba(200,210,192,.08)}
      #sh-lab button.on{color:var(--tc-accent-2);border-color:var(--tc-accent);background:var(--tc-accent-soft)}
      #sh-lab .lbl{margin-top:6px;font-size:10.5px;font-weight:600;color:var(--tc-dim);text-transform:uppercase;letter-spacing:1.1px}
      #sh-lab .st{margin:3px 0 6px;padding:6px 8px;white-space:pre-line;font-size:11.5px;background:rgba(0,0,0,.22);border:1px solid var(--tc-line)}
      #sh-lab .safe{color:var(--tc-ok)}#sh-lab .warn{color:var(--tc-accent-2)}#sh-lab .bad{color:var(--tc-red)}
      #sh-lab .log{max-height:130px;overflow:auto;font:10.5px/1.45 var(--font-mono)}
      #sh-lab .log div{padding:2px 0;border-bottom:1px solid var(--tc-line)}
      #sh-lab .log .ok{color:var(--tc-ok)}#sh-lab .log .hit{color:#f0b48a}#sh-lab .log .info{color:var(--tc-dim)}
      #sh-lab .hp{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:11px}
      #sh-lab .hp i{flex:1;height:5px;background:rgba(200,210,192,.1);overflow:hidden}
      #sh-lab .hp b{display:block;height:100%;background:var(--tc-red)}
      #sh-lab .hp span{font-family:var(--font-mono);font-size:10.5px}
      #sh-lab .hp span:first-child{font-family:var(--font-tech);font-size:11px}
      #sh-lab .help{margin-top:8px;color:var(--tc-dim);font-size:11px;line-height:1.6}
      #sh-lab kbd{font:10px var(--font-mono);color:var(--tc-text);padding:0 4px;border:1px solid var(--tc-line-2);border-bottom-width:2px;background:rgba(200,210,192,.06)}
      #sh-lab select{width:100%;padding:5px 6px;font:600 11.5px var(--font-tech);color:var(--tc-text);background:var(--tc-bg-2);border:1px solid var(--tc-line-2);outline:none}
      #sh-lab select:focus{border-color:var(--tc-accent)}
      #sh-lab button.fx-go{color:#0a0d0c;background:var(--tc-accent);border-color:var(--tc-accent)}#sh-lab button.fx-go:hover{background:var(--tc-accent-2)}
      #sh-lab button.fx-bad{color:var(--tc-red);border-color:rgba(224,103,92,.4)}#sh-lab button.fx-bad:hover{border-color:var(--tc-red);background:rgba(224,103,92,.1)}
      #sh-lab #shl-fx-ammo button,#sh-lab #shl-fx-parts button{min-width:52px;padding:4px 5px;font-size:11px}`;
    document.head.appendChild(css);
    root = document.createElement('div');
    root.id = 'sh-lab';
    root.addEventListener('keydown', e => e.stopPropagation());
    // Không giữ focus trên nút (Space để bắn sẽ không bấm lại nút)
    root.addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });
    document.body.appendChild(root);
    root.innerHTML = `
      <div class="shl-head">
        <div class="shl-brand"><i class="ti ti-flag" aria-hidden="true"></i><div>
          <h1>THỬ CỨ ĐIỂM A · B · C</h1>
          <div class="shl-sub"><i class="ti ti-point-filled" aria-hidden="true"></i> Lái xe thật, thử che chắn, chiếm cờ và trúng đạn</div>
        </div></div>
        <nav>
          <a class="home" href="index.html" title="Về sảnh chờ"><i class="ti ti-arrow-left" aria-hidden="true"></i></a>
          <a href="fx_lab.html"><i class="ti ti-bomb" aria-hidden="true"></i> Đạn &amp; nổ</a>
          <a href="vehicle_fx_lab.html"><i class="ti ti-tank" aria-hidden="true"></i> Xe</a>
          <a class="on" href="index.html?lab=stronghold"><i class="ti ti-flag" aria-hidden="true"></i> Cứ điểm</a>
        </nav>
      </div>
      <div class="shl-scroll">
      <h3><span class="n">01</span> XE &amp; VỊ TRÍ</h3>
      <div class="lbl">Loại xe</div><div class="row" id="shl-types"></div>
      <div class="lbl">Dịch chuyển</div>
      <div class="row">
        <button data-tp="A_out">Ngoài A</button><button data-tp="A_in1">Trong A (trái)</button><button data-tp="A_in2">Trong A (phải)</button>
        <button data-tp="B_out">Ngoài B</button><button data-tp="B_in1">Trong B</button>
        <button data-tp="C_out">Ngoài C</button><button data-tp="C_in1">Trong C</button>
      </div>
      <div class="lbl">Tùy chọn</div>
      <div class="row">
        <button id="shl-fire">Mục tiêu bắn trả</button><button id="shl-god">Bất tử</button>
        <button id="shl-ov">Vùng bảo vệ & góc bắn</button><button id="shl-reveal">Luôn hiện mục tiêu</button><button id="shl-zone">Bo thu hẹp</button><button id="shl-revive">Hồi sinh mục tiêu</button>
      </div>
      <h3><span class="n">02</span> THỬ HIỆU ỨNG</h3>
      <div class="lbl">Mục tiêu</div>
      <div class="row"><select id="shl-fx-target"></select></div>
      <div class="lbl">Loại đạn</div><div class="row" id="shl-fx-ammo"></div>
      <div class="row">
        <button id="shl-fx-hit" class="fx-go">Bắn trúng</button><button id="shl-fx-near">Nổ sát bên</button><button id="shl-fx-burst">Bắn loạt</button>
      </div>
      <div class="lbl">Phá bộ phận</div><div class="row" id="shl-fx-parts"></div>
      <div class="row">
        <button id="shl-fx-kill" class="fx-bad">Phá hủy xe</button><button id="shl-fx-fix">Hồi phục xe</button><button id="shl-wreck">Giữ xác xe</button>
      </div>
      <h3><span class="n">03</span> BẢN ĐỒ &amp; TRẠNG THÁI</h3>
      <div class="lbl">Bản đồ</div>
      <div class="row"><select id="shl-map"></select></div>
      <div class="lbl">Trạng thái xe</div><div class="st" id="shl-st"></div>
      <div class="lbl">Cờ cứ điểm</div><div id="shl-cap"></div>
      <div class="lbl">Mục tiêu</div><div id="shl-hp"></div>
      <div class="lbl">Nhật ký trúng đạn</div><div class="log" id="shl-log"></div>
      <div class="help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> lái · <kbd>Chuột</kbd> ngắm xe địch / mặt đất · <kbd>Tab</kbd> khóa địch · <kbd>Space</kbd> bắn · <kbd>Mũi tên</kbd> xoay tháp · <kbd>1-3</kbd> đổi đạn · <kbd>Shift</kbd> tăng tốc<br>
      Khung xanh = vùng mái che (xe nằm trọn bên trong không mất máu). Quạt màu = góc nòng quét được không chạm tường.</div>
      </div>`;
    const types = root.querySelector('#shl-types');
    for (const [id, name, sub] of TYPES) {
      const b = document.createElement('button');
      b.dataset.type = id; b.title = sub; b.textContent = name;
      b.onclick = () => swapVehicle(id);
      types.appendChild(b);
    }
    root.querySelectorAll('[data-tp]').forEach(b => { b.onclick = () => teleport(b.dataset.tp); });
    root.querySelector('#shl-fire').onclick = () => { lab.fireBack = !lab.fireBack; renderUI(); addLog(lab.fireBack ? 'Mục tiêu bắt đầu bắn trả xe bạn' : 'Mục tiêu ngừng bắn', 'info'); };
    root.querySelector('#shl-god').onclick = () => { lab.god = !lab.god; renderUI(); };
    root.querySelector('#shl-reveal').onclick = () => { lab.reveal = !lab.reveal; renderUI(); };
    root.querySelector('#shl-zone').onclick = () => { lab.zone = !lab.zone; renderUI(); addLog(lab.zone ? 'Bật bo: vòng an toàn co dần về quanh 3 cứ điểm (pha chờ 80 s)' : 'Tắt bo', 'info'); };
    root.querySelector('#shl-ov').onclick = () => { lab.overlay = !lab.overlay; rebuildOverlay(); renderUI(); };
    root.querySelector('#shl-revive').onclick = () => {
      for (const d of lab.dummies) revive(d);
      addLog('Đã hồi phục toàn bộ mục tiêu', 'info');
    };
    // Thử hiệu ứng
    const tSel = root.querySelector('#shl-fx-target');
    lab.dummies.forEach((d, i) => { const o = document.createElement('option'); o.value = i; o.textContent = d.name; tSel.appendChild(o); });
    const me = document.createElement('option'); me.value = 'me'; me.textContent = 'XE CỦA TÔI (nghe / thấy từ trong xe)'; tSel.appendChild(me);
    tSel.onchange = () => { lab.fxTarget = tSel.value === 'me' ? 'me' : +tSel.value; renderFxParts(); };
    const ammoRow = root.querySelector('#shl-fx-ammo');
    for (const [id, name] of FX_AMMO) {
      const b = document.createElement('button');
      b.dataset.fxAmmo = id; b.textContent = name;
      b.onclick = () => { lab.fxAmmo = id; renderUI(); };
      ammoRow.appendChild(b);
    }
    root.querySelector('#shl-fx-hit').onclick = () => fxFire('hit');
    root.querySelector('#shl-fx-near').onclick = () => fxFire('near');
    root.querySelector('#shl-fx-burst').onclick = () => fxFire('burst');
    root.querySelector('#shl-fx-parts').onclick = e => { const b = e.target.closest('button'); if (b) fxPart(b.dataset.part); };
    root.querySelector('#shl-fx-kill').onclick = fxDestroy;
    root.querySelector('#shl-fx-fix').onclick = () => { const t = fxTargetUnit(); if (t) { revive(t); addLog(`Đã hồi phục ${t.name}`, 'info'); } };
    root.querySelector('#shl-wreck').onclick = () => { lab.keepWreck = !lab.keepWreck; renderUI(); addLog(lab.keepWreck ? 'Giữ xác xe mục tiêu (không tự hồi sinh)' : 'Xe mục tiêu tự hồi sinh sau 3 s', 'info'); };
    renderFxParts();
    const sel = root.querySelector('#shl-map');
    for (const [id, name] of MAPS) { const o = document.createElement('option'); o.value = id; o.textContent = name; if (id === BIOME) o.selected = true; sel.appendChild(o); }
    sel.onchange = () => { const u = new URL(location.href); u.searchParams.set('map', sel.value); u.searchParams.set('tank', tankType); location.href = u.toString(); };
    // Âm thanh cần thao tác người dùng để khởi động
    const unlock = () => { try { if (window.soundEngine && window.soundEngine.init) window.soundEngine.init(); } catch (e) { /* bỏ qua */ } window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    renderUI();
  }

  function renderUI() {
    if (!root) return;
    root.querySelectorAll('#shl-types button').forEach(b => b.classList.toggle('on', b.dataset.type === tankType));
    root.querySelector('#shl-fire').classList.toggle('on', lab.fireBack);
    root.querySelector('#shl-god').classList.toggle('on', lab.god);
    root.querySelector('#shl-ov').classList.toggle('on', lab.overlay);
    root.querySelector('#shl-reveal').classList.toggle('on', lab.reveal);
    root.querySelector('#shl-zone').classList.toggle('on', lab.zone);
    root.querySelectorAll('#shl-fx-ammo button').forEach(b => b.classList.toggle('on', b.dataset.fxAmmo === lab.fxAmmo));
    root.querySelector('#shl-wreck').classList.toggle('on', lab.keepWreck);
  }

  // Nút phá bộ phận theo loại xe của mục tiêu đang chọn
  function renderFxParts() {
    if (!root) return;
    const t = fxTargetUnit();
    const list = (PART_ACTIONS[t ? t.tankType : 'ALL_ROUNDER'] || []).concat([['dent', 'Móp vỏ'], ['wreck', 'Bắn vào xác']]);
    root.querySelector('#shl-fx-parts').innerHTML = list.map(([k, n]) => `<button data-part="${k}">${n}</button>`).join('');
  }

  function renderStatus() {
    if (!root) return;
    const g = lab.g, p = g.player, t = g.terrain;
    const st = root.querySelector('#shl-st');
    if (p) {
      const K = t.shelterOf(p);
      const e = t.strongholdSet.exposure(p);
      const info = t.getTerrainInfoAt(p.x, p.z, 0);
      let line;
      if (!K) line = `<span class="bad">Ngoài cứ điểm — không được che chắn</span>`;
      else if (e < 0.04) line = `<span class="safe">Nằm trọn trong khoang ${K.id} — bê tông chặn mọi đạn</span>`;
      else line = `<span class="warn">Thò ra ngoài mái che ${Math.round(e * 100)}% — phần lộ bị bắn mất máu</span>`;
      const hp = `${p.hp.toFixed(2)} / ${p.maxHp}`;
      const barrel = p.barrelBlockedNow ? `<span class="warn">Nòng chạm bê tông / ụ đất — tháp dừng ở mép</span>` : 'Nòng tự do';
      st.innerHTML = `${line}\nMặt đường: ${info.name}\nMáu: ${hp}${lab.god ? ' (bất tử)' : ''}\n${barrel}`;
    }
    const capEl = root.querySelector('#shl-cap');
    capEl.innerHTML = t.strongholdSet.items.map(k => {
      const c = k.capture || 0, col = c > 0 ? 'var(--tc-blue)' : 'var(--tc-red)';
      const who = k.owner === 'BLUE' ? 'XANH giữ' : k.owner === 'RED' ? 'ĐỎ giữ' : (k.contested ? 'tranh chấp' : 'trung lập');
      return `<div class="hp"><span style="width:92px">Cứ điểm ${k.id}</span><i><b style="width:${Math.abs(c)}%;background:${col}"></b></i><span style="width:78px;text-align:right">${who}</span></div>`;
    }).join('');
    const hpEl = root.querySelector('#shl-hp');
    hpEl.innerHTML = lab.dummies.map(d => {
      const e = t.strongholdSet.exposure(d);
      return `<div class="hp"><span style="width:92px">${d.name}</span><i><b style="width:${Math.max(0, d.hp / d.maxHp * 100)}%"></b></i><span style="width:44px;text-align:right">${d.isDead ? '<i class="ti ti-skull" aria-hidden="true"></i>' : d.hp.toFixed(2)}</span><span style="width:34px;text-align:right;color:var(--tc-dim)">${Math.round(e * 100)}%</span></div>`;
    }).join('');
  }

  function renderLog() {
    if (!root) return;
    root.querySelector('#shl-log').innerHTML = lab.log.map(l => `<div class="${l.kind}">${UIIcons.html(l.text)}${l.n > 1 ? ` ×${l.n}` : ''}</div>`).join('');
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
