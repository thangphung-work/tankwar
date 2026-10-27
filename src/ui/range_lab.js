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
 * - ĐỒNG TRỐNG (mặc định): san phẳng một vùng tròn bán kính 1 km (không cây / nhà / đá), chỉ có xe bạn + 1 xe bia;
 *   chọn loại xe bia, trang bị bia, cự ly và hướng bia (mũi / chéo / sườn / đuôi). Bố trí LÀNG: 4 bia quanh làng như cũ
 *
 * Tham số URL: map=HIGHLAND|RIVER_LAKE|JUNGLE|DESERT|URBAN, seed=<số>, tank=ALL_ROUNDER|GATLING|ARTILLERY|SCOUT,
 *   field=flat|village
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('lab') !== 'range') return;
  window.RANGE_LAB = true;
  // Chơi độc lập: không vào sảnh mạng
  try { window.NetTransport = undefined; } catch (e) { /* bỏ qua */ }

  const MAPS = [['HIGHLAND', 'Đồng cỏ'], ['RIVER_LAKE', 'Sông hồ'], ['JUNGLE', 'Rừng'], ['DESERT', 'Sa mạc'], ['URBAN', 'Đô thị']];
  const TYPES = [['ALL_ROUNDER', 'HALBERD MK.3'], ['GATLING', 'HAILSTORM R6'], ['ARTILLERY', 'ARBALEST 155'], ['SCOUT', 'MARTEN R4']];
  // vào từ thanh chuyển lab (không kèm ?map=): dùng lại bản đồ đã chọn lần trước
  let lsMap = null;
  try { lsMap = localStorage.getItem('rg-map'); } catch (e) { /* bỏ qua */ }
  let BIOME = (q.get('map') || lsMap || 'HIGHLAND').toUpperCase();
  if (!MAPS.some(m => m[0] === BIOME)) BIOME = 'HIGHLAND';
  const SEED = (parseInt(q.get('seed'), 10) || 20261022) >>> 0;
  let tankType = (q.get('tank') || 'ALL_ROUNDER').toUpperCase();
  if (!TYPES.some(t => t[0] === tankType)) tankType = 'ALL_ROUNDER';
  // Bố trí bãi thử: 'flat' = đồng trống san phẳng + 1 bia, 'village' = 4 bia quanh làng
  let lsField = null;
  try { lsField = localStorage.getItem('rg-field'); } catch (e) { /* bỏ qua */ }
  const FIELD = (q.get('field') || lsField || 'flat') === 'village' ? 'village' : 'flat';
  // phải bật trước khi game sinh bản đồ (map_gen.js nạp trước file này, game.js nạp sau)
  if (window.MapGen && MapGen.setTestField) MapGen.setTestField(FIELD === 'flat');
  // Không dựng bản đồ đồng bộ ngay trong constructor game: thao tác đó chặn main thread nên
  // spinner cũng đứng im. boot() sinh dữ liệu map trong Worker trước, rồi mới dựng mesh.
  window.BOOT_MAP = null;

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
    if (window.rangeLabLoaderMarkup) el.style.overflow = 'hidden';
    el.innerHTML = window.rangeLabLoaderMarkup ? window.rangeLabLoaderMarkup('ĐANG KHỞI ĐỘNG…') : '<style>@keyframes rlspin{to{transform:rotate(360deg)}}</style>'
      + '<div style="width:46px;height:46px;border-radius:50%;border:3px solid rgba(214,226,200,.18);border-top-color:#ffb700;animation:rlspin .8s linear infinite"></div>'
      + '<div style="font-size:18px;color:#ffb700">THAO TRƯỜNG DIỄN TẬP</div><div id="range-lab-stage">ĐANG KHỞI ĐỘNG…</div>';
    (document.body || document.documentElement).appendChild(el);
    return {
      stage(t) { const s = document.getElementById('range-lab-stage'); if (s) s.textContent = t; },
      done() {
        // chờ 2 khung hình để cảnh đầu tiên đã vẽ xong rồi mới mờ màn chờ
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }));
      }
    };
  })();

  const lab = { g: null, dummies: [], home: null, village: null, field: FIELD, spots: [], dummyType: FIELD === 'flat' ? 'ALL_ROUNDER' : null,
    dummyKit: { m: [], p: [], a: {} }, dist: q.get('ew') === '1' ? 1300 : 400, face: 0, god: true, fireBack: false, fireMode: 'off', keepWreck: false, dummyJam: false, log: [], hits: [], kit: null, kamis: [], kamiOn: true, kamiSky: [], kamiT: 2, kamiKills: 0 };
  // Vũ khí bia bắn trả: [mã, tên]
  const FIRE_MODES = [['off', 'Tắt'], ['ap', 'Pháo AP'], ['heat', 'Pháo nổ lõm'], ['rpg', 'RPG'], ['atgm', 'Tên lửa'], ['top', 'Tên lửa đỉnh'],
    ['mg', 'Súng 12.7'], ['agl', 'Lựu 40mm'], ['kami', 'UAV cảm tử']];
  const ARMOR_SETS = [['Không giáp', []], ['ERA + lồng thép', ['era', 'slat']], ['Tấm ghép + APS', ['applique', 'spall', 'aps']]];
  // Đồng trống: cự ly bia (m) · hướng bia so với xe bạn (rad quay thân: 0 = mũi xe hướng về bạn)
  const DISTS = [100, 200, 400, 700, 1000, 1400];
  const FACES = [[0, 'Mũi'], [Math.PI / 4, 'Chéo 45°'], [Math.PI / 2, 'Sườn'], [Math.PI, 'Đuôi']];
  const typeName = t => (TYPES.find(x => x[0] === t) || [t, t])[1];
  const deg = r => r * 180 / Math.PI;

  // ---------------------------------------------------------------------------
  // KHỞI ĐỘNG: chờ game dựng xong -> dựng bản đồ -> vào trận thử
  // ---------------------------------------------------------------------------
  let bootWait = 0;
  function boot() {
    const g = window.game;
    if (!g || !g.terrain || !g.matchmaking) {
      // khởi tạo game lỗi (Console có "Lỗi khi khởi động") thì đợi mãi vô ích: báo ngay trên màn chờ
      if ((bootWait += 60) > 30000 && !window._labBootErr) { window._labBootErr = true; loader.stage('KHÔNG KHỞI ĐỘNG ĐƯỢC — xem Console (F12)'); }
      setTimeout(boot, 60); return;
    }
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME; mm.mapSeed = SEED; mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    clearInterval(mm.searchInterval);
    loader.stage('ĐANG SINH ĐỊA HÌNH NỀN…');
    // MapGen chạy trong Worker để animation loading và giao diện không bị treo. Nếu trình
    // duyệt không hỗ trợ Worker, prepareMap bên dưới tự rơi về đường đồng bộ cũ.
    const prep = window.MapGen && MapGen.prefetch ? MapGen.prefetch(BIOME, SEED) : Promise.resolve(false);
    prep.catch(() => false).then(() => {
      loader.stage('ĐANG DỰNG CẢNH 3D…');
      requestAnimationFrame(() => setTimeout(() => start(g, mm), 20));
    });
  }

  function start(g, mm) {
    try { startInner(g, mm); } catch (err) {
      console.error('[LAB] Lỗi dựng phòng thử:', err);
      loader.stage('LỖI: ' + (err && err.message || err) + ' — xem Console (F12)');
    }
  }

  function startInner(g, mm) {
    const t0 = performance.now();
    g.prepareMap(BIOME, SEED);
    console.info(`[BOOT] prepareMap: ${Math.round(performance.now() - t0)} ms`);
    // Chờ chi tiết bản đồ dựng xong dưới nền (từng bước nhỏ, giữa các bước trình duyệt vẫn vẽ màn chờ). Vào trận ngay
    // thì startMatchWithSlots phải dựng nốt đồng bộ -> chặn luồng chính ~17 s, spinner đứng im
    const T = g.terrain;
    const waitDetails = () => {
      if (T && !T.detailsReady && g.terrain === T) {
        const left = T._pendingDetailSteps ? T._pendingDetailSteps.length : 0;
        loader.stage('ĐANG DỰNG CẢNH 3D…' + (left ? ' (' + left + ')' : ''));
        setTimeout(waitDetails, 60);
        return;
      }
      console.info(`[BOOT] Chi tiết bản đồ: ${Math.round(performance.now() - t0)} ms`);
      try { enterMatch(g, mm, t0); } catch (err) {
        console.error('[LAB] Lỗi dựng phòng thử:', err);
        loader.stage('LỖI: ' + (err && err.message || err) + ' — xem Console (F12)');
      }
    };
    waitDetails();
  }

  function enterMatch(g, mm, t0) {
    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');
    mm.selectedTankType = tankType;
    if (mm.music) mm.music('battle');
    g.startMatchWithSlots([{ id: 0, team: 'BLUE', title: 'THỬ ĐẠN', name: 'XE THỬ ĐẠN', isHuman: true, isMe: true, peerId: 'lab-me', tankType, ready: true }], 'lab-me');
    g._intro = null;   // bỏ đoạn camera lượn quanh căn cứ 6 s lúc mở màn: vào thẳng sau lưng xe
    const introHud = document.getElementById('tactical-intro-hud');
    if (introHud) introHud.classList.add('hidden');
    document.body.classList.remove('intro-active');
    console.info(`[BOOT] Vào trận (startMatchWithSlots): ${Math.round(performance.now() - t0)} ms`);
    setup(g);
    console.info(`[BOOT] Dựng phòng thử xong: ${Math.round(performance.now() - t0)} ms · tổng từ lúc mở trang ${Math.round(performance.now())} ms`);
  }

  function setup(g) {
    lab.g = g;
    // Luật trận thường không áp dụng trong phòng thử
    g.matchDuration = 1e9;
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
    syncUrl();
    if (lab.field === 'flat') addLog('[[square]] Đồng trống: chọn xe bia, cự ly, hướng và trang bị bia ở bảng bên phải', 'info');
    addLog('[[flag]] Căn cứ A, B, C đã có sẵn trên bản đồ — bấm Căn cứ A/B/C để dịch chuyển tới', 'ok');
    // Biên dịch shader của cả cảnh song song trên GPU (trước đây dồn hết vào khung hình đầu: ~50 s đứng hình)
    const firstFrame = () => {
      const tf = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        console.info(`[BOOT] Khung hình đầu: ${Math.round(performance.now() - tf)} ms · tổng từ lúc mở trang ${Math.round(performance.now())} ms`);
        loader.done();
      }));
    };
    if (!g.compileShadersAsync) { firstFrame(); return; }
    const tc = performance.now();
    loader.stage('ĐANG BIÊN DỊCH SHADER…');
    // cả shader hiệu ứng giao tranh (vết đạn, sóng nổ, lửa đầu nòng): không để phát bắn đầu tiên phải biên dịch
    g.prewarmEffects(true, (done, total) => loader.stage(`ĐANG BIÊN DỊCH SHADER… ${done}/${total}`))
      .catch(err => console.warn('[LAB] compileShadersAsync', err))
      .then(n => { console.info(`[BOOT] Biên dịch ${n || 0} shader song song: ${Math.round(performance.now() - tc)} ms`); firstFrame(); });
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

  
  // ---------------------------------------------------------------------------
  // CỌC MỐC CỰ LY TRƯỜNG BẮN (100M, 200M, 400M, 700M, 1000M, 1400M)
  // ---------------------------------------------------------------------------
  function decorateRangeBattlefield(g) {
    if (lab.field !== 'flat' || !lab.home || !lab.fieldDir) return;

    if (lab.decorationsGroup) {
      if (lab.decorationsGroup.parent) lab.decorationsGroup.parent.remove(lab.decorationsGroup);
      lab.decorationsGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }

    const grp = new THREE.Group();
    grp.name = 'range-decorations';
    g.scene.add(grp);
    lab.decorationsGroup = grp;

    const h = lab.home, dir = lab.fieldDir;
    const side = { x: -dir.z, z: dir.x };
    const T = g.terrain;
    const getGround = (x, z) => (T.getElevationAt ? T.getElevationAt(x, z) : 0);

    // Cọc mốc cự ly tác xạ đặt bên lề trái đường bắn
    const markerDists = [100, 200, 400, 700, 1000, 1400];
    markerDists.forEach(d => {
      const mx = h.x + dir.x * d + side.x * -24;
      const mz = h.z + dir.z * d + side.z * -24;
      const my = getGround(mx, mz);

      const mGroup = new THREE.Group();
      mGroup.position.set(mx, my, mz);
      mGroup.rotation.y = Math.atan2(dir.x, dir.z);

      // Cột thép vàng cảnh báo
      const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 5.2, 12);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xd4a337, roughness: 0.4, metalness: 0.6 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 2.6;
      mGroup.add(pole);

      // Bảng chữ số cự ly
      const cvs = document.createElement('canvas');
      cvs.width = 256; cvs.height = 128;
      const ctx = cvs.getContext('2d');
      ctx.fillStyle = '#111812';
      ctx.fillRect(0, 0, 256, 128);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#eab308';
      ctx.strokeRect(5, 5, 246, 118);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 54px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d + ' M', 128, 64);

      const boardTex = new THREE.CanvasTexture(cvs);
      const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.35, metalness: 0.3 });
      const boardGeo = new THREE.BoxGeometry(4.8, 2.4, 0.25);
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.position.set(0, 4.4, 0);
      mGroup.add(board);

      // Chóp nón phản quang
      const capGeo = new THREE.ConeGeometry(0.35, 0.6, 8);
      const capMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 5.4;
      mGroup.add(cap);

      grp.add(mGroup);
    });
  }

  function placeAll() {
    const g = lab.g, F = lab.field === 'flat' && g.terrain.map && g.terrain.map.testField;
    if (lab.field === 'flat' && !F) { lab.field = 'village'; lab.dummyType = null; }
    if (F) {
      // ĐỒNG TRỐNG: xe bạn ở mép vùng phẳng, bia phía trước theo hướng về giữa bản đồ (nền xa có núi đồi)
      const L = Math.hypot(F.x, F.z) || 1, ux = -F.x / L, uz = -F.z / L;
      const sx = F.x - ux * 720, sz = F.z - uz * 720;
      lab.fieldDir = { x: ux, z: uz };
      lab.home = { x: sx, z: sz, a: Math.atan2(-ux, -uz), az: (deg(Math.atan2(ux, -uz)) + 360) % 360 };
      lab.village = null;
      teleport();
      spawnDummies();
      decorateRangeBattlefield(g);
      return;
    }
    const V = lab.village = findVillage();
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
    const D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
    // ?ew=1: thử máy phá sóng — chỉ 1 xe tăng địch (tự bật phá sóng khi drone mình bay tới gần, ew_jammer.js)
    if (q.get('ew') === '1') lab.dummyJam = true;
    const plan = q.get('ew') === '1' ? [[1300, 0, 'ALL_ROUNDER']]
      : [[220, -0.18, 'ALL_ROUNDER'], [D - 90, 0.12, 'GATLING'], [D + 40, -0.06, 'ALL_ROUNDER'], [D + 170, 0.2, 'ARTILLERY']];
    lab.spots = [];
    plan.forEach(([r0, off, type]) => {
      let p = null;
      for (let k = 0; k < 160 && !p; k++) {
        const r = r0 + (k % 5) * 22 - 44, o = off + (Math.floor(k / 5) % 2 ? 1 : -1) * Math.floor(k / 10) * 0.05;
        const c = Math.cos(o), s = Math.sin(o), vx = ux * c - uz * s, vz = ux * s + uz * c;
        const x = spawn.x + vx * r, z = spawn.z + vz * r;
        if (openSpot(x, z, k < 80 ? 22 : 10, k >= 80)) p = { x, z };
      }
      if (p) lab.spots.push({ x: p.x, z: p.z, type });
    });
    spawnDummies();
  }

  // Dựng lại xe bia theo lựa chọn hiện tại (loại xe, trang bị, cự ly, hướng) — xe bạn đứng yên chỗ cũ
  function spawnDummies() {
    const g = lab.g, h = lab.home;
    for (const d of lab.dummies) {
      d.isDead = true;
      if (d.group && d.group.parent) d.group.parent.remove(d.group);
      if (d.trackMarks) d.trackMarks.forEach(m => m.mesh && g.scene.remove(m.mesh));
    }
    g.units = g.units.filter(u => !lab.dummies.includes(u));
    g.respawnQueue = (g.respawnQueue || []).filter(it => !lab.dummies.includes(it.unit));
    if (g.lockedTarget && lab.dummies.includes(g.lockedTarget)) g.lockedTarget = null;
    lab.dummies = [];
    if (!h) return;
    const spots = lab.field === 'flat' && lab.fieldDir
      ? [{ x: h.x + lab.fieldDir.x * lab.dist, z: h.z + lab.fieldDir.z * lab.dist, type: 'ALL_ROUNDER' }]
      : lab.spots;
    spots.forEach((p, i) => {
      const type = lab.dummyType || p.type;
      const tx = h.x - p.x, tz = h.z - p.z, a = Math.atan2(-tx, -tz) + lab.face;
      // tháp quay theo thân (azimuth theo hướng thế giới: az = -bodyAngle)
      mkDummy(`MỤC TIÊU ${i + 1} · ${typeName(type)}`, { x: p.x, z: p.z, a, az: ((deg(-a) % 360) + 360) % 360 }, type);
    });
    if (g.updateAliveCount) g.updateAliveCount();
    renderStatus();
  }

  function mkDummy(name, s, type) {
    const g = lab.g;
    const u = new SPGUnit3D(g.scene, { name, isPlayer: false, team: 'RED', tankType: type, x: s.x, z: s.z, bodyAngle: s.a, azimuth: s.az, elevation: 0, charge: 2 });
    u.updateAI = () => {};          // đứng yên, không tự lái / tự bắn
    u._labHome = s;
    u._noJam = !lab.dummyJam;       // xe tăng bia: máy phá sóng tự bật khi drone mình bay tới gần (ew_jammer.js)
    // trang bị bia (bảng TRANG BỊ BIA): món nào không hợp loại xe thì bỏ qua
    if (typeof Equipment !== 'undefined') {
      try { Equipment.equip(u, Equipment.sanitize(lab.dummyKit, type), null); } catch (e) { console.warn('[LAB] trang bị bia', e); }
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
    if (lab.field === 'flat') spawnDummies();
  }

  function gotoStronghold(id) {
    const g = lab.g, T = g && g.terrain, set = T && T.strongholdSet;
    if (!set || !set.items || !set.items.length) {
      addLog('[[alert]] Căn cứ đang được dựng trên bản đồ…', 'hit');
      return;
    }
    const K = set.items.find(k => k.id === id);
    if (!K) {
      addLog(`[[alert]] Không tìm thấy căn cứ ${id}`, 'hit');
      return;
    }
    const S = typeof Strongholds !== 'undefined' ? Strongholds.S : { END: 206 };
    const sign = (id === 'B') ? 1 : -1;
    const dist = (S.END || 206) + 45;
    const tx = K.x + K.fx * sign * dist;
    const tz = K.z + K.fz * sign * dist;
    const dx = K.x - tx, dz = K.z - tz;
    const bodyA = Math.atan2(-dx, -dz);
    const az = (deg(Math.atan2(dx, -dz)) + 360) % 360;

    const P = g.player;
    if (P) {
      if (P.isDead) P.respawn(tx, tz);
      P.invulnerableTimer = 0;
      place(P, tx, tz, bodyA, az);
      P.elevation = 0;
      if (g.setSightMode && g._sight) g.setSightMode(false);
      if (g._cam) g._cam.unit = null;
      addLog(`[[flag]] Đã tới trước cửa căn cứ ${id}`, 'ok');
    }

    if (lab.dummies && lab.dummies[0]) {
      const d = lab.dummies[0];
      const inW = set.toWorld ? set.toWorld(K, 15, 0) : { x: K.x + K.fx * 15, z: K.z + K.fz * 15 };
      const dFace = Math.atan2(tx - inW.x, tz - inW.z);
      const dAz = (deg(Math.atan2(inW.x - tx, inW.z - tz)) + 360) % 360;
      if (d.isDead) revive(d);
      place(d, inW.x, inW.z, dFace, dAz);
    }
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
      decorateRangeBattlefield(g);
      if (g._cam) g._cam.unit = null;
      addLog('[[check]] Đã dựng lại bản đồ', 'ok');
    }, 60);
  }

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set('lab', 'range'); u.searchParams.set('map', BIOME); u.searchParams.set('tank', tankType); u.searchParams.set('field', FIELD);
    history.replaceState(null, '', u.toString());
  }

  // ---------------------------------------------------------------------------
  // MỖI KHUNG HÌNH
  // ---------------------------------------------------------------------------
  let uiT = 0;
  // Phòng thử: đạn đặc biệt / tên lửa trừ bình thường như trong trận; loại nào bắn hết thì sau AMMO_REFILL_S giây
  // kho tự nạp đầy lại (trạm súng nóc tự thay hộp theo cơ chế riêng của nó)
  const AMMO_KEYS = ['apAmmoCount', 'heAmmoCount', 'clusterAmmoCount', 'incendiaryAmmoCount', 'heFragAmmoCount', 'missileAmmoCount', 'specialAmmoCount'];
  const AMMO_REFILL_S = 4;
  function refillAmmo(u, dt) {
    if (!u || u.isDead) return;
    if (!u._labAmmoFull) { u._labAmmoFull = {}; u._labAmmoWait = {}; }
    let changed = false;
    for (const k of AMMO_KEYS) {
      if (u[k] === undefined) continue;
      // lần đầu: chốt mốc đầy (tối thiểu vài phát để thử mọi loại) và nạp ngay, không báo
      if (u._labAmmoFull[k] === undefined) { u._labAmmoFull[k] = Math.max(u[k], k === 'incendiaryAmmoCount' || k === 'heFragAmmoCount' ? 80 : 3); u[k] = u._labAmmoFull[k]; changed = true; }
      if (u[k] > 0) { u._labAmmoWait[k] = 0; continue; }
      if (!u._labAmmoWait[k]) addLog(`[[hourglass]] Hết đạn — tự nạp lại sau ${AMMO_REFILL_S} s`, 'info');
      u._labAmmoWait[k] = (u._labAmmoWait[k] || 0) + dt;
      if (u._labAmmoWait[k] >= AMMO_REFILL_S) { u[k] = u._labAmmoFull[k]; u._labAmmoWait[k] = 0; changed = true; }
    }
    // bệ tên lửa đột nóc (trận thật: 2 quả mỗi lần xuất kích, không nạp): phóng hết và quả cuối đã nổ thì lắp ống mới
    const R = u._rcws, A = u.roofWeapon === 'atgm' && typeof DroneAir !== 'undefined' ? DroneAir.C.ROOF.atgm : null;
    if (A && R && R.mag <= 0 && !(u.missileInFlight && u.missileInFlight())) {
      if (!u._labAmmoWait.atgm) addLog(`[[hourglass]] Hết tên lửa đột nóc — tự lắp ống mới sau ${AMMO_REFILL_S} s`, 'info');
      u._labAmmoWait.atgm = (u._labAmmoWait.atgm || 0) + dt;
      if (u._labAmmoWait.atgm >= AMMO_REFILL_S) { R.mag = A.mag; u._labAmmoWait.atgm = 0; changed = true; }
    }
    if (changed) { const g = lab.g; try { g.updateAmmoUI(); } catch (e) { /* bỏ qua */ } }
  }

  function tick(dt) {
    const g = lab.g, p = g.player;
    refillAmmo(p, dt);
    if (lab.rangeProps) lab.rangeProps.update(dt, g.effectsManager && g.effectsManager.fx, g.camera);
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
    if (tankOnly && !lab.dummies.some(d => !d.isDead && d.tankType === 'ALL_ROUNDER')) tankOnly = false;   // không có bia xe tăng: bia nào cũng bắn
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
      // máy gây nhiễu của xe mình (vùng nhiễu vô hướng ew_jammer.js OMNI_R): UAV trong vùng ~0,7 s là mất điều khiển, chao lệch
      // khỏi xe rồi cắm xuống đất bên cạnh
      const OR = typeof EWJammer !== 'undefined' ? EWJammer.C.OMNI_R : 0;
      if (!K.miss && OR && g.jamOmniHits && g.jamOmniHits(p, K.d, K) && (K.jam = (K.jam || 0) + dt) >= 0.7) {
        const a = Math.atan2(K.x - p.x, K.z - p.z) + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.5), r = 70 + Math.random() * 40;
        K.miss = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
        addLog('[[antenna-bars-off]] Máy gây nhiễu của xe bạn cắt liên lạc UAV cảm tử — UAV chao lệch, đâm xuống bên cạnh!', 'hit');
      }
      const tX = K.miss ? K.miss.x : p.x, tZ = K.miss ? K.miss.z : p.z;
      const ty = K.miss ? g.terrain.getElevationAt(tX, tZ) - 4 : (p.y || 0) + 9, dx = tX - K.x, dz = tZ - K.z, hd = Math.hypot(dx, dz);
      const dive = hd < 160;
      K.v = Math.min(dive ? 420 : 160, K.v + dt * (dive ? 400 : 60));
      const wantY = dive ? ty : Math.max(ty + 45, g.terrain.getElevationAt(K.x, K.z) + 40);
      const dy = wantY - K.y, L = Math.hypot(dx, dy, dz) || 1;
      K.vx = dx / L * K.v; K.vy = dy / L * K.v; K.vz = dz / L * K.v;
      K.x += K.vx * dt; K.y += K.vy * dt; K.z += K.vz * dt;
      // hệ thống đánh chặn (APS) của xe mình bắn hạ UAV khi lao vào vùng chặn
      if (g.apsVsKami && g.apsVsKami(K, K.d, dt)) {
        if (g.kamiAirBurst) g.kamiAirBurst(K.d.team, K.x, K.y, K.z, K.vx, K.vy, K.vz, Math.atan2(-dx, -dz), false);
        addLog('[[shield-bolt]] APS của xe bạn đã bắn hạ UAV cảm tử của bia!', 'hit');
        g.scene.remove(K.m);
        lab.kamis.splice(i, 1);
        continue;
      }
      K.m.position.set(K.x, K.y, K.z);
      K.m.rotation.set(dive ? -0.9 : -0.1, Math.atan2(-dx, -dz), 0);
      KamiUAV.animate(K.m, dt, 1, 1);
      if (Math.hypot(p.x - K.x, ty - K.y, p.z - K.z) < 10 || K.y < g.terrain.getElevationAt(K.x, K.z) + 1) {
        // đầu nổ kích hoạt ngay chỗ UAV chạm, theo hướng đang lao (cùng luật UAV cảm tử của người chơi — kamikaze_uav.js)
        KamiUAV.fireWarhead(B, K.d, new THREE.Vector3(K.x, K.y, K.z), new THREE.Vector3(dx / L, dy / L, dz / L));
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
  // Lắp / tháo một món trong bộ đồ `kit` của xe `type` -> bộ đồ mới đã lọc hợp lệ
  function toggleIn(kit, id, type) {
    const Eq = Equipment, k = JSON.parse(JSON.stringify(kit || { m: [], p: [], a: {} }));
    k.m = k.m || []; k.p = k.p || [];
    if (Eq.PREMIUM[id]) {
      k.p = k.p.includes(id) ? k.p.filter(x => x !== id) : k.p.concat(id);
    } else {
      const M = Eq.MODULES[id];
      if (!M) return null;
      if (k.m.includes(id)) k.m = k.m.filter(x => x !== id);
      else {
        if ((Eq.MOUNT_CATS || []).includes(M.cat)) k.m = k.m.filter(x => !(Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat));
        const C = Eq.CATS[M.cat];
        const same = k.m.filter(x => Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat);
        if (C && same.length >= C.slots) k.m = k.m.filter(x => x !== same[0]);   // nhóm đủ ô: thay món lắp sớm nhất
        k.m.push(id);
      }
    }
    return Eq.sanitize(k, type);
  }
  const itemName = id => (Equipment.MODULES[id] || Equipment.PREMIUM[id]).name;
  const kitHas = (k, id) => k.m.includes(id) || k.p.includes(id);
  function toggleItem(id) {
    const type = lab.g.player.tankType, k = toggleIn(curKit(), id, type);
    if (!k) return;
    lab.kit = k;
    rebuildPlayer(type);
    addLog(`[[tool]] Thử: ${itemName(id)} ${kitHas(lab.kit, id) ? 'đã lắp' : 'đã tháo'}`, 'info');
  }
  // Trang bị bia: lắp theo loại xe bia đang chọn (bố trí làng, xe bia hỗn hợp: theo xe tăng; món không hợp xe nào thì xe đó bỏ qua)
  const dummyKitType = () => lab.dummyType || 'ALL_ROUNDER';
  function toggleDummyItem(id) {
    const k = toggleIn(lab.dummyKit, id, dummyKitType());
    if (!k) return;
    lab.dummyKit = k;
    spawnDummies();
    renderUI();
    addLog(`[[shield]] Bia: ${itemName(id)} ${kitHas(k, id) ? 'đã lắp' : 'đã tháo'}`, 'info');
  }
  // Bảng nút trang bị (mọi nhóm + đạn cao cấp) cho xe `type` với bộ đồ `k`
  function kitGrid(type, k) {
    const Eq = Equipment;
    k = k || { m: [], p: [] };
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
    return h;
  }
  function renderKit() {
    const el = root && root.querySelector('#rg-kit'), P = lab.g && lab.g.player;
    if (!el || !P || typeof Equipment === 'undefined') return;
    el.innerHTML = kitGrid(P.tankType, P.kit);
  }
  function renderDummyKit() {
    const el = root && root.querySelector('#rg-dkit');
    if (!el || typeof Equipment === 'undefined') return;
    const t = dummyKitType();
    el.innerHTML = (lab.dummyType ? '' : `<div class="kc" style="color:var(--tc-text)">Chọn theo ${typeName(t)} — xe bia khác loại chỉ lắp món hợp với nó</div>`)
      + kitGrid(t, Equipment.sanitize(lab.dummyKit, t));
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
      #rg-lab nav{display:flex;flex-wrap:wrap;gap:3px;padding:7px 12px 8px;border-bottom:1px solid var(--tc-line)}
      #rg-lab nav a{flex:1 1 22%;display:flex;align-items:center;justify-content:center;gap:3px;padding:4px 3px;font-size:10.5px;font-weight:600;letter-spacing:.3px;white-space:nowrap;
        color:var(--tc-dim);text-decoration:none;border:1px solid var(--tc-line);background:rgba(200,210,192,.03)}
      #rg-lab nav a:hover{color:var(--tc-text);border-color:var(--tc-line-2)}
      #rg-lab nav a.home{flex:0 0 26px}
      #rg-lab nav a.on{color:var(--tc-accent-2);border-color:var(--tc-accent);background:var(--tc-accent-soft);pointer-events:none}
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
      #rg-lab #rg-kit button,#rg-lab #rg-dkit button,#rg-lab #rg-fm button,#rg-lab #rg-dist button,#rg-lab #rg-face button,#rg-lab #rg-dtypes button,#rg-lab #rg-da button{min-width:0;font-size:10.5px;padding:4px 5px}
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
      <div class="rg-head"><i class="ti ti-target-arrow" aria-hidden="true"></i><div><h1>THAO TRƯỜNG DIỄN TẬP</h1>
        <div class="rg-sub">Lái & bắn như trong trận — <kbd>Ctrl</kbd> kính ngắm</div></div></div>
      <nav>
        <a class="home" href="index.html" title="Về sảnh chờ"><i class="ti ti-arrow-left" aria-hidden="true"></i></a>
        <a href="labs.html" title="Danh sách mọi phòng thử"><i class="ti ti-layout-grid" aria-hidden="true"></i> Tất cả</a>
        <a href="fx_lab.html"><i class="ti ti-bomb" aria-hidden="true"></i> Đạn &amp; nổ</a>
        <a href="vehicle_fx_lab.html"><i class="ti ti-tank" aria-hidden="true"></i> Xe</a>
        <a href="test_car.html"><i class="ti ti-car" aria-hidden="true"></i> Ô tô</a>
        <a href="drone_lab.html"><i class="ti ti-drone" aria-hidden="true"></i> Drone</a>
        <a href="index.html?lab=stronghold"><i class="ti ti-flag" aria-hidden="true"></i> Cứ điểm</a>
        <a class="on" href="index.html?lab=range"><i class="ti ti-target-arrow" aria-hidden="true"></i> Bắn thử</a>
      </nav>
      <div class="rg-body">
        <div class="lbl">XE CỦA BẠN</div><div class="row" id="rg-types"></div>
        <div class="lbl">BẢN ĐỒ</div><div class="row" id="rg-maps"></div>
        <div class="lbl">THỜI TIẾT</div><div class="row" id="rg-wx"></div>
        <div class="lbl">BỐ TRÍ</div><div class="row" id="rg-field"></div>
        <div class="lbl">XE BIA</div><div class="row" id="rg-dtypes"></div>
        <div id="rg-flatopts">
          <div class="lbl">CỰ LY BIA</div><div class="row" id="rg-dist"></div>
        </div>
        <div class="lbl">HƯỚNG BIA</div><div class="row" id="rg-face"></div>
        <details id="rg-dkitbox"><summary class="lbl">TRANG BỊ BIA <span style="font-weight:400">▾</span></summary>
          <div class="row" id="rg-da"></div>
          <div id="rg-dkit"></div></details>
        <div class="lbl">BÃI THỬ</div>
        <div class="row">
          <button id="rg-home"><i class="ti ti-home" aria-hidden="true"></i> Về chỗ xuất phát</button>
          <button id="rg-sh-a" title="Tới căn cứ A"><i class="ti ti-flag" aria-hidden="true"></i> Căn cứ A</button>
          <button id="rg-sh-b" title="Tới căn cứ B"><i class="ti ti-flag" aria-hidden="true"></i> Căn cứ B</button>
          <button id="rg-sh-c" title="Tới căn cứ C"><i class="ti ti-flag" aria-hidden="true"></i> Căn cứ C</button>
          <button id="rg-revive"><i class="ti ti-heart-plus" aria-hidden="true"></i> Hồi sinh mục tiêu</button>
          <button id="rg-god">Bất tử</button><button id="rg-wreck">Giữ xác mục tiêu</button>
          <button id="rg-jam" title="Xe tăng bia tự phá sóng drone của bạn khi bay tới gần"><i class="ti ti-antenna-bars-5" aria-hidden="true"></i> Bia phá sóng drone</button>
          <button id="rg-kamisky" title="UAV cảm tử địch bay lượn ngẫu nhiên trên trời, liên tục có chiếc mới bay vào — thử bắn hạ"><i class="ti ti-rocket" aria-hidden="true"></i> UAV cảm tử bay</button>
          <button id="rg-repair"><i class="ti ti-tool" aria-hidden="true"></i> Sửa xe</button>
          <button id="rg-rebuild" class="go"><i class="ti ti-refresh" aria-hidden="true"></i> Dựng lại bản đồ</button>
        </div>
        <div class="lbl">BIA BẮN TRẢ XE BẠN</div><div class="row" id="rg-fm"></div>
        <details id="rg-kitbox" open><summary class="lbl">TRANG BỊ THỬ <span style="font-weight:400">(miễn phí, không lưu) ▾</span></summary>
          <div class="row"><button id="rg-kit-reset"><i class="ti ti-user" aria-hidden="true"></i> Về bộ đồ tài khoản</button></div>
          <div id="rg-kit"></div></details>
        <div class="lbl">PHÁT TRÚNG</div><div class="hits" id="rg-hits"></div>
        <div class="lbl">MỤC TIÊU</div><div class="tg" id="rg-tg"></div>
        <div class="log" id="rg-log"></div>
      </div>`;
    const types = root.querySelector('#rg-types');
    for (const [id, name] of TYPES) { const b = document.createElement('button'); b.dataset.type = id; b.textContent = name; b.onclick = () => swapVehicle(id); types.appendChild(b); }
    // thời tiết theo hạt giống bản đồ (Weather.forMap): đổi = chọn hạt giống khớp ý rồi tải lại trang
    const wx = root.querySelector('#rg-wx'), WX = typeof Weather !== 'undefined' ? Weather : null;
    const rainNow = !!(WX && WX.forMap(BIOME, SEED).rain);
    for (const [id, name, icon] of [['clear', 'Nắng', 'sun'], ['rain', 'Mưa giông', 'cloud-storm']]) {
      const b = document.createElement('button'); b.innerHTML = `<i class="ti ti-${icon}" aria-hidden="true"></i> ${name}`;
      if ((id === 'rain') === rainNow) b.classList.add('on');
      b.onclick = () => {
        if (!WX || (id === 'rain') === rainNow) return;
        const u = new URL(location.href); u.searchParams.set('seed', WX.seedFor(BIOME, id)); u.searchParams.set('map', BIOME); u.searchParams.set('tank', tankType); location.href = u.toString();
      };
      wx.appendChild(b);
    }
    const maps = root.querySelector('#rg-maps');
    for (const [id, name] of MAPS) {
      const b = document.createElement('button'); b.dataset.map = id; b.textContent = name;
      b.onclick = () => { if (id === BIOME) return; try { localStorage.setItem('rg-map', id); } catch (e) { /* bỏ qua */ } const u = new URL(location.href); u.searchParams.set('map', id); u.searchParams.set('tank', tankType); location.href = u.toString(); };
      maps.appendChild(b);
    }
    root.querySelector('#rg-home').onclick = () => { teleport(); addLog('Về chỗ xuất phát', 'info'); };
    root.querySelector('#rg-sh-a').onclick = () => gotoStronghold('A');
    root.querySelector('#rg-sh-b').onclick = () => gotoStronghold('B');
    root.querySelector('#rg-sh-c').onclick = () => gotoStronghold('C');
    root.querySelector('#rg-revive').onclick = () => { for (const d of lab.dummies) revive(d); addLog('[[heart-plus]] Đã hồi sinh mục tiêu', 'ok'); };
    const fm = root.querySelector('#rg-fm');
    for (const [id, name] of FIRE_MODES) {
      const b = document.createElement('button'); b.dataset.fm = id; b.textContent = name;
      b.onclick = () => { lab.fireMode = id; lab._fbT = 0.8; lab._burst = 0; renderUI(); if (id !== 'off') addLog(`[[target-arrow]] Bia bắn trả bằng: ${name}`, 'hit'); };
      fm.appendChild(b);
    }
    // BỐ TRÍ: đổi phải sinh lại bản đồ (đồng trống san phẳng địa hình) -> tải lại trang
    const fld = root.querySelector('#rg-field');
    for (const [id, name, ic] of [['flat', 'Đồng trống · 1 bia', 'square'], ['village', 'Làng · 4 bia', 'building-community']]) {
      const b = document.createElement('button'); b.dataset.field = id; b.innerHTML = `<i class="ti ti-${ic}" aria-hidden="true"></i> ${name}`;
      b.onclick = () => {
        if (id === FIELD) return;
        try { localStorage.setItem('rg-field', id); } catch (e) { /* bỏ qua */ }
        const u = new URL(location.href); u.searchParams.set('field', id); u.searchParams.set('map', BIOME); u.searchParams.set('tank', tankType); location.href = u.toString();
      };
      fld.appendChild(b);
    }
    const dts = root.querySelector('#rg-dtypes');
    for (const [id, name] of (lab.field === 'flat' ? [] : [[null, 'Hỗn hợp']]).concat(TYPES)) {
      const b = document.createElement('button'); b.dataset.dtype = id || ''; b.textContent = name;
      b.onclick = () => {
        if (lab.dummyType === id) return;
        lab.dummyType = id;
        spawnDummies(); renderUI(); renderDummyKit();
        addLog(`[[tank]] Xe bia: ${name}`, 'info');
      };
      dts.appendChild(b);
    }
    const dist = root.querySelector('#rg-dist');
    for (const m of DISTS) {
      const b = document.createElement('button'); b.dataset.dist = m; b.textContent = m + ' m';
      b.onclick = () => { if (lab.dist === m) return; lab.dist = m; spawnDummies(); renderUI(); addLog(`[[ruler-measure]] Cự ly bia: ${m} m`, 'info'); };
      dist.appendChild(b);
    }
    const face = root.querySelector('#rg-face');
    FACES.forEach(([rad, name], i) => {
      const b = document.createElement('button'); b.dataset.face = i; b.textContent = name;
      b.onclick = () => { if (lab.face === rad) return; lab.face = rad; spawnDummies(); renderUI(); addLog(`[[rotate]] Bia quay ${name.toLowerCase()} về phía bạn`, 'info'); };
      face.appendChild(b);
    });
    const da = root.querySelector('#rg-da');
    ARMOR_SETS.forEach(([name, set]) => {
      const b = document.createElement('button'); b.textContent = name;
      b.onclick = () => { lab.dummyKit = { m: set.slice(), p: [], a: {} }; spawnDummies(); renderUI(); renderDummyKit(); addLog(`[[shield]] Bia: ${name}`, 'info'); };
      da.appendChild(b);
    });
    root.querySelector('#rg-dkit').addEventListener('click', e => { const b = e.target.closest('[data-kit]'); if (b) { toggleDummyItem(b.dataset.kit); renderDummyKit(); } });
    renderDummyKit();
    root.querySelector('#rg-repair').onclick = repairPlayer;
    root.querySelector('#rg-kit-reset').onclick = () => { lab.kit = null; rebuildPlayer(lab.g.player.tankType); addLog('[[user]] Về bộ đồ tài khoản', 'info'); };
    root.querySelector('#rg-kit').addEventListener('click', e => { const b = e.target.closest('[data-kit]'); if (b) toggleItem(b.dataset.kit); });
    renderKit();
    renderHits();
    root.querySelector('#rg-god').onclick = () => { lab.god = !lab.god; renderUI(); };
    root.querySelector('#rg-wreck').onclick = () => { lab.keepWreck = !lab.keepWreck; renderUI(); };
    root.querySelector('#rg-jam').onclick = () => {
      lab.dummyJam = !lab.dummyJam;
      for (const d of lab.dummies) d._noJam = !lab.dummyJam;
      renderUI();
      addLog(lab.dummyJam ? '[[antenna-bars-5]] Bia phá sóng drone: BẬT' : '[[antenna-bars-off]] Bia phá sóng drone: TẮT — bay drone thoải mái', 'info');
    };
    root.querySelector('#rg-kamisky').onclick = () => {
      lab.kamiOn = !lab.kamiOn; lab.kamiT = 1;
      renderUI();
      addLog(lab.kamiOn ? '[[rocket]] UAV cảm tử bay ngẫu nhiên: BẬT — liên tục có chiếc mới bay vào' : '[[rocket]] UAV cảm tử bay ngẫu nhiên: TẮT', 'info');
    };
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
      const R = { key: 'lab' + i, lab: true, team: 'RED', state: 'flying', hp: 1, net: false, seen: true,
        x, z, y: g.terrain.getElevationAt(x, z) + 200 + Math.random() * 250, yaw: Math.random() * 6.28,
        wvx: 0, wvy: 0, wvz: 0, model: null, cx, cz, wp: null, sp: 60 + Math.random() * 90, alt: 0 };
      R.onHit = (dmg, shooter) => labDroneDamage(g, R, dmg, shooter);
      lab.uavs.push(R);
    }
    const origOther = g.updateOtherDrones;
    g.updateOtherDrones = function (dt, list) {
      origOther.call(this, dt, list);
      for (const R of lab.uavs) if (R.hp > 0) { flyUAV(this, R, dt); list.push(R); }
      kamiSkyTick(this, dt, list);
    };
    // trúng đạn: drone_air.onDroneShot tính sát thương như trong trận rồi gọi R.onHit (labDroneDamage) — không trừ thêm ở
    // đây (trước đây bọc onDroneShot trừ lần nữa: mỗi phát trúng mất gấp đôi thân)
    addLog(`[[drone]] ${UAV_N} UAV địch đang bay trên trời — nhấp vào drone để khóa, giữ Space xả đạn`, 'info');
  }

  // drone bia trúng đạn / sóng nổ: trừ thân, hết thì hạ — drone 4 cánh rơi cháy, UAV cảm tử nổ nhỏ trên trời
  function labDroneDamage(g, dr, dmg, shooter) {
    if (!dr || dr.hp <= 0 || !(dmg > 0)) return;
    dr.hp -= dmg;
    if (g.player && shooter === g.player) g._droneHitMark = 0.35;
    if (dr.hp > 0) return;
    if (dr.model && dr.model.parent) dr.model.parent.remove(dr.model);
    if (g._airAim && g._airAim.dr === dr) g._airAim = null;
    if (dr.kami) {
      if (g.kamiAirBurst) g.kamiAirBurst(dr.team, dr.x, dr.y, dr.z, dr.wvx, dr.wvy, dr.wvz, dr.yaw, false);
      lab.kamiKills++;
      addLog(`[[rocket]] Đã bắn hạ UAV cảm tử · tổng ${lab.kamiKills}`, 'ok');
      return;
    }
    g.startDroneFall(dr.team, dr.x, dr.y, dr.z, dr.wvx, dr.wvz, dr.yaw, false);
    const left = lab.uavs.filter(u => u.hp > 0).length;
    addLog(`[[drone-off]] Đã bắn rơi UAV · còn ${left}/${UAV_N}`, 'ok');
  }

  // ---------------------------------------------------------------------------
  // UAV CẢM TỬ BAY NGẪU NHIÊN (nút "UAV cảm tử bay"): cánh cố định, động cơ tên lửa (vệt khói), bay nhanh lượn quanh bãi thử
  // ở nhiều độ cao; luôn giữ tối đa KAMI_SKY.max chiếc, cứ vài giây lại có chiếc mới bay vào; hết nhiên liệu thì bay khỏi
  // bãi. Bắn hạ (súng phòng không / súng máy / sóng nổ) thì nổ nhỏ trên trời — kamikaze_uav.js kamiAirBurst
  // ---------------------------------------------------------------------------
  const KAMI_SKY = { max: 5, every: 3, life: [35, 55] };
  const KAMI_OWNER = { uavKind: 'kami', isDead: false, team: 'RED', name: 'UAV CẢM TỬ' };   // radar bắt xa hơn (airDetectMul)
  function kamiSkyTick(g, dt, list) {
    const L = lab.kamiSky, p = g.player;
    for (let i = L.length - 1; i >= 0; i--) {
      const R = L[i];
      const gone = R.hp <= 0 || !lab.kamiOn || !p || (R.exit && Math.hypot(R.x - p.x, R.z - p.z) > 2600);
      if (gone) {
        if (R.model && R.model.parent) R.model.parent.remove(R.model);
        if (g._airAim && g._airAim.dr === R) g._airAim = null;
        L.splice(i, 1);
        continue;
      }
      flyKami(g, R, dt);
      list.push(R);
    }
    if (!lab.kamiOn || !p || typeof KamiUAV === 'undefined') return;
    if (L.length >= KAMI_SKY.max) { lab.kamiT = Math.max(lab.kamiT, 1.2); return; }
    if ((lab.kamiT -= dt) > 0) return;
    lab.kamiT = KAMI_SKY.every * (0.6 + Math.random() * 0.8);
    // bay vào từ ngoài rìa bãi thử, mũi hướng về phía xe mình (lệch ngẫu nhiên)
    const a = Math.random() * Math.PI * 2, d = 1300 + Math.random() * 500;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const R = { key: 'labk' + (lab.kamiSeq = (lab.kamiSeq || 0) + 1), lab: true, kami: true, team: 'RED', owner: KAMI_OWNER,
      state: 'flying', hp: 1, net: false, seen: true, x, z, y: g.terrain.getElevationAt(x, z) + 180 + Math.random() * 300,
      yaw: Math.atan2(-(p.x - x), -(p.z - z)) + (Math.random() - 0.5) * 0.8, roll: 0, vy: 0, wvx: 0, wvy: 0, wvz: 0, model: null,
      wp: null, alt: 0, sp: 135 + Math.random() * 50, life: KAMI_SKY.life[0] + Math.random() * (KAMI_SKY.life[1] - KAMI_SKY.life[0]) };
    R.onHit = (dmg, shooter) => labDroneDamage(g, R, dmg, shooter);
    L.push(R);
  }
  function flyKami(g, R, dt) {
    const T = g.terrain, p = g.player;
    R.life -= dt;
    if (R.life <= 0 && !R.exit) {   // hết nhiên liệu bay thử: bay thẳng ra khỏi bãi
      R.exit = true;
      const a = Math.atan2(R.z - p.z, R.x - p.x);
      R.wp = { x: p.x + Math.cos(a) * 4000, z: p.z + Math.sin(a) * 4000 };
    }
    if (!R.exit && (!R.wp || Math.hypot(R.wp.x - R.x, R.wp.z - R.z) < 120)) {
      const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 1100;
      R.wp = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
      R.alt = 140 + Math.random() * 380;
      R.sp = 135 + Math.random() * 55;
    }
    let dyaw = Math.atan2(-(R.wp.x - R.x), -(R.wp.z - R.z)) - R.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    R.yaw += Math.max(-0.9 * dt, Math.min(0.9 * dt, dyaw));
    R.roll += (Math.max(-0.6, Math.min(0.6, dyaw * 1.2)) - R.roll) * (1 - Math.exp(-dt * 3));   // nghiêng cánh theo cú rẽ
    const gy = T.getElevationAt(R.x, R.z);
    R.vy = Math.max(-45, Math.min(45, (gy + (R.alt || 300) - R.y) * 0.8));
    R.x += -Math.sin(R.yaw) * R.sp * dt;
    R.z += -Math.cos(R.yaw) * R.sp * dt;
    R.y = Math.max(R.y + R.vy * dt, gy + 60);
    g.trackDroneVel(R, dt);
    if (!R.model) R.model = KamiUAV.build(R.team);
    const m = R.model;
    if (m.parent !== g.scene) g.scene.add(m);
    m.visible = true;
    m.position.set(R.x, R.y, R.z);
    m.rotation.set(Math.atan2(R.vy, R.sp), R.yaw, R.roll);
    KamiUAV.animate(m, dt, 1, 0.8);
    if (g.kamiTrailModel) g.kamiTrailModel(m, dt);
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
    root.querySelectorAll('#rg-field button').forEach(b => b.classList.toggle('on', b.dataset.field === lab.field));
    root.querySelectorAll('#rg-dtypes button').forEach(b => b.classList.toggle('on', b.dataset.dtype === (lab.dummyType || '')));
    root.querySelectorAll('#rg-dist button').forEach(b => b.classList.toggle('on', +b.dataset.dist === lab.dist));
    root.querySelectorAll('#rg-face button').forEach(b => b.classList.toggle('on', FACES[+b.dataset.face][0] === lab.face));
    root.querySelector('#rg-flatopts').style.display = lab.field === 'flat' ? '' : 'none';
    root.querySelector('#rg-god').classList.toggle('on', lab.god);
    root.querySelector('#rg-wreck').classList.toggle('on', lab.keepWreck);
    root.querySelector('#rg-jam').classList.toggle('on', lab.dummyJam);
    root.querySelector('#rg-kamisky').classList.toggle('on', lab.kamiOn);
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
