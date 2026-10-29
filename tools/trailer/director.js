/**
 * ĐẠO DIỄN TỰ ĐỘNG CHO TRAILER (tools/trailer/director.js) — chèn vào trang lúc nạp (CDP), chỉ chạy với ?lab=trailer.
 *
 * - Dựng bản đồ thật, xuất trận 10 vs 10 toàn bot; xe người chơi ẩn, bất tử, đi theo camera (để cỏ / chi tiết dựng
 *   quanh chỗ đang quay) và không nằm trong danh sách xe nên bot không nhắm vào.
 * - Theo dõi phát bắn / phát trúng / xe bị hạ; mỗi cảnh 3–7 s chọn một xe đang giao tranh và một kiểu góc máy:
 *   chase (bám đuôi), flank (đứng sát đất lia theo xe chạy qua), front (trước mũi xe), shoulder (qua vai nhìn về
 *   mục tiêu), shell (bay theo viên đạn tới chỗ nổ), wreck (vòng quanh xác xe vừa nổ), aerial (flycam trên cao).
 * - Ghi nhật ký sự kiện theo số khung (window.__TR.log) để dựng phim chọn đoạn hay.
 *
 * Tham số URL: map=..., seed=..., shots=chase,flank,... (giới hạn kiểu cảnh), focus=<id xe> (gỡ lỗi)
 */
(function () {
  if (!/[?&]lab=trailer(&|$)/.test(location.search)) return;
  const q = new URLSearchParams(location.search);
  window.FREECAM_LAB = true;
  window.BOOT_MAP = null;
  try { window.NetTransport = undefined; } catch (e) { /* bỏ qua */ }
  // đồ họa cao nhất, không tự hạ độ phân giải; âm lượng chuẩn, nhạc game tắt (nhạc trailer làm riêng)
  try {
    localStorage.setItem('spg_settings', JSON.stringify({ vol: 1, music: q.get('music') ? 1 : 0, engine: 0.8, gfx: q.get('gfx') || 'ultra', gfxUser: true, aa: true, smooth: false }));
    localStorage.setItem('spg_seen_controls', '1');
  } catch (e) { /* bỏ qua */ }

  const BIOME = (q.get('map') || 'HIGHLAND').toUpperCase();
  const SEED = (parseInt(q.get('seed'), 10) || 20261027) >>> 0;
  const SHOTS = (q.get('shots') || 'chase,low,flank,front,shoulder,shell,wreck,aerial,orbit').split(',');
  const TR = window.__TR = { state: 'boot', stage: '', log: [], shot: null, frame: 0, err: null };
  const tlog = (type, o) => { TR.log.push(Object.assign({ f: window.__TW ? __TW.frameN : 0, v: TR.vf || 0, type }, o || {})); };

  // ?music=1: không dựng bản đồ, chỉ phát chủ đề nhạc sảnh (dàn nhạc tổng hợp của game) để thu làm nhạc trailer.
  // TR.musicCue(at giây): kết bằng hồi kèn chiến thắng đúng mốc đó (đầu một câu nhạc)
  if (q.get('music')) {
    const bootMusic = () => {
      const se = window.soundEngine;
      if (!se || !se.setMusicMode) { setTimeout(bootMusic, 60); return; }
      se.init();
      se.isPageHidden = false; se.setPageHidden = function () { this.isPageHidden = false; };
      se.setUserVolume(1, 0.8);
      se.setMusicVolume(1);
      TR.musicStart = () => { se.setMusicVolume(1); se.setMusicMode('lobby'); };
      TR.musicEnd = (kind) => { se.setMusicMode(kind || 'victory'); return true; };
      TR.state = 'ready';
    };
    bootMusic();
    return;
  }

  let g = null;
  // số ngẫu nhiên riêng của đạo diễn (không đụng Math.random của game)
  let rs = (SEED ^ 0x9e3779b9) >>> 0;
  const rnd = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (k, dt) => 1 - Math.exp(-k * dt);

  // ------------------------------------------------------------------ khởi động
  function boot() {
    g = window.game;
    if (!g || !g.terrain || !g.matchmaking) { setTimeout(boot, 60); return; }
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME; mm.mapSeed = SEED; mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    mm.spawnSeed = SEED;
    clearInterval(mm.searchInterval);
    TR.stage = 'mapgen';
    const prep = window.MapGen && MapGen.prefetch ? MapGen.prefetch(BIOME, SEED) : Promise.resolve(false);
    prep.catch(() => false).then(() => { TR.stage = 'build'; requestAnimationFrame(() => setTimeout(build, 20)); });
  }

  function build() {
    try { g.prepareMap(BIOME, SEED); } catch (err) { TR.err = String(err && err.stack || err); return; }
    const T = g.terrain;
    const wait = () => {
      if (T && !T.detailsReady && g.terrain === T) {
        TR.stage = 'details ' + (T._pendingDetailSteps ? T._pendingDetailSteps.length : 0);
        setTimeout(wait, 60); return;
      }
      try { start(); } catch (err) { TR.err = String(err && err.stack || err); console.error('[TRAILER]', err); }
    };
    wait();
  }

  const TYPES = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT', 'ALL_ROUNDER', 'SCOUT', 'GATLING', 'ALL_ROUNDER', 'ARTILLERY', 'ALL_ROUNDER'];
  function start() {
    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');
    const el = document.getElementById('range-lab-loading'); if (el) el.remove();
    const PT = (q.get('ptype') || 'SCOUT').toUpperCase();
    g.matchmaking.selectedTankType = PT;
    const slots = [{ id: 0, team: 'BLUE', title: 'CAM', name: 'CAM', isHuman: true, isMe: true, peerId: 'cam-me', tankType: PT, ready: true }];
    for (let i = 0; i < 20; i++) {
      const team = i < 10 ? 'BLUE' : 'RED';
      slots.push({ id: i + 1, team, title: 'BOT', name: (team === 'BLUE' ? 'ALPHA ' : 'BRAVO ') + (i % 10 + 1), isHuman: false, isMe: false, peerId: null, botId: i + 1, tankType: TYPES[(i + (team === 'RED' ? 3 : 0)) % 10], ready: true });
    }
    // ?kami=1: cứ hai xe pháo tự hành bot thì một xe mang UAV cảm tử (còn lại drone trinh sát) -> nhiều cảnh UAV / phòng không
    if (q.get('kami') && typeof Equipment !== 'undefined' && Equipment.botKit && !Equipment.botKit.__tr) {
      const ob = Equipment.botKit; let n = 0;
      Equipment.botKit = function (tank) {
        const k = ob.apply(this, arguments);
        if (tank === 'ARTILLERY' && k && k.m && (n++ % 2 === 0)) {
          k.m = k.m.filter(id => id !== 'kami' && !(/uav|recon|drone/i.test(id)));
          k.m.push('kami'); k.a = Object.assign({}, k.a, { KAMIKAZE: 2 });
        }
        return k;
      };
      Equipment.botKit.__tr = true;
    }
    // ?nocamo=1: bot không mang lưới lá ngụy trang (xe lộ hình rõ trong cảnh giới thiệu)
    if (q.get('nocamo') && typeof Equipment !== 'undefined' && Equipment.botKit && !Equipment.botKit.__nocamo) {
      const ob = Equipment.botKit;
      Equipment.botKit = function () {
        const k = ob.apply(this, arguments);
        if (k && k.m) k.m = k.m.filter(id => id !== 'camo');
        return k;
      };
      Equipment.botKit.__nocamo = true;
    }
    // ?nosmoke=1: bot không phóng lựu đạn khói (khói mù che hết giao tranh)
    if (q.get('nosmoke')) setInterval(() => { for (const u of g.units || []) if (u.smokeLeft) u.smokeLeft = 0; }, 200);
    g.startMatchWithSlots(slots, 'cam-me');
    g._intro = null;
    document.body.classList.remove('intro-active');
    for (const id of ['tactical-intro-hud', 'hud-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    g.matchDuration = 1e9;
    g.finishMatchByTime = () => {};
    g.finishMatchByCapture = () => {};
    g.showMatchResult = () => {};
    const P = g.player;
    P.takeDamage = function () { return { blocked: false, killed: false, prevHp: this.hp, currentHp: this.hp }; };
    P.group.visible = false;
    // xe camera không phải mục tiêu: rút khỏi danh sách xe
    g.units = g.units.filter(u => u !== P);
    g.audioListener = () => g.camera.position;
    TR.gFocus = null;
    Object.defineProperty(g, '_viewFocus', { configurable: true, get() { return TR.pov ? TR._gameVF : (TR.gFocus || TR._gameVF); }, set(v) { TR._gameVF = v; } });
    // giữ far của game (9000): mù chân trời (FAR_FADE), độ hạ vòng núi skyRange và lớp mù chân núi (uHor) đều tính theo nó.
    // far 20000 -> đất cảnh nền ngoài 12 km hoà phẳng thành dải lam xám dưới chân núi, mặt nước xa thành vệt trắng
    g.camera.fov = 50; g.camera.updateProjectionMatrix();
    hookEvents();
    hookDrones();
    // một vật hỏng hình học (thiếu thuộc tính / mảng đã bỏ) làm three ném lỗi giữa lượt vẽ -> CẢ KHUNG không vẽ (màn xám).
    // Bọc từng lệnh vẽ: vật nào lỗi thì ẩn riêng nó, ghi đường dẫn để sửa gốc trong game; khung vẫn vẽ tiếp
    {
      const R = g.renderer, orb = R.renderBufferDirect;
      const pathOf = (o) => { const p = []; while (o && p.length < 7) { p.push((o.name || o.type) + (o.userData && o.userData.civMerged ? '[merged]' : '')); o = o.parent; } return p.join(' < '); };
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        try { return orb.apply(this, arguments); } catch (e) {
          if (object) object.visible = false;
          const attrs = geometry ? Object.keys(geometry.attributes || {}).map(k => k + (geometry.attributes[k] ? (geometry.attributes[k].array ? '' : '(null array)') : '(null)')).join(',') : 'no geo';
          tlog('badMesh', { path: pathOf(object), err: String(e && e.message).slice(0, 90), attrs });
          console.error('[TRAILER] ẩn vật vẽ lỗi:', pathOf(object), attrs, e && e.message);
        }
      };
    }
    // sương mù chiến tranh tính theo phe xe camera: cho xe camera biết hết -> xe địch luôn hiện, có tiếng máy
    if (typeof TeamIntel !== 'undefined' && TeamIntel.knows && !TeamIntel.knows.__tr) {
      const ok = TeamIntel.knows;
      TeamIntel.knows = function (a) { return a === g.player ? true : ok.apply(this, arguments); };
      TeamIntel.knows.__tr = true;
    }
    // âm thanh: khởi động ngay (game chờ cú bấm chuột mới bật), nhưng câm tới lúc bắt đầu ghi — nếu không, mọi tiếng
    // trong lúc chạy trước dồn hết vào mốc 0 của dải âm
    const se = window.soundEngine;
    if (se) {
      try { se.init(); } catch (e) { console.error('[TRAILER] audio init', e); }
      se.isPageHidden = false;
      se.setPageHidden = function () { this.isPageHidden = false; };
      se.isMuted = true;
    }
    // một bước khung; trả true = khung chờ (vừa cắt cảnh: cỏ / bóng / chi tiết dựng xong mới ghi) -> không chụp, câm tiếng
    TR.vf = 0; TR.holdN = 0;
    TR.step = async () => {
      const hold = TR.holdN > 0;
      if (hold) TR.holdN--;
      if (se && TR._audio) se.isMuted = hold;
      if (TR._skip0 === undefined && g.renderer && g.renderer.__asyncShaders) TR._skip0 = g.renderer.__asyncShaders.skipped();
      await __TW.frame(hold);
      if (!hold) { await settleShaders(); TR.vf++; }
      return hold;
    };
    // khung sắp chụp mà có vật bị bỏ qua vì shader chưa biên dịch xong (async_shaders.js): vẽ lại đúng trạng thái này
    // (không tiến đồng hồ ảo, không tiến âm) tới khi vẽ đủ — trước đây cỏ 3D đầu buổi quay thiếu ~70 khung rồi bật lên cùng lúc
    const realSleep = (ms) => new Promise(r => __TW.real.st(r, ms));
    async function settleShaders() {
      const AS = g.renderer && g.renderer.__asyncShaders;
      if (!AS) return;
      let n = 0, s = AS.skipped();
      if (s === TR._skip0) return;
      const t0 = __TW.real.now();
      for (;;) {
        TR._skip0 = s;
        await realSleep(40);
        g.render();
        n++;
        s = AS.skipped();
        if (s === TR._skip0) break;
        if (__TW.real.now() - t0 > 60000) { console.warn('[TRAILER] shader chưa xong sau 60 s, ghi tiếp'); break; }
      }
      TR._skip0 = s;
      tlog('shaderWait', { renders: n, ms: Math.round(__TW.real.now() - t0) });
    }
    TR.audioOn = () => {
      if (!se) return false;
      TR._audio = true;
      se.isMuted = false; se.isPageHidden = false;
      if (se.setUserVolume) se.setUserVolume(1, 0.8);
      if (se.setMusicVolume) se.setMusicVolume(0);
      return !!se.ctx;
    };
    const origUpdate = g.update;
    g.update = function (dt) {
      // xe camera đang tự lái (cảnh tiến quân, cán xe): tháp thẳng mũi xe — không để tháp ngắm theo hướng camera nhìn
      // (camera đặt bên hông / phía trước -> nòng quay ngược ra sau, trông như xe chạy lùi)
      if (TR.driving && !TR.pov) { this._aimPoint = null; if (this.lockedTarget) this.lockedTarget = null; this._turretHome = true; }
      origUpdate.call(this, dt);
      if (TR.pov) { hideJunk(); return; }
      try { direct(dt); } catch (e) { if (!TR._de) { TR._de = 1; console.error('[TRAILER] director', e); } }
      followPlayer(); hideJunk();
    };
    const origRender = g.render;
    g.render = function () {
      if (!TR.pov) {
        applyCam(); lensRain();
        // game.updateUnitLOD chạy trong update theo camera bám xe người chơi (đã ẩn) -> xe trong khung máy đạo diễn nhưng
        // ngoài khung nhìn của camera bám xe bị tắt mesh instanced (bánh, xích): xe trông lơ lửng. Tính lại theo máy thật
        if (this.updateUnitLOD) { this._lodT = 0; this.updateUnitLOD(0); }
      }
      hideJunk();
      // ?fog=0.5: sương mỏng hơn khi vẽ (mưa / mây / sét giữ nguyên, nhìn xa hơn); trả lại ngay sau khi vẽ để không cộng dồn
      const fog = this.scene && this.scene.fog, fk = parseFloat(q.get('fog'));
      const d0 = fog && fog.density !== undefined ? fog.density : null;
      // máy ngoài: sương = mức gốc của bản đồ (fog._baseD), không theo camera bám xe của game — sau kính ngắm / màn hình
      // drone, camera bám xe để sương cực dày (tính theo độ phóng kính) -> cả khung trắng đục
      const base = fog && fog._baseD !== undefined ? fog._baseD : d0;
      const want = d0 === null ? null : (TR.pov ? d0 : base) * (fk > 0 ? fk : 1);
      if (want !== null) fog.density = want;
      try { origRender.call(this); } finally { if (d0 !== null) fog.density = d0; }
    };
    TR.state = 'ready';
    tlog('start', { map: BIOME, seed: SEED });
  }

  function hideJunk() {
    for (const k of ['reticle3D', 'lockReticle3D', 'spreadRing', '_blastZone', 'trajectoryLine', '_aimAnchor', '_driveMarker']) if (g[k]) g[k].visible = false;
    for (const u of g.units) { if (u.hpGroup) u.hpGroup.visible = false; if (u.reactiveArmorMesh) u.reactiveArmorMesh.visible = false; }
    if (g.player && g.player.group && !TR.driving) g.player.group.visible = false;
    // mũi tên vàng đánh dấu địch bị trinh sát (chỉ là giao diện)
    if (g._spotMarkers) for (const m of g._spotMarkers) m.visible = false;
  }
  // giọt mưa đọng trên ống kính (?lens=1, khi trời mưa): dùng lại lớp LensRain của màn hình drone, phủ toàn khung
  let lensHost = null, lensT = 0;
  function lensRain() {
    if (!q.get('lens') || typeof LensRain === 'undefined' || typeof Weather === 'undefined' || !Weather.rainK) return;
    if (!lensHost) { lensHost = document.createElement('div'); lensHost.id = 'tr-lens'; lensHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6'; document.body.appendChild(lensHost); }
    const t = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, t - (lensT || t))); lensT = t;
    try { LensRain.update(dt, lensHost, { rain: TR.noLens ? 0 : Weather.rainK(), flow: cam.shot && cam.shot.type === 'chase' ? 0.3 : 0.05 }); } catch (e) { /* bỏ qua */ }
  }
  function followPlayer() {
    const P = g.player, T = g.terrain;
    if (!P || !P.group || TR.driving) return;
    const half = T.width ? T.width / 2 - 50 : 1e9;
    const c = TR.gFocus || cam.focus || cam.pos;
    const x = Math.max(-half, Math.min(half, c.x)), z = Math.max(-half, Math.min(half, c.z));
    P.x = x; P.z = z; P.speed = 0; P.y = T.getElevationAt(x, z);
    P.group.position.set(x, P.y, z);
  }

  // ------------------------------------------------------------------ sự kiện
  const heat = new Map();   // id xe -> độ "nóng" giao tranh (giảm dần)
  const bump = (u, v) => { if (u) heat.set(u.id, (heat.get(u.id) || 0) + v); };
  const blasts = [];        // vụ nổ gần đây {x,y,z,t,big}
  const isSmall = (a) => /BULLET|INCENDIARY|GATLING_HE/.test(a || '');
  function hookEvents() {
    const B = g.ballistics;
    const of = B.fireShell3D;
    B.fireShell3D = function (shooter, az, el, ch, ammo) {
      const s = of.apply(this, arguments);
      if (s && shooter && shooter !== g.player) {
        const small = isSmall(ammo);
        bump(shooter, small ? 0.3 : 3);
        if (!small) {
          tlog('fire', { u: shooter.id, ammo, x: Math.round(shooter.x), z: Math.round(shooter.z), d: Math.round(dist3(cam.pos, shooter)), subj: !!(cam.shot && cam.shot.subject === shooter) });
          if (cam.shot && cam.shot.subject === shooter) cam.lastFire = { shell: s, t: now() };
        }
      }
      return s;
    };
    const oi = g.handleShellImpact;
    g.handleShellImpact = function (shell, hitType, target) {
      const r = oi.apply(this, arguments);
      try {
        if (!isSmall(shell.ammoType)) {
          blasts.push({ x: shell.x, y: shell.y, z: shell.z, t: now(), big: !!target });
          if (blasts.length > 80) blasts.shift();
          tlog('impact', { hit: hitType, tgt: target ? target.id : null, ammo: shell.ammoType, x: Math.round(shell.x), z: Math.round(shell.z), d: Math.round(dist3(cam.pos, shell)), vis: inView(shell) });
          shake(shell, target ? 1 : 0.6);
        }
        if (target) bump(target, isSmall(shell.ammoType) ? 0.3 : 4);
      } catch (e) { /* bỏ qua */ }
      return r;
    };
    const od = g.onUnitDestroyed;
    g.onUnitDestroyed = function (victim, killer) {
      const first = !victim._deathHandled;
      const r = od.apply(this, arguments);
      if (first && victim !== g.player) {
        const vis = inView(victim);
        tlog('kill', { u: victim.id, by: killer ? killer.id : null, tt: victim.tankType, x: Math.round(victim.x), z: Math.round(victim.z), d: Math.round(dist3(cam.pos, victim)), vis });
        blasts.push({ x: victim.x, y: victim.y, z: victim.z, t: now(), big: true, kill: true });
        cam.kills.push({ u: victim, t: now(), x: victim.x, y: victim.y, z: victim.z, vis });
        shake(victim, 1.6);
      }
      return r;
    };
  }
  // drone / UAV bị bắn hạ (phòng không): ghi lại, đang thấy thì quay chậm
  function hookDrones() {
    if (!g.botDroneDown || g.botDroneDown.__tr) return;
    const o = g.botDroneDown;
    g.botDroneDown = function (u, by, why) {
      const R = g._otherDrones && g._otherDrones.get(u.id);
      const p = R ? { x: R.x, y: R.y, z: R.z } : u;
      const vis = inView(p, 1400);
      tlog('droneDown', { u: u.id, by: by ? by.id || by : null, why: why || 'shot', vis, x: Math.round(p.x), z: Math.round(p.z) });
      if (vis && !why) slowMo(0.35, 1.4);
      return o.apply(this, arguments);
    };
    g.botDroneDown.__tr = true;
  }
  const now = () => performance.now() / 1000;
  const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);

  // ------------------------------------------------------------------ camera
  const cam = {
    pos: { x: 0, y: 300, z: 0 }, look: { x: 0, y: 0, z: 0 }, focus: null,
    shot: null, shotN: 0, kills: [], trauma: 0, lastFire: null, fov: 50, slow: 1, slowUntil: 0
  };
  TR.cam = cam;
  function shake(p, k) {
    const d = dist3(cam.pos, p);
    cam.trauma = Math.min(1.2, cam.trauma + k * Math.max(0, 1 - d / 700));
  }
  // điểm p có nằm trong khung hình camera hiện tại (và đủ gần để thấy rõ)?
  const _v = { x: 0, y: 0, z: 0 };
  function inView(p, maxD = 900) {
    const dx = p.x - cam.pos.x, dy = (p.y || 0) - cam.pos.y, dz = p.z - cam.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > maxD || d < 1) return false;
    const lx = cam.look.x - cam.pos.x, ly = cam.look.y - cam.pos.y, lz = cam.look.z - cam.pos.z, ld = Math.hypot(lx, ly, lz) || 1;
    return (dx * lx + dy * ly + dz * lz) / (d * ld) > Math.cos((cam.fov * 0.5 + 8) * Math.PI / 180);
  }
  // cỡ xe (đơn vị game, 8 = 1 m): dùng thân xe, không tính ăng-ten / hiệu ứng gắn kèm
  const sizeCache = new Map();
  function sizeOf(u) {
    let s = sizeCache.get(u.id);
    if (!s && u.group) {
      const b = new THREE.Box3().setFromObject(u.group), v = b.getSize(new THREE.Vector3());
      s = Math.max(30, Math.min(70, Math.min(v.x, v.z) * 1.6, Math.max(v.x, v.z)));
      if (isFinite(s)) sizeCache.set(u.id, s); else s = 50;
    }
    return s || 50;
  }
  const alive = () => g.units.filter(u => u && !u.isDead && u.group && u.group.visible !== false && u !== g.player);
  const ground = (x, z) => g.terrain.getElevationAt(x, z);
  // mặt cao nhất tại (x, z): đất, nóc nhà còn đứng (lưới ô 200 dựng một lần), mái / ụ đất cứ điểm
  let bGrid = null;
  function buildingGrid() {
    const bs = g.terrain.buildingSet;
    if (!bs || !bs.items) return null;
    if (bGrid && bGrid.set === bs) return bGrid;
    bGrid = { set: bs, m: new Map() };
    for (const B of bs.items) {
      const r = Math.hypot(B.halfW, B.halfD) + 6;
      for (let i = Math.floor((B.x - r) / 200); i <= Math.floor((B.x + r) / 200); i++)
        for (let j = Math.floor((B.z - r) / 200); j <= Math.floor((B.z + r) / 200); j++) {
          const k = i * 100000 + j; if (!bGrid.m.has(k)) bGrid.m.set(k, []); bGrid.m.get(k).push(B);
        }
    }
    return bGrid;
  }
  function obstacleTop(x, z) {
    let y = ground(x, z);
    const G = buildingGrid();
    if (G) {
      const l = G.m.get(Math.floor(x / 200) * 100000 + Math.floor(z / 200));
      if (l) for (const B of l) {
        if (B.collapsed) continue;
        const L = G.set.toLocal(B, x, 0, z);
        if (Math.abs(L.x) < B.halfW + 4 && Math.abs(L.z) < B.halfD + 4) y = Math.max(y, B.y - 1.5 + B.topY + (B.FH || 25) * 0.3);
      }
    }
    const SS = g.terrain.strongholdSet;
    if (SS && SS.surfaceAt) { const s = SS.surfaceAt(x, z); if (s !== null && s > y) y = s; }
    // khối đặc của căn cứ (nhà, chòi canh, bồn, bệ phóng — landmarks.js solids: tâm, trục u, nửa cạnh hu / hv, y0..y1)
    const LS = g.terrain.landmarkSet;
    if (LS && LS.items) for (const it of LS.items) {
      if (Math.abs(x - it.x) > (it.reach || 600) || Math.abs(z - it.z) > (it.reach || 600)) continue;
      for (const q of it.boxes || []) {
        const dx = x - q.cx, dz = z - q.cz, a = dx * q.ux + dz * q.uz, b = -dx * q.uz + dz * q.ux;
        if (Math.abs(a) < q.hu + 3 && Math.abs(b) < q.hv + 3 && q.y1 > y) y = q.y1;
      }
    }
    return y;
  }
  const inConcrete = (x, y, z) => { const SS = g.terrain.strongholdSet; try { return !!(SS && SS.concreteAt && SS.concreteAt(x, y, z, 3)); } catch (e) { return false; } };
  const treesNear = (x, z, r) => { const T = g.terrain.trees; try { return T && T.near ? T.near(x, z, r).filter(t => !t.dead && !t.fallen && !t.down) : []; } catch (e) { return []; } };
  // nhìn thông từ a tới b: không bị đồi / nhà / thân & tán cây chắn (bỏ ~15% đầu cuối phía mục tiêu)
  function clearView(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(4, Math.ceil(d / 18));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (t > 0.88) break;
      const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
      if (obstacleTop(x, z) > y - 2) return false;
      if (inConcrete(x, y, z)) return false;
      if (treesNear(x, z, 14).length) return false;
    }
    return !treesNear(a.x, a.z, 26).length;
  }
  function enemyNear(u, R) {
    let best = null, bd = R;
    for (const o of g.units) {
      if (!o || o.isDead || o.team === u.team || o === g.player) continue;
      const d = Math.hypot(o.x - u.x, o.z - u.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  // hướng xe: theo chuyển động (làm mượt)
  const motion = new Map();
  function trackMotion(dt) {
    for (const u of g.units) {
      let m = motion.get(u.id);
      if (!m) {
        const a = u.bodyAngle || 0;
        m = { x: u.x, z: u.z, vx: 0, vz: 0, hx: Math.sin(a), hz: -Math.cos(a), speed: 0 };
        motion.set(u.id, m);
      }
      const vx = (u.x - m.x) / Math.max(dt, 1e-3), vz = (u.z - m.z) / Math.max(dt, 1e-3);
      if (Math.hypot(vx, vz) < 2000) { m.vx = lerp(m.vx, vx, damp(3, dt)); m.vz = lerp(m.vz, vz, damp(3, dt)); }
      m.x = u.x; m.z = u.z;
      const sp = Math.hypot(m.vx, m.vz);
      if (sp > 4) { const hx = m.vx / sp, hz = m.vz / sp; m.hx = lerp(m.hx, hx, damp(2, dt)); m.hz = lerp(m.hz, hz, damp(2, dt)); }
      const n = Math.hypot(m.hx, m.hz) || 1; m.hx /= n; m.hz /= n;
      m.speed = sp;
    }
  }
  function aimDir(u) {
    const m = motion.get(u.id);
    const tgt = enemyNear(u, 1600);
    if (tgt) { const dx = tgt.x - u.x, dz = tgt.z - u.z, n = Math.hypot(dx, dz) || 1; return { x: dx / n, z: dz / n, tgt }; }
    return { x: m ? m.hx : 0, z: m ? m.hz : -1, tgt: null };
  }

  // độ "đáng quay": đang bắn / bị bắn, địch ở gần, nhiều vụ nổ quanh đó
  function score(u) {
    let s = heat.get(u.id) || 0;
    const e = enemyNear(u, 1100);
    if (e) s += 2 + (1100 - Math.hypot(e.x - u.x, e.z - u.z)) / 400;
    const t = now();
    for (const b of blasts) if (t - b.t < 10 && Math.hypot(b.x - u.x, b.z - u.z) < 450) s += b.big ? 0.8 : 0.4;
    if (u.hp < u.maxHp * 0.5) s += 1;
    if (u.tankType === 'ARTILLERY') s -= 1;
    return s;
  }
  function pickSubject(avoid) {
    const A = alive();
    if (!A.length) return null;
    A.sort((a, b) => score(b) - score(a));
    const top = A.slice(0, 3).filter(u => u !== avoid);
    return top.length ? pick(top) : A[0];
  }

  // các kiểu cảnh thường (wreck / shell chỉ do sự kiện kích hoạt); trọng số = tần suất
  const WEIGHTS = { chase: 3, flank: 3, front: 2, shoulder: 3, orbit: 1.5, aerial: 1, low: 2 };
  function newShot(forceType, extra) {
    const prev = cam.shot;
    let type = forceType;
    if (!type) {
      const pool = Object.keys(WEIGHTS).filter(t => SHOTS.includes(t) && (!prev || t !== prev.type));
      let sum = 0; for (const t of pool) sum += WEIGHTS[t];
      let r = rnd() * sum; type = pool[pool.length - 1];
      for (const t of pool) { r -= WEIGHTS[t]; if (r <= 0) { type = t; break; } }
    }
    const subject = (extra && extra.subject) || pickSubject(prev && prev.subject);
    const dur = { chase: 5, flank: 4, front: 4, shoulder: 5, shell: 6, wreck: 6, aerial: 5, orbit: 5, low: 4 }[type] || 5;
    cam.shot = Object.assign({ type, subject, t0: now(), dur: dur * (0.8 + rnd() * 0.4), side: rnd() < 0.5 ? -1 : 1, seed: rnd(), init: false, blocked: 0 }, extra || {});
    cam.shotN++;
    if (prev && !(extra && extra.noHold)) TR.holdN = Math.max(TR.holdN, 6);
    TR.gFocus = null;
    tlog('shot', { n: cam.shotN, kind: type, u: subject ? subject.id : null, tt: subject ? subject.tankType : null, sc: subject ? +score(subject).toFixed(1) : 0 });
  }
  // thử vài vị trí đặt máy, chọn chỗ nhìn thông tới xe
  function placeAnchor(u, gen) {
    const s = sizeOf(u), tgt = { x: u.x, y: u.y + s * 0.3, z: u.z };
    let best = null;
    for (let k = 0; k < 8; k++) {
      const p = gen(k);
      p.y = Math.max(p.y, obstacleTop(p.x, p.z) + 3);
      if (clearView(p, tgt)) return p;
      if (!best) best = p;
    }
    return null;
  }

  // ?calm=1: máy quay kiểu phóng sự — không rung giả, không tự quay chậm (chỉ khoảnh khắc ù tai được chậm nhẹ: force)
  const CALM = !!q.get('calm');
  function slowMo(scale, sec, force) {
    if (CALM && !force) return;
    cam.slow = Math.min(cam.slow, scale);
    cam.slowUntil = Math.max(cam.slowUntil, now() + sec * scale);
  }

  function direct(dt) {
    dt = Math.min(dt || 1 / 30, 0.1);
    TR.frame = window.__TW ? __TW.frameN : 0;
    trackMotion(dt);
    for (const [k, v] of heat) heat.set(k, v * Math.exp(-dt / 6));
    const t = now();
    if (!cam.shot) newShot('aerial');
    let S = cam.shot;
    const el = t - S.t0;
    // xe bị hạ ngay trong khung hình (hoặc là xe đang quay / mục tiêu của nó): quay chậm + chuyển cảnh xác xe
    // cảnh do kịch bản đặt (S.locked): không tự cắt sang xác xe — kịch bản tự quyết
    const k = !S.locked && cam.kills.find(k => t - k.t < 0.15 && !k.used && (k.vis || k.u === S.subject || k.u === S.target));
    if (k) {
      k.used = true;
      slowMo(0.3, 1.6);
      tlog('slowmo', { why: 'kill', u: k.u.id });
      if (S.type !== 'wreck' && S.type !== 'shell') {
        // đang thấy rõ thì giữ góc này thêm một chút rồi mới sang cảnh xác xe
        if (k.vis) { S.dur = Math.max(S.dur, el + 1.2); S.next = { type: 'wreck', subject: k.u, at: { x: k.x, y: k.y, z: k.z } }; }
        else { newShot('wreck', { subject: k.u, at: { x: k.x, y: k.y, z: k.z } }); S = cam.shot; }
      }
    } else if (S.type !== 'shell' && S.type !== 'wreck' && cam.lastFire && t - cam.lastFire.t < 0.05 && SHOTS.includes('shell') && rnd() < (S.shellP !== undefined ? S.shellP : 0.5) && el > 0.8) {
      // xe đang quay vừa khai hỏa đạn pháo: bám theo viên đạn (quay chậm)
      const sh = cam.lastFire.shell;
      if (sh && !isSmall(sh.ammoType)) { newShot('shell', { subject: S.subject, shell: sh, next: S.after || null }); S = cam.shot; slowMo(0.45, 99); }
    } else if (el > S.dur || (!S.subject && S.type !== 'fixed' && S.type !== 'drone') || (S.subject && S.subject.isDead && S.type !== 'wreck' && S.type !== 'fixed' && S.type !== 'drone') || (S.blocked > 0.6 && !S.locked)) {
      if (S.blocked > 0.6) tlog('blocked', { n: cam.shotN });
      if (S.next) newShot(S.next.type, S.next); else newShot();
      S = cam.shot;
    }
    cam.lastFire = null;
    if (g._otherDrones && S.type !== 'drone' && S.type !== 'wreck' && !S.noDrone) {
      for (const R of g._otherDrones.values()) {
        const was = R.__st; R.__st = R.state;
        if (was === 'docked' && R.state === 'launching') {
          const kami = R.unit && R.unit.uavKind === 'kami';
          tlog('uav', { u: R.unit && R.unit.id, kami });
          if (kami && rnd() < 0.8) { newShot('drone', { rec: R, subject: R.unit, dur: 40 }); S = cam.shot; break; }
        }
      }
    } else if (g._otherDrones) for (const R of g._otherDrones.values()) R.__st = R.state;
    const fn = SHOT_FN[S.type] || SHOT_FN.chase;
    const r = fn(S, dt, now() - S.t0);
    if (!r) { if (S.type === 'shell') cam.slowUntil = 0; newShot(); return; }
    // camera không chui xuống đất / vào nhà
    const minY = obstacleTop(r.pos.x, r.pos.z) + (r.minClear || 6);
    if (r.pos.y < minY) r.pos.y = minY;
    const a = S.init ? damp(r.stiff || 6, dt) : 1;
    const la = S.init ? damp(r.lookStiff || r.stiff || 6, dt) : 1;
    S.init = true;
    for (const c of ['x', 'y', 'z']) { cam.pos[c] = lerp(cam.pos[c], r.pos[c], a); cam.look[c] = lerp(cam.look[c], r.look[c], la); }
    if (cam.pos.y < minY) cam.pos.y = minY;
    // không kẹt trong bê tông / gầm mái cứ điểm
    for (let i = 0; i < 12 && inConcrete(cam.pos.x, cam.pos.y, cam.pos.z); i++) cam.pos.y += 6;
    cam.fov = lerp(cam.fov, r.fov || 50, S.fovInit ? damp(3, dt) : 1); S.fovInit = true;
    cam.focus = r.focus || r.look;
    // tâm cỏ: điểm trên mặt đất phía trước máy, đặt một lần mỗi cảnh (cỏ không trượt / mọc lại khi xe chạy trong khung)
    if (!TR.gFocus) {
      const dx = cam.look.x - cam.pos.x, dz = cam.look.z - cam.pos.z, dh = Math.hypot(dx, dz) || 1;
      const k = Math.min(dh * 0.55, 420) / dh;
      TR.gFocus = { x: cam.pos.x + dx * k, z: cam.pos.z + dz * k };
    }
    cam.roll = lerp(cam.roll || 0, r.roll || 0, damp(3, dt));
    // cảnh bám xe: nếu bị che quá 0,6 s thì cắt
    if (r.check && S.subject && !S.subject.isDead) {
      S._ck = (S._ck || 0) + 1;
      if (S._ck % 4 === 0) {
        const s = sizeOf(S.subject);
        if (!clearView(cam.pos, { x: S.subject.x, y: S.subject.y + s * 0.3, z: S.subject.z })) S.blocked += dt * 4; else S.blocked = 0;
      }
    }
    cam.trauma = Math.max(0, cam.trauma - dt * 1.1);
    // quay chậm: giảm dần về bình thường
    if (t > cam.slowUntil) cam.slow = Math.min(1, cam.slow + dt * 1.6 / Math.max(0.05, cam.slow));
    if (window.__TW) __TW.timeScale = cam.slow;
  }

  // Các kiểu cảnh: trả về vị trí đích camera + điểm nhìn (đã làm mượt ở direct)
  const SHOT_FN = {
    chase(S, dt, el) {
      const u = S.subject; if (!u || u.isDead) return null;
      const m = motion.get(u.id), s = sizeOf(u);
      const d = s * (1.7 + S.seed * 0.8), h = s * (0.35 + S.seed * 0.35);
      const ox = m.hx * -d + m.hz * S.side * s * 0.45, oz = m.hz * -d - m.hx * S.side * s * 0.45;
      return { pos: { x: u.x + ox, y: u.y + h, z: u.z + oz }, look: { x: u.x + m.hx * s * 2.5, y: u.y + s * 0.2, z: u.z + m.hz * s * 2.5 }, stiff: 4, fov: 50, check: true };
    },
    low(S, dt, el) {
      // sát đất, bám ngang hông xe, nhìn chếch lên — xe lừng lững qua khung hình
      const u = S.subject; if (!u || u.isDead) return null;
      const m = motion.get(u.id), s = sizeOf(u);
      const back = s * (0.2 + 0.6 * S.seed), side = s * 1.75;
      const x = u.x - m.hx * back + m.hz * side * S.side, z = u.z - m.hz * back - m.hx * side * S.side;
      return { pos: { x, y: ground(x, z) + s * 0.2, z }, look: { x: u.x + m.hx * s * 0.8, y: u.y + s * 0.35, z: u.z + m.hz * s * 0.8 }, stiff: 5, fov: 56, minClear: 2, check: true, roll: 0.07 * S.side };
    },
    flank(S, dt, el) {
      const u = S.subject; if (!u || u.isDead) return null;
      const m = motion.get(u.id), s = sizeOf(u);
      if (!S.anchor) {
        // đứng sát đất phía trước-bên của xe, xe chạy ngang qua ống kính
        const ahead = m.speed > 8 ? Math.min(s * 4, s * 0.8 + m.speed * 1.6) : s * 0.6;
        S.anchor = placeAnchor(u, (k) => {
          const side = s * (1.2 + 0.25 * k) * (k % 2 ? -S.side : S.side), a = ahead * (1 - k * 0.08);
          const x = u.x + m.hx * a + m.hz * side, z = u.z + m.hz * a - m.hx * side;
          return { x, z, y: ground(x, z) + s * (0.1 + 0.12 * S.seed) };
        });
        if (!S.anchor) return null;
      }
      return { pos: { x: S.anchor.x, y: S.anchor.y, z: S.anchor.z }, look: { x: u.x, y: u.y + s * 0.3, z: u.z }, stiff: 30, lookStiff: 7, fov: 46, minClear: 2, check: true };
    },
    front(S, dt, el) {
      const u = S.subject; if (!u || u.isDead) return null;
      const s = sizeOf(u), A = aimDir(u);
      if (!S.anchor) {
        // trước mũi xe, lệch khỏi đường nòng, thấp; đứng yên để xe tiến lại / khai hỏa về phía ống kính
        S.anchor = placeAnchor(u, (k) => {
          const d = s * (1.8 + 0.3 * k), off = s * (0.9 + 0.15 * k) * (k % 2 ? -S.side : S.side);
          const x = u.x + A.x * d + A.z * off, z = u.z + A.z * d - A.x * off;
          return { x, z, y: ground(x, z) + s * 0.16 };
        });
        if (!S.anchor) return null;
      }
      return { pos: { x: S.anchor.x, y: S.anchor.y, z: S.anchor.z }, look: { x: u.x, y: u.y + s * 0.35, z: u.z }, stiff: 30, lookStiff: 6, fov: 36, minClear: 2, check: true };
    },
    shoulder(S, dt, el) {
      const u = S.subject; if (!u || u.isDead) return null;
      const s = sizeOf(u), A = aimDir(u);
      if (!(S.keepTg && S.target)) S.target = A.tgt || S.target;   // keepTg: không nhảy sang mục tiêu khác
      // S.keepTg: xe địch bị hạ vẫn giữ nguyên khung (không đổi điểm nhìn / tiêu cự đột ngột)
      const tg = S.target && (!S.target.isDead || S.keepTg) ? S.target : null;
      const d = s * 1.35, h = s * 0.42;
      const x = u.x - A.x * d + A.z * S.side * s * 0.55, z = u.z - A.z * d - A.x * S.side * s * 0.55;
      const look = tg ? { x: lerp(u.x, tg.x, 0.5), y: lerp(u.y + s * 0.4, tg.y, 0.5), z: lerp(u.z, tg.z, 0.5) } : { x: u.x + A.x * s * 6, y: u.y + s * 0.3, z: u.z + A.z * s * 6 };
      return { pos: { x, y: u.y + h, z }, look, stiff: 5, lookStiff: 3, fov: tg ? 32 : 42, focus: u, check: true };
    },
    shell(S, dt, el) {
      const sh = S.shell, u = S.subject;
      if (!sh) return null;
      const s = u ? sizeOf(u) : 50;
      if (!sh.exploded && el < (S.track || 3) && g.ballistics.activeShells.includes(sh)) {
        const v = Math.hypot(sh.vx, sh.vy, sh.vz) || 1;
        const bx = sh.vx / v, by = sh.vy / v, bz = sh.vz / v;
        S.last = { x: sh.x, y: sh.y, z: sh.z, bx, by, bz };
        // sau lưng viên đạn, hơi lệch, nhìn dọc đường bay
        const back = s * 0.9;
        return { pos: { x: sh.x - bx * back + bz * s * 0.25, y: sh.y - by * back + s * 0.22, z: sh.z - bz * back - bx * s * 0.25 }, look: { x: sh.x + bx * s * 5, y: sh.y + by * s * 5, z: sh.z + bz * s * 5 }, stiff: 40, lookStiff: 20, fov: 58, focus: sh };
      }
      // đạn đã nổ: camera trôi chậm lại, nhìn chỗ nổ thêm ~2 s (vẫn quay chậm thêm chút)
      if (!S.last) return null;
      if (!S.hitT) { S.hitT = el; cam.slowUntil = now() + 0.5; tlog('shellhit', { n: cam.shotN }); }
      if (el - S.hitT > 2.2) return null;
      const L = S.last;
      return { pos: { x: L.x - L.bx * s * 3, y: L.y - L.by * s * 3 + s * 0.6, z: L.z - L.bz * s * 3 }, look: { x: L.x, y: L.y, z: L.z }, stiff: 1.5, lookStiff: 5, fov: 52, focus: L };
    },
    wreck(S, dt, el) {
      const p = S.at || (S.subject ? { x: S.subject.x, y: S.subject.y, z: S.subject.z } : null);
      if (!p) return null;
      const s = S.subject ? sizeOf(S.subject) : 50;
      if (S.a0 === undefined) {
        // góc nhìn thông tới xác xe, gần hướng camera cũ cho chuyển cảnh liền mạch
        const base = Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z);
        S.a0 = base;
        for (let k = 0; k < 8; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6, d = s * 2.6;
          const c = { x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d };
          c.y = ground(c.x, c.z) + s * 0.5;
          if (clearView(c, { x: p.x, y: p.y + s * 0.4, z: p.z })) { S.a0 = a; break; }
        }
      }
      const a = S.a0 + S.side * el * 0.18, d = s * (2.6 + el * 0.12);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      return { pos: { x, y: ground(x, z) + s * 0.5, z }, look: { x: p.x, y: p.y + s * 0.4, z: p.z }, stiff: 2.5, lookStiff: 6, fov: 48 };
    },
    orbit(S, dt, el) {
      const u = S.subject; if (!u || u.isDead) return null;
      const s = sizeOf(u);
      if (S.a0 === undefined) S.a0 = rnd() * Math.PI * 2;
      const a = S.a0 + S.side * el * 0.3, d = s * 1.9;
      const x = u.x + Math.sin(a) * d, z = u.z + Math.cos(a) * d;
      return { pos: { x, y: u.y + s * 0.25, z }, look: { x: u.x, y: u.y + s * 0.3, z: u.z }, stiff: 6, fov: 50, check: true };
    },
    aerial(S, dt, el) {
      // drone nghiêng trên đầu chỗ giao tranh ác liệt nhất, trượt chậm
      if (!S.c) {
        const t = now(), rec = blasts.filter(b => t - b.t < 15);
        const A = alive();
        let c = null;
        if (rec.length) {
          // cụm nổ dày nhất
          let best = rec[rec.length - 1], bn = -1;
          for (const b of rec) { let n = 0; for (const o of rec) if (Math.hypot(o.x - b.x, o.z - b.z) < 350) n++; if (n > bn) { bn = n; best = b; } }
          c = { x: best.x, z: best.z };
        } else if (S.subject) c = { x: S.subject.x, z: S.subject.z };
        else if (A.length) c = { x: A[0].x, z: A[0].z };
        else c = { x: 0, z: 0 };
        c.y = ground(c.x, c.z);
        S.c = c; S.a0 = rnd() * Math.PI * 2; S.r = 200 + rnd() * 120; S.h = 110 + rnd() * 70;
      }
      const a = S.a0 + S.side * el * 0.07;
      const x = S.c.x + Math.sin(a) * S.r, z = S.c.z + Math.cos(a) * S.r;
      return { pos: { x, y: Math.max(S.c.y, ground(x, z)) + S.h, z }, look: { x: S.c.x, y: S.c.y + 8, z: S.c.z }, stiff: 1.5, fov: 50, focus: S.c };
    }
  };

  function applyCam() {
    const c = g.camera;
    const tr = CALM ? 0 : cam.trauma * cam.trauma, t = performance.now() / 1000;
    const sx = (Math.sin(t * 37.1) + Math.sin(t * 23.7)) * 0.5 * tr * 3, sy = (Math.sin(t * 31.3) + Math.sin(t * 19.9)) * 0.5 * tr * 2.2;
    c.position.set(cam.pos.x + sx, cam.pos.y + sy, cam.pos.z);
    c.lookAt(cam.look.x, cam.look.y, cam.look.z);
    c.rotateZ((cam.roll || 0) + (tr > 0 ? Math.sin(t * 29.3) * tr * 0.015 : 0));
    if (Math.abs(c.fov - cam.fov) > 0.05) { c.fov = cam.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    const dx = cam.look.x - cam.pos.x, dz = cam.look.z - cam.pos.z;
    g._camYaw = Math.atan2(-dx, -dz);
  }

  // bám UAV / drone đang bay (S.rec = bản ghi drone của drone_air: x, y, z, state); hết bay ~1,5 s thì nhìn chỗ nó nổ / rơi
  SHOT_FN.drone = function (S, dt, el) {
    const R = S.rec; if (!R) return null;
    const air = R.state === 'launching' || R.state === 'flying' || R.state === 'returning';
    if (!S.prev) S.prev = { x: R.x, y: R.y, z: R.z, vx: 0, vy: 0, vz: -1 };
    const P = S.prev;
    if (air) {
      const vx = R.x - P.x, vy = R.y - P.y, vz = R.z - P.z, n = Math.hypot(vx, vy, vz);
      if (n > 0.05) { P.vx = lerp(P.vx, vx / n, damp(4, dt)); P.vy = lerp(P.vy, vy / n, damp(4, dt)); P.vz = lerp(P.vz, vz / n, damp(4, dt)); }
      P.x = R.x; P.y = R.y; P.z = R.z; S.endT = el;
      const k = Math.hypot(P.vx, P.vy, P.vz) || 1, bx = P.vx / k, by = P.vy / k, bz = P.vz / k;
      const back = 34;
      return { pos: { x: R.x - bx * back + bz * 8 * S.side, y: R.y - by * back + 9, z: R.z - bz * back - bx * 8 * S.side }, look: { x: R.x + bx * 60, y: R.y + by * 60, z: R.z + bz * 60 }, stiff: 14, lookStiff: 8, fov: 56, focus: R };
    }
    if (el - (S.endT || 0) > 2.6) return null;
    return { pos: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z }, look: { x: P.x, y: P.y, z: P.z }, stiff: 1, lookStiff: 3, fov: 50, focus: P };
  };

  // bay song song bên sườn viên đạn pháo cầu vồng (S.shell): thấy đạn vút lên rồi rơi xuống mục tiêu, mặt đất luôn trong
  // khung (máy sau lưng đạn chỉ thấy trời); đạn nổ -> máy dừng lại, nhìn chỗ nổ S.hold giây (sóng xung kích, khói)
  SHOT_FN.shellside = function (S, dt, el) {
    const sh = S.shell; if (!sh) return null;
    if (!sh.exploded && g.ballistics.activeShells.includes(sh) && el < (S.track || 12)) {
      const v = Math.hypot(sh.vx, sh.vz) || 1, hx = sh.vx / v, hz = sh.vz / v, sd = S.side || 1, off = S.off || 150;
      const x = sh.x - hz * off * sd - hx * 50, z = sh.z + hx * off * sd - hz * 50;
      S.last = { x: sh.x, y: sh.y, z: sh.z };
      // tâm cỏ đặt lúc bắt đầu cảnh nằm ở chỗ xe pháo (xa điểm rơi ~1800) -> chỗ nổ trơ đất không cỏ; khi đạn đang rơi
      // gần mục tiêu (máy còn trên cao, cỏ mọc lại không lộ) dời tâm cỏ về giữa chỗ máy dừng/lùi và công trình
      if (S.pull && S.lookAt && !S.gMoved && sh.vy < 0 && Math.hypot(sh.x - S.lookAt.x, sh.z - S.lookAt.z) < 700) {
        S.gMoved = true;
        const C = S.lookAt, ex = -hz * off * sd - hx * 50, ez = hx * off * sd - hz * 50, el2 = Math.hypot(ex, ez) || 1;
        const r = (el2 + S.pull) * 0.45;
        TR.gFocus = { x: C.x + ex / el2 * r, z: C.z + ez / el2 * r };
      }
      return { pos: { x, y: Math.max(sh.y - 12, obstacleTop(x, z) + 9), z }, look: { x: sh.x + hx * 40, y: sh.y, z: sh.z + hz * 40 }, stiff: S.stiff || 30, lookStiff: 30, fov: S.fov || 46, focus: sh };
    }
    if (!S.last) return null;
    if (!S.hitT) { S.hitT = el; S.stop = { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z }; tlog('shellhit', { n: cam.shotN }); }
    if (el - S.hitT > (S.hold || 3)) return null;
    const L = S.last;
    if (S.pull) {
      // lùi ra xa + nâng lên (êm dần) để thấy trọn công trình bị phá huỷ; nhìn vào thân công trình S.lookAt (nếu có)
      const k = Math.min(1, (el - S.hitT) / (S.pullT || 4)), e = k * k * (3 - 2 * k);
      const C = S.lookAt || L, ax = S.stop.x - C.x, az = S.stop.z - C.z, al = Math.hypot(ax, az) || 1;
      const pos = { x: S.stop.x + ax / al * S.pull * e, y: S.stop.y + (S.pullUp || 0) * e, z: S.stop.z + az / al * S.pull * e };
      return { pos, look: { x: C.x, y: ground(C.x, C.z) + 12 + (S.lookUp || 10) * e, z: C.z }, stiff: 5, lookStiff: 4, fov: S.fov || 46, focus: C };
    }
    return { pos: S.stop, look: { x: L.x, y: ground(L.x, L.z) + 12, z: L.z }, stiff: 2, lookStiff: 3, fov: S.fov || 46, focus: L };
  };

  // máy bay theo quỹ đạo do kịch bản vẽ: S.fn(el) -> { pos, look, fov, roll } (góc nhìn UAV cảm tử...)
  SHOT_FN.path = function (S, dt, el) {
    const r = S.fn && S.fn(el); if (!r) return null;
    return Object.assign({ stiff: 30, lookStiff: 30, minClear: 3 }, r);
  };

  // máy đặt cố định (cảnh dàn dựng): S.pos / S.look, trôi chậm theo S.drift (đơn vị/giây) cho đỡ chết hình
  SHOT_FN.fixed = function (S, dt, el) {
    const d = S.drift || { x: 0, y: 0, z: 0 };
    const look = S.lookAt && !S.lookAt.isDead ? { x: S.lookAt.x, y: S.lookAt.y + 12, z: S.lookAt.z } : S.look;
    return { pos: { x: S.pos.x + d.x * el, y: S.pos.y + d.y * el, z: S.pos.z + d.z * el }, look, stiff: 40, lookStiff: S.lookAt ? 5 : 40, fov: S.fov || 50, minClear: 2 };
  };

  // ------------------------------------------------------------------ cảnh dàn dựng (kịch bản gọi qua __TR.scene)
  const ST = TR.scene = {
    wait: (sec) => new Promise(r => setTimeout(r, sec * 1000)),
    async until(fn, maxSec) { const t0 = now(); while (!fn() && now() - t0 < maxSec) await ST.wait(0.1); return fn(); },
    units: (team, type) => alive().filter(u => (!team || u.team === team) && (!type || u.tankType === type)),
    teleport(u, x, z, ang) {
      const y = ground(x, z);
      u.x = x; u.z = z; u.y = y; u.speed = 0; u._shBox = null;
      if (ang !== undefined) { u.bodyAngle = ang; u.azimuth = ArtilleryGame3D.headingDeg ? ArtilleryGame3D.headingDeg(ang) : u.azimuth; }
      if (u.group) { u.group.position.set(x, y, z); if (ang !== undefined) u.group.rotation.y = ang; }
      if (u.botAI) { u.botAI.path = null; u.botAI.target = null; }
      motion.delete(u.id);
    },
    // bãi trống bằng phẳng, xa cây / nhà / cứ điểm / các xe khác
    findOpen(R = 220, far = 900, tries = 400) {
      const T = g.terrain, half = (T.width || 8000) / 2 * 0.7;
      let best = null, bs = -1e9;
      for (let i = 0; i < tries; i++) {
        const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half, h0 = ground(x, z);
        let rough = 0;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; rough += Math.abs(ground(x + Math.cos(a) * R, z + Math.sin(a) * R) - h0); }
        if (T.isWater && T.isWater(x, z)) continue;
        const trees = treesNear(x, z, R).length;
        let top = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; top = Math.max(top, obstacleTop(x + Math.cos(a) * R * 0.6, z + Math.sin(a) * R * 0.6) - ground(x + Math.cos(a) * R * 0.6, z + Math.sin(a) * R * 0.6)); }
        let near = 1e9; for (const u of g.units) if (!u.isDead) near = Math.min(near, Math.hypot(u.x - x, u.z - z));
        const sc = -rough / 8 - trees * 15 - top * 3 + Math.min(near, far) / 50;
        if (sc > bs) { bs = sc; best = { x, z, y: h0 }; }
      }
      return best;
    },
    // đặt hai xe đối đầu quanh tâm c; b đứng ngang sườn (phô sườn cho a bắn xuyên); máu b còn hpB
    duel(a, b, c, dist = 260, hpB = 0.3, broadside = true) {
      const dirA = rnd() * Math.PI * 2, dx = Math.sin(dirA), dz = Math.cos(dirA);
      const ax = c.x - dx * dist / 2, az = c.z - dz * dist / 2, bx = c.x + dx * dist / 2, bz = c.z + dz * dist / 2;
      const face = Math.atan2(dx, -dz);   // góc thân xe nhìn theo (dx, dz)
      ST.teleport(a, ax, az, face);
      ST.teleport(b, bx, bz, broadside ? face + Math.PI / 2 : face + Math.PI);
      b.hp = Math.max(0.05, b.maxHp * hpB);
      heat.set(a.id, 20); heat.set(b.id, 20);
      tlog('stage', { what: 'duel', a: a.id, b: b.id, at: [Math.round(c.x), Math.round(c.z)] });
      return { ax, az, bx, bz, dx, dz };
    },
    // đạn rơi từ trên trời xuống điểm (x, z) — giả một loạt pháo kích tới từ hướng `from`
    shellAt(shooter, x, y, z, ammo = 'HE', from = 0, steep = 0.75) {
      const dx = Math.sin(from), dz = Math.cos(from), up = 600;
      const p = { x: x - dx * up * (1 - steep), y: y + up * steep, z: z - dz * up * (1 - steep) };
      const d = new THREE.Vector3(x - p.x, y - p.y, z - p.z).normalize();
      const B = g.ballistics;
      shooter._launchOverride = { position: new THREE.Vector3(p.x, p.y, p.z), direction: d };
      B._remoteShot = true;
      let s = null;
      try { s = B.fireShell3D(shooter, 0, 0, 1, ammo); } catch (e) { console.error('[TRAILER] shellAt', e); }
      finally { shooter._launchOverride = null; B._remoteShot = false; }
      return s;
    },
    // hạ xe v ngay bằng một phát trúng KHO ĐẠN: nổ tung, tháp pháo chắc chắn bật bay, xác cháy
    // mass: true = NỔ HÀNG LOẠT (thân toác, đồ văng rải xa, mảnh thép bay vèo); mặc định false = thuốc phóng cháy dữ dội
    ammoKill(v, by, dir, mass = false) {
      if (!v || v.isDead) return;
      const FX = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(g.scene) : null;
      if (FX && !FX.__trAmmo) {
        FX.__trAmmo = new Map();
        const orig = FX.killInfo;
        FX.killInfo = function (u) {
          const K = orig.call(this, u);
          if (FX.__trAmmo.has(u)) { const m = FX.__trAmmo.get(u); FX.__trAmmo.delete(u); Object.assign(K, { mode: 'ammo', instant: 'det', delayed: null, cookAt: Infinity, tossP: 1, tossRoll: 0, mass: m }); }
          return K;
        };
      }
      if (FX) FX.__trAmmo.set(v, !!mass);
      if (dir) { v.lastHitDir = new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(40); v.lastHitPoint = new THREE.Vector3(v.x, v.y + 6, v.z); }
      try { v.takeDamage(v.hp + 50, by || null, 'SHELL'); } catch (e) { console.error('[TRAILER] ammoKill', e); }
      tlog('stage', { what: 'ammoKill', u: v.id, dead: !!v.isDead });
    },
    // góc thân xe / góc phương vị (độ) nhìn từ u về điểm p: hướng (sin, -cos)
    face: (u, p) => Math.atan2(p.x - u.x, -(p.z - u.z)),
    // tắt / bật AI của một xe (đứng yên làm "diễn viên")
    freeze(u, on = true) {
      if (!u || !u.botAI) return;
      if (on && !u.botAI.__upd) { u.botAI.__upd = u.botAI.update; u.botAI.update = function () {}; }
      if (!on && u.botAI.__upd) { u.botAI.update = u.botAI.__upd; u.botAI.__upd = null; }
      u.speed = 0;
    },
    // xoay tháp về điểm p, góc nâng el (độ)
    aim(u, p, el = 2) {
      u.azimuth = ((ST.face(u, p) * 180 / Math.PI) % 360 + 360) % 360;
      u.elevation = el;
    },
    // khai hỏa pháo chính thật (lửa đầu nòng, giật nòng, tiếng) — pháo tự hành cần hạ chân chống trước
    fire(u) {
      if (!u || u.isDead) return null;
      u.reloadTimer = 0;
      if (u.tankType === 'ARTILLERY') { u.isDeployed = true; u.deployProgress = 1; u.turretInBlind = false; }
      try { return u.fire(g.ballistics, g.radar); } catch (e) { console.error('[TRAILER] fire', e); return null; }
    },
    // người chơi (xe camera) hiện ra & tự lái bằng phím: dùng cho cảnh xe tăng cán ô tô
    drive(on) {
      const P = g.player;
      TR.driving = !!on;
      if (on) { if (!g.units.includes(P)) g.units.push(P); P.group.visible = true; }
      else { g.units = g.units.filter(u => u !== P); P.group.visible = false; for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) g.keys[k] = false; }
      return P;
    },
    keys: (o) => { for (const k in o) g.keys[k] = !!o[k]; },
    // cho các xe (đã freeze) chạy thẳng theo (dx, dz) với tốc độ v (đv/s) trong sec giây
    glide(list, dx, dz, v, sec) {
      const t0 = now(), ang = Math.atan2(dx, -dz);
      list.forEach(u => { u.bodyAngle = ang; if (u.group) u.group.rotation.y = ang; });
      return new Promise(res => {
        let last = t0;
        const id = setInterval(() => {
          const tt = now(), dt = Math.min(0.1, tt - last); last = tt;
          for (const u of list) {
            if (u.isDead) continue;
            u.x += dx * v * dt; u.z += dz * v * dt; u.y = ground(u.x, u.z); u.speed = v;
            if (u.group) u.group.position.set(u.x, u.y, u.z);
          }
          if (tt - t0 >= sec) { clearInterval(id); list.forEach(u => { u.speed = 0; }); res(); }
        }, 33);
      });
    },
    drones: () => g._otherDrones ? [...g._otherDrones.values()] : [],
    // cảnh do kịch bản đặt: KHÔNG tự bay theo đạn (đạn pháo cầu vồng kéo máy lên mây — chỉ thấy trời xám), trừ khi kịch bản ghi shellP
    shot: (type, extra) => newShot(type, Object.assign({ shellP: 0, locked: true, noDrone: true }, extra || {})),
    slow: (scale, sec) => slowMo(scale, sec),
    // Ù TAI: tiếng chiến trường bị bóp nghẹt (bộ lọc ~900 Hz của game) trong sec giây rồi ập trở lại; kèm quay chậm
    shock(sec = 2.2) {
      const se = window.soundEngine;
      tlog('shock', { sec });
      slowMo(CALM ? 0.6 : 0.3, sec * 0.8, true);
      if (!se || !se.ctx || !se.muffleDry) return;
      const t = se.ctx.currentTime, d = se.muffleDry.gain, w = se.muffleWet.gain;
      for (const p of [d, w]) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
      d.linearRampToValueAtTime(0.03, t + 0.04); w.linearRampToValueAtTime(1, t + 0.04);
      d.setValueAtTime(0.03, t + sec); w.setValueAtTime(1, t + sec);
      d.linearRampToValueAtTime(1, t + sec + 0.45); w.linearRampToValueAtTime(0, t + sec + 0.45);
      se._shockUntil = t + sec + 0.45; se._shockLevel = 1;
    },
    // góc nhìn chủ quan (kính ngắm / màn hình UAV của xe người chơi): camera do game điều khiển
    pov(on) { TR.pov = !!on; if (on) TR.gFocus = null; else TR.holdN = Math.max(TR.holdN, 6); tlog('pov', { on: !!on }); },
    log: (what, o) => tlog('stage', Object.assign({ what }, o || {})),
    clear: (a, b) => clearView(a, b),
    rnd, ground, obstacleTop, sizeOf, cam
  };

  TR.newShot = (type, extra) => newShot(type, extra);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
