/**
 * BẢN ĐỒ TÁC CHIẾN (phím M) — toàn màn hình, phong cách bản đồ quân sự
 * - Nền địa hình dựng riêng: đổ bóng địa hình + đường đồng mức + đường sá, sông hồ, rừng, nhà (tông trầm, dễ đọc ký hiệu)
 * - Đơn vị theo ký hiệu NATO: ta = khung chữ nhật xanh, địch = hình thoi đỏ; nét đứt = vết radar / báo cáo; "?" = vị trí cuối
 * - Cứ điểm OBJ A/B/C: vòng tiến độ chiếm + màu phe giữ; vòng bo; tầm bắn có vạch chia hướng
 * - Nhấp vào xe địch đang hiện: KHÓA xe đó (như nhấp chuột vào xe trong màn hình 3D — nòng tự ngắm & đón đầu)
 * - Nhấp chỗ trống: chọn mục tiêu (khoảng cách & bắn tới được không hiện ngay tại mục tiêu) · Nhấp đúp: ngắm vào đó · Space: bắn
 * - Nhấp chuột phải: xe tự lái tới điểm đó (tự tìm đường) · Giữ chuột phải + kéo: kéo bản đồ
 * - Lăn chuột: phóng to quanh con trỏ · F: về xe · 0: toàn cảnh
 */
class TacticalMapController {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.modal = document.getElementById('tactical-map-modal');
    this.canvas = document.getElementById('tactical-map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = document.getElementById('map-crosshair-info');
    this.$ = id => document.getElementById(id);

    this.isDragging = false;
    this.measStart = null;
    this.measEnd = null;
    this.measStatus = null;
    this.flightT = null;
    this.view = { zoom: 1, cx: 0, cz: 0 };
    this.pan = null;
    this.mouse = null;
    this.dpr = 1;
    this.cssW = 1; this.cssH = 1;
    this.rangeCache = new Map();
    this.base = null;            // nền bản đồ tác chiến dựng sẵn cho bản đồ hiện tại
    this.ghosts = new Map();     // vị trí cuối cùng thấy địch
    this.wasKnown = new Map();

    this.initEvents();
  }

  // ---------------------------------------------------------------------------
  // SỰ KIỆN
  // ---------------------------------------------------------------------------
  initEvents() {
    const on = (id, ev, fn) => { const el = this.$(id); if (el) el.addEventListener(ev, fn); };
    on('close-map-btn', 'click', () => this.toggle(false));
    on('toggle-map-btn', 'click', () => this.toggle());
    on('btn-aow-menu', 'click', () => this.toggle(true));
    // Bản đồ nhỏ: nhấp trúng xe địch đang hiện -> khóa xe đó; nhấp chỗ khác -> mở bản đồ lớn
    on('aow-minimap-box', 'click', (e) => { if (!this.lockFromMinimap(e)) this.toggle(true); });
    // Bản đồ nhỏ: nhấp chuột phải -> xe tự lái tới điểm đó (không hiện menu chuột phải của trình duyệt)
    on('aow-minimap-box', 'contextmenu', (e) => { e.preventDefault(); this.driveFromMinimap(e); });
    on('tm-zoom-in', 'click', () => this.zoomAt(this.cssW / 2, this.cssH / 2, 1.4));
    on('tm-zoom-out', 'click', () => this.zoomAt(this.cssW / 2, this.cssH / 2, 1 / 1.4));
    on('tm-focus-me', 'click', () => this.focusPlayer());
    on('tm-fit', 'click', () => this.resetView());

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.mouse = null; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('dblclick', (e) => {
      // nhấp đúp vào xe địch: đã khóa ở lần nhấp đầu -> chỉ đóng bản đồ, giữ khóa
      const r = this.canvas.getBoundingClientRect();
      if (this.enemyAt(e.clientX - r.left, e.clientY - r.top)) { this.toggle(false); return; }
      const w = this.screenToWorld(e.clientX, e.clientY);
      // ngắm vào một điểm: nhả khóa xe (giống nhấp mặt đất trong màn hình 3D), nếu không tháp vẫn bám xe cũ
      if (this.game.lockedTarget) this.game.setLockedTarget(null);
      this.game.aimPlayerAtTarget(w.x, w.z);
      this.toggle(false);
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'm' || e.key === 'M') this.toggle();
      else if (!this.isOpen) return;
      else if (e.key === 'Escape') this.toggle(false);
      else if (e.code === 'Space') { e.preventDefault(); this.game.triggerPlayerFire(); }
      else if (e.code === 'KeyF') this.focusPlayer();
      else if (e.code === 'Digit0' || e.code === 'Numpad0') this.resetView();
      else if (e.key === '+' || e.key === '=') this.zoomAt(this.cssW / 2, this.cssH / 2, 1.4);
      else if (e.key === '-') this.zoomAt(this.cssW / 2, this.cssH / 2, 1 / 1.4);
    });
    window.addEventListener('resize', () => { if (this.isOpen) this.resizeCanvas(); });
  }

  toggle(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    if (this.isOpen) {
      this.modal.classList.remove('hidden');
      this.resizeCanvas();
      // gợi ý thao tác hiện lại vài giây mỗi lần mở bản đồ rồi tự mờ
      const hint = this.modal.querySelector('.tm-hint');
      if (hint) { hint.style.animation = 'none'; void hint.offsetWidth; hint.style.animation = ''; }
      if (window.soundEngine) window.soundEngine.setMapMuted(true);
    } else {
      this.modal.classList.add('hidden');
      if (this.tip) this.tip.classList.add('hidden');
      if (window.soundEngine) window.soundEngine.setMapMuted(false);
    }
  }

  resizeCanvas() {
    const el = this.canvas.parentElement;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = Math.max(1, el.clientWidth); this.cssH = Math.max(1, el.clientHeight);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.clampView();
  }

  // ---------------------------------------------------------------------------
  // TỌA ĐỘ (tỉ lệ đều, phóng to / kéo)
  // ---------------------------------------------------------------------------
  get worldSize() { return this.game.terrain ? this.game.terrain.width : MapGen.SIZE; }
  get k() { return (Math.min(this.cssW, this.cssH) - 40) / this.worldSize * this.view.zoom; }

  worldToScreen(wx, wz) {
    const k = this.k;
    return { x: this.cssW / 2 + (wx - this.view.cx) * k, y: this.cssH / 2 + (wz - this.view.cz) * k };
  }
  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return this.localToWorld(clientX - r.left, clientY - r.top);
  }
  localToWorld(sx, sy) {
    const k = this.k;
    return { x: this.view.cx + (sx - this.cssW / 2) / k, z: this.view.cz + (sy - this.cssH / 2) / k };
  }
  clampView() {
    const half = this.worldSize / 2, k = this.k;
    const vx = this.cssW / 2 / k, vz = this.cssH / 2 / k;
    this.view.cx = vx >= half ? 0 : Math.max(-half + vx, Math.min(half - vx, this.view.cx));
    this.view.cz = vz >= half ? 0 : Math.max(-half + vz, Math.min(half - vz, this.view.cz));
  }
  zoomAt(sx, sy, f) {
    const before = this.localToWorld(sx, sy);
    this.view.zoom = Math.max(1, Math.min(6, this.view.zoom * f));
    const k = this.k;
    this.view.cx = before.x - (sx - this.cssW / 2) / k;
    this.view.cz = before.z - (sy - this.cssH / 2) / k;
    this.clampView();
  }
  focusPlayer() {
    const p = this.game.player;
    if (!p) return;
    this.view.zoom = Math.max(this.view.zoom, 2.4);
    this.view.cx = p.x; this.view.cz = p.z;
    this.clampView();
  }
  resetView() { this.view = { zoom: 1, cx: 0, cz: 0 }; }

  // ---------------------------------------------------------------------------
  // CHUỘT: nhấp chọn mục tiêu (đo từ xe), Shift + kéo: đo 2 điểm, chuột phải: kéo bản đồ
  // ---------------------------------------------------------------------------
  onMouseDown(e) {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      // chuột phải: nhấp nhả tại chỗ = lái tự động tới đó; giữ & kéo = kéo bản đồ
      this.pan = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz, button: e.button, moved: false, t: performance.now() };
      return;
    }
    const w = this.screenToWorld(e.clientX, e.clientY);
    const p = this.game.player;
    // Nhấp trúng xe địch đang hiện trên bản đồ: khóa luôn xe đó
    if (!e.shiftKey && p && !p.isDead) {
      const r = this.canvas.getBoundingClientRect();
      const foe = this.enemyAt(e.clientX - r.left, e.clientY - r.top);
      if (foe) { this.lockFromMap(foe); return; }
    }
    this.measStart = (e.shiftKey || !p) ? { x: w.x, z: w.z } : { x: p.x, z: p.z, fromPlayer: true };
    this.measEnd = { x: w.x, z: w.z };
    this.isDragging = true;
    this.updateMeasurements(false);
  }
  onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (this.pan) {
      const k = this.k;
      if (Math.hypot(e.clientX - this.pan.x, e.clientY - this.pan.y) > 5) this.pan.moved = true;
      this.view.cx = this.pan.cx - (e.clientX - this.pan.x) / k;
      this.view.cz = this.pan.cz - (e.clientY - this.pan.y) / k;
      this.clampView();
      return;
    }
    if (this.isDragging) {
      const w = this.screenToWorld(e.clientX, e.clientY);
      this.measEnd = { x: w.x, z: w.z };
      this.updateMeasurements(false);
    }
  }
  onMouseUp(e) {
    if (this.pan) {
      const P = this.pan;
      this.pan = null;
      if (P.button === 2 && !P.moved && e && performance.now() - P.t < 600) {
        const w = this.screenToWorld(P.x, P.y);
        this.driveTo(w.x, w.z);
      }
      return;
    }
    if (this.isDragging) { this.isDragging = false; this.updateMeasurements(true); }
  }

  // Vị trí vẽ của xe địch trên bản đồ (vết radar vẽ ở chỗ radar bắt được, không phải vị trí thật) — null nếu không hiện
  shownPos(u) {
    const g = this.game, me = g.player;
    const TI = typeof TeamIntel !== 'undefined' ? TeamIntel : null;
    const lv = TI ? TI.knowledge(me, u) : 'direct';
    if (!lv) return null;
    if (lv === 'radar') { const c = TI.radarContact(me, u); if (c) return { x: c.x, z: c.z }; }
    return { x: u.x, z: u.z };
  }

  // Xe địch đang hiện trên bản đồ gần điểm nhấp (sx, sy: tọa độ trong khung canvas). Vùng bấm rộng hơn ký hiệu
  // (màn hình cảm ứng còn rộng hơn). Chỉ xe phe mình đang biết vị trí — xe ẩn không hiện nên không bấm trúng được.
  enemyAt(sx, sy) {
    const g = this.game, me = g.player;
    if (!me || !g.units) return null;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let best = null, bd = coarse ? 32 : 22;
    for (const u of g.units) {
      if (!g.canTarget(u)) continue;
      const pos = this.shownPos(u);
      if (!pos) continue;
      const s = this.worldToScreen(pos.x, pos.z);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // Nhấp lên bản đồ nhỏ góc màn hình (vẽ toàn bản đồ, tỉ lệ đều theo bề rộng canvas)
  lockFromMinimap(e) {
    const g = this.game, me = g.player, cv = document.getElementById('aow-minimap-canvas');
    if (!cv || !me || me.isDead || !g.units || !g.worldWidth) return false;
    const r = cv.getBoundingClientRect();
    if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
    const css = r.width / cv.width, sc = cv.width / g.worldWidth;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let best = null, bd = coarse ? 18 : 12;
    for (const u of g.units) {
      if (!g.canTarget(u)) continue;
      const pos = this.shownPos(u);
      if (!pos) continue;
      const d = Math.hypot((pos.x + g.worldWidth / 2) * sc * css - mx, (pos.z + g.worldDepth / 2) * sc * css - my);
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return false;
    this.lockFromMap(best);
    return true;
  }

  // Lái tự động tới điểm chọn trên bản đồ: cùng cơ chế chuột phải xuống đất trong màn hình 3D
  // (tự tìm đường, chỗ không vào được thì dời tới chỗ đi được gần nhất, W/A/S/D để hủy)
  driveTo(x, z) {
    const g = this.game, p = g.player;
    if (!p || p.isDead) return;
    g.setAutoDriveTarget(x, z);
    if (g.autoDrive) this.driveFx = { x: g.autoDrive.x, z: g.autoDrive.z, t: performance.now() };
  }

  driveFromMinimap(e) {
    const g = this.game, cv = document.getElementById('aow-minimap-canvas');
    if (!cv || !g.player || g.player.isDead || !g.worldWidth) return;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const css = r.width / cv.width, sc = cv.width / g.worldWidth;
    this.driveTo((e.clientX - r.left) / css / sc - g.worldWidth / 2, (e.clientY - r.top) / css / sc - g.worldDepth / 2);
  }

  // Đường lái tự động + dấu đích (cờ nhỏ, cự ly còn lại); vừa đặt đích thì có vòng sáng thu lại
  drawDrive(ctx) {
    const g = this.game, A = g.autoDrive, p = g.player;
    if (!A || !p || p.isDead) return;
    if (g.drawAutoDrivePath) g.drawAutoDrivePath(ctx, (x, z) => this.worldToScreen(x, z), true);
    const s = this.worldToScreen(A.x, A.z), now = performance.now();
    ctx.save();
    ctx.strokeStyle = '#00e5ff'; ctx.fillStyle = 'rgba(0, 229, 255, 0.85)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 20); ctx.lineTo(s.x + 12, s.y - 16); ctx.lineTo(s.x, s.y - 12); ctx.closePath(); ctx.fill();
    const fx = this.driveFx;
    if (fx && now - fx.t < 500) {
      const a = (now - fx.t) / 500;
      ctx.globalAlpha = 1 - a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 8 + (1 - a) * 30, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    const d = Math.round(Math.hypot(A.x - p.x, A.z - p.z));
    this.tag(ctx, `ĐANG TỚI · ${d} m`, s.x, s.y + 18, '#00e5ff');
  }

  // Khóa xe địch chọn trên bản đồ: cùng cơ chế với nhấp chuột vào xe trong màn hình 3D (tiếng khóa, khung khóa HUD)
  lockFromMap(u) {
    const g = this.game, p = g.player;
    this.measStart = this.measEnd = null; this.measStatus = null; this.flightT = null;
    const d = Math.hypot(u.x - p.x, u.z - p.z);
    if (d > g.lockRangeFor(p)) {
      g.addCombatLog(`[[alert-triangle]] Xe địch ở quá xa (${Math.round(d)}M), chưa khóa được`, 'alert');
      this.lockFx = { id: u.id, t: performance.now(), fail: true };
      return;
    }
    g.setLockedTarget(u, true);
    this.lockFx = { id: u.id, t: performance.now() };
  }

  // Tầm bắn theo loại xe + đạn (mô hình đường đạn thật, mặt đất phẳng) — tính một lần
  rangeFor(unit) {
    const B = this.game.ballistics;
    if (!unit || !B) return { min: 0, max: 0, kind: 'gun' };
    const ammo = unit.selectedAmmo || 'NORMAL';
    const key = unit.tankType + '|' + ammo;
    if (this.rangeCache.has(key)) return this.rangeCache.get(key);
    let res;
    const cap = B.maxTravelFor ? B.maxTravelFor(ammo, unit) : 0;
    if (cap > 0) res = { min: 0, max: cap, kind: 'direct' };
    else {
      const flat = { getElevationAt: () => 0, checkHorseshoeCollision: () => ({ hit: false }), waterSurfaceAt: () => null };
      const probe = { tankType: unit.tankType, selectedAmmo: ammo };
      const arty = unit.tankType === 'ARTILLERY';
      const elMax = B.maxElevationFor ? B.maxElevationFor(unit) : 85;
      let max = 0, min = Infinity;
      // lựu pháo: quét đủ 5 liều phóng (liều nhỏ bắn gần, liều đầy bắn xa)
      for (const ch of (arty ? [1, 2, 3, 4, 5] : [1])) {
        for (let el = arty ? 25 : -2; el <= elMax; el += 1) {
          const d = B.predictTrajectoryImpact(0, 0, 0, 0, el, ch, flat, probe).distance;
          if (d > max) max = d;
          if (arty && d < min) min = d;
        }
      }
      // pháo tăng: đạn bay rất xa nhưng máy tính hỏa lực chỉ bắn trong tầm hiệu quả (số liệu thật x tỉ lệ game)
      if (!arty && B.maxRangeFor) max = Math.min(max, B.maxRangeFor(unit));
      res = { min: arty ? Math.round(min) : 0, max: Math.round(max), kind: arty ? 'indirect' : 'gun' };
      // lựu pháo hạ nòng bắn thẳng được địch ở gần: vùng dưới tầm cầu vồng vẫn bắn tới (trừ sát thân xe)
      const AD = typeof BallisticsSystem3D !== 'undefined' && BallisticsSystem3D.ARTY_DIRECT;
      if (arty && AD) { res.lobMin = res.min; res.min = AD.min; res.directMax = AD.max; }
    }
    this.rangeCache.set(key, res);
    return res;
  }

  updateMeasurements(solve) {
    this.measStatus = null;
    if (solve) this.measDirect = null;
    if (!this.measStart || !this.measEnd) return;
    const dist = Math.hypot(this.measEnd.x - this.measStart.x, this.measEnd.z - this.measStart.z);
    const p = this.game.player;
    if (dist < 10 || !p || !this.measStart.fromPlayer) { this.flightT = null; return; }
    const R = this.rangeFor(p);
    const ok = dist <= R.max && dist >= R.min;
    this.measStatus = ok ? 'ok' : (dist < R.min ? 'near' : 'far');
    if (!solve) return;
    this.flightT = null;
    if (!ok) return;
    const B = this.game.ballistics;
    if (R.kind === 'direct') {
      const v = B.muzzleVelocity(p.selectedAmmo, true, p) * (B.bulletSpeedMultiplier || 1);
      this.flightT = v > 0 ? dist / v : null;
    } else {
      const s = B.solveAimingForTarget(p.x, p.y, p.z, this.measEnd.x, this.measEnd.z, this.game.terrain, p);
      if (s) {
        const pr = B.predictTrajectoryImpact(p.x, p.y, p.z, s.azimuth, s.elevation, s.charge || 1, this.game.terrain, { tankType: p.tankType, selectedAmmo: p.selectedAmmo });
        this.flightT = (pr.flightTime || 0) / (B.bulletSpeedMultiplier || 1);
        this.measDirect = p.tankType === 'ARTILLERY' ? !!s.direct : null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // NỀN BẢN ĐỒ TÁC CHIẾN (dựng 1 lần cho mỗi bản đồ)
  // ---------------------------------------------------------------------------
  buildBase() {
    const T = this.game.terrain, M = T.map;
    const N = 1536, size = T.width, half = size / 2, S = T.segments, NN = S + 1, H = T.heightData;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d');
    const cell = size / S;
    const hAt = (x, z) => {
      const gx = Math.max(0, Math.min(S - 1e-4, (x + half) / cell)), gz = Math.max(0, Math.min(S - 1e-4, (z + half) / cell));
      const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * NN + ix;
      return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fz) + (H[i + NN] * (1 - fx) + H[i + NN + 1] * fx) * fz;
    };
    let hmin = Infinity, hmax = -Infinity;
    for (let i = 0; i < H.length; i++) { const v = H[i]; if (v < hmin) hmin = v; if (v > hmax) hmax = v; }
    const water = !!(M.river || (M.lakes && M.lakes.length));
    // 1. Đổ bóng địa hình + thang màu theo độ cao (tông trầm, ít bão hòa)
    const img = g.createImageData(N, N), D = img.data;
    const px = size / N;
    const L = [-0.55, 0.62, -0.55]; const ll = Math.hypot(L[0], L[1], L[2]); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const ramp = [[38, 48, 44], [58, 70, 58], [84, 90, 72], [118, 116, 96], [150, 146, 128]];
    const rowH = new Float32Array(N + 1), prevRow = new Float32Array(N + 1);
    for (let x = 0; x <= N; x++) prevRow[x] = hAt(x * px - half, -half);
    for (let y = 0; y < N; y++) {
      const wz = (y + 1) * px - half;
      for (let x = 0; x <= N; x++) rowH[x] = hAt(x * px - half, wz);
      for (let x = 0; x < N; x++) {
        const h = (prevRow[x] + prevRow[x + 1] + rowH[x] + rowH[x + 1]) * 0.25;
        const dx = ((prevRow[x + 1] + rowH[x + 1]) - (prevRow[x] + rowH[x])) * 0.5 / px;
        const dz = ((rowH[x] + rowH[x + 1]) - (prevRow[x] + prevRow[x + 1])) * 0.5 / px;
        const nl = Math.hypot(dx, 1, dz);
        const lit = Math.max(0, (-dx * L[0] + L[1] - dz * L[2]) / nl);
        const shade = 0.52 + 0.62 * lit;
        const t = (h - hmin) / Math.max(1, hmax - hmin) * (ramp.length - 1);
        const i0 = Math.min(ramp.length - 2, Math.max(0, t | 0)), f = Math.min(1, Math.max(0, t - i0));
        let r = ramp[i0][0] + (ramp[i0 + 1][0] - ramp[i0][0]) * f;
        let gg = ramp[i0][1] + (ramp[i0 + 1][1] - ramp[i0][1]) * f;
        let b = ramp[i0][2] + (ramp[i0 + 1][2] - ramp[i0][2]) * f;
        if (water && h < 0.2) { r = 30; gg = 48; b = 62; }
        const kk = (y * N + x) * 4;
        D[kk] = Math.min(255, r * shade); D[kk + 1] = Math.min(255, gg * shade); D[kk + 2] = Math.min(255, b * shade); D[kk + 3] = 255;
      }
      prevRow.set(rowH);
    }
    g.putImageData(img, 0, 0);
    const P = v => (v + half) / size * N, sc = N / size;

    // 2. Đường đồng mức (lưới nội suy x2 -> marching squares), cách 10 m, đậm mỗi 50 m
    const G = S * 2, GN = G + 1, gc = size / G;
    const hg = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) hg[j * GN + i] = hAt(i * gc - half, j * gc - half);
    const step = 10, major = 50;
    const minorP = new Path2D(), majorP = new Path2D();
    const cut = (ax, az, av, bx, bz, bv, lv) => { const t = (lv - av) / (bv - av); return [ax + (bx - ax) * t, az + (bz - az) * t]; };
    const CASES = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
    for (let lv = Math.ceil(hmin / step) * step; lv <= hmax; lv += step) {
      if (water && lv <= 0) continue;
      const path = lv % major === 0 ? majorP : minorP;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const a = hg[j * GN + i], b = hg[j * GN + i + 1], d = hg[(j + 1) * GN + i], cc = hg[(j + 1) * GN + i + 1];
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        // cạnh: 0 trên, 1 phải, 2 dưới, 3 trái
        const edge = q => q === 0 ? cut(i, j, a, i + 1, j, b, lv) : q === 1 ? cut(i + 1, j, b, i + 1, j + 1, cc, lv)
          : q === 2 ? cut(i, j + 1, d, i + 1, j + 1, cc, lv) : cut(i, j, a, i, j + 1, d, lv);
        for (const [ea, eb] of CASES[idx]) {
          const A = edge(ea), B = edge(eb);
          path.moveTo(A[0] * gc * sc, A[1] * gc * sc); path.lineTo(B[0] * gc * sc, B[1] * gc * sc);
        }
      }
    }
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(214, 200, 160, 0.16)'; g.lineWidth = 0.8; g.stroke(minorP);
    g.strokeStyle = 'rgba(232, 214, 168, 0.34)'; g.lineWidth = 1.3; g.stroke(majorP);

    // 3. Sông hồ
    if (M.river) {
      g.strokeStyle = '#2a4458';
      BattleTerrain3D.strokeRiver(g, M.river, P, sc);
    }
    for (const Lk of M.lakes || []) {
      g.fillStyle = '#2a4458'; g.beginPath(); g.arc(P(Lk.x), P(Lk.z), Lk.r * sc, 0, Math.PI * 2); g.fill();
    }
    // 4. Rừng: chấm cây
    g.fillStyle = 'rgba(24, 40, 26, 0.75)';
    for (const t of M.trees || []) { if (t.kind === 'cactus' || t.kind === 'deadTree') continue; g.fillRect(P(t.x) - 1, P(t.z) - 1, 2.2, 2.2); }
    // 5. Đường: viền tối + lòng đường sáng
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const rd of M.roads || []) {
        g.strokeStyle = pass ? (rd.kind === 'asphalt' ? '#b9b4a2' : '#a89c7e') : 'rgba(10, 12, 12, 0.7)';
        g.lineWidth = Math.max(pass ? 1.4 : 3, rd.width * sc * (pass ? 0.55 : 0.9));
        g.beginPath(); rd.pts.forEach((p, i) => i ? g.lineTo(P(p[0]), P(p[1])) : g.moveTo(P(p[0]), P(p[1]))); g.stroke();
      }
    }
    for (const b of T.bridges || []) {
      g.save(); g.translate(P(b.x), P(b.z)); g.rotate(-b.angle);
      g.fillStyle = '#d2cdbb'; g.fillRect(-b.width / 2 * sc, -b.length / 2 * sc, b.width * sc, b.length * sc);
      g.restore();
    }
    // 6. Nhà: khối đặc
    for (const bd of T.buildings || []) {
      const R = bd.ref; if (!R) continue;
      g.save(); g.translate(P(R.x), P(R.z)); g.rotate(-R.angle);
      g.fillStyle = '#20262c'; g.strokeStyle = 'rgba(200, 200, 190, 0.45)'; g.lineWidth = 0.8;
      g.fillRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      g.strokeRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      g.restore();
    }
    // 7. Cứ điểm bê tông
    if (T.propSet) T.propSet.drawOnMap(g, P, sc);
    if (T.strongholdSet) T.strongholdSet.drawOnMap(g, P, sc, 'tac');
    if (T.landmarkSet) T.landmarkSet.drawOnMap(g, P, sc, true);
    // 8. Phủ tối ngoài lòng thung lũng (sườn vành núi xe không tới được) theo đúng hình dạng vùng chiến đấu
    BattleTerrain3D.shadeOutside(g, M, P, N);
    this.base = { canvas: c, map: M };
  }

  // ---------------------------------------------------------------------------
  // VẼ
  // ---------------------------------------------------------------------------
  render() {
    if (!this.isOpen) return;
    const g = this.game, ctx = this.ctx, T = g.terrain;
    if (!T || !T.map) return;
    const el = this.canvas.parentElement;
    if (el && (Math.abs(el.clientWidth - this.cssW) > 1 || Math.abs(el.clientHeight - this.cssH) > 1)) this.resizeCanvas();
    if (!this.base || this.base.map !== T.map) this.buildBase();
    if (this.measStart && this.measStart.fromPlayer && g.player) { this.measStart.x = g.player.x; this.measStart.z = g.player.z; this.updateMeasurements(false); }
    const W = this.cssW, Hh = this.cssH, k = this.k, half = this.worldSize / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0d0c';
    ctx.fillRect(0, 0, W, Hh);
    const o = this.worldToScreen(-half, -half), S = this.worldSize * k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base.canvas, o.x, o.y, S, S);

    this.drawGrid(ctx, o, S);
    this.drawBushes(ctx, k);
    ctx.save(); ctx.translate(o.x, o.y); g.zone.renderOnTacticalMap(ctx, k); ctx.restore();
    ctx.save(); ctx.translate(o.x, o.y); g.radar.renderOnTacticalMap(ctx, k); ctx.restore();
    this.drawObjectives(ctx, k);
    this.drawCrates(ctx);
    this.drawAirdrop(ctx);
    if (g.player && !g.player.isDead) this.drawRanges(ctx, k);
    this.drawIntel(ctx, k);
    this.drawDrive(ctx);
    if (g.player) this.drawPlayer(ctx);
    this.drawLock(ctx);
    this.drawTarget(ctx);
    this.drawFrame(ctx, o, S, k, W, Hh);
    this.updateTip();
  }

  // Lưới ô 450 m; khi phóng to thêm dấu thập giữa ô
  drawGrid(ctx, o, S) {
    const n = 8, cellPx = S / n;
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 210, 192, 0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      ctx.moveTo(o.x + i * cellPx, o.y); ctx.lineTo(o.x + i * cellPx, o.y + S);
      ctx.moveTo(o.x, o.y + i * cellPx); ctx.lineTo(o.x + S, o.y + i * cellPx);
    }
    ctx.stroke();
    if (this.view.zoom >= 2) {
      ctx.strokeStyle = 'rgba(200, 210, 192, 0.16)';
      ctx.beginPath();
      for (let i = 0; i <= n * 2; i++) for (let j = 0; j <= n * 2; j++) {
        if (i % 2 === 0 && j % 2 === 0) continue;
        const x = o.x + i * cellPx / 2, y = o.y + j * cellPx / 2;
        if (x < -10 || y < -10 || x > this.cssW + 10 || y > this.cssH + 10) continue;
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Bụi rậm: gạch chéo trong vòng (ký hiệu thảm thực vật che khuất)
  drawBushes(ctx, k) {
    const B = this.game.terrain.bushClusters;
    if (!B) return;
    ctx.save();
    for (const b of B) {
      const p = this.worldToScreen(b.x, b.z), r = b.radius * k;
      if (p.x + r < 0 || p.y + r < 0 || p.x - r > this.cssW || p.y - r > this.cssH) continue;
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(120, 190, 110, 0.3)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let d = -r * 2; d < r * 2; d += 5) { ctx.moveTo(p.x + d - r, p.y - r); ctx.lineTo(p.x + d + r, p.y + r); }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(140, 210, 120, 0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  objectives() {
    const g = this.game, set = g.terrain && g.terrain.strongholdSet;
    if (set && set.items.length) {
      return set.items.map(K => ({
        id: K.id, x: K.x, z: K.z, r: Strongholds.S.HB + Strongholds.S.RUN * 0.7,
        owner: K.owner, progress: Math.abs(K.capture || 0) / 100, team: (K.capture || 0) > 0 ? 'BLUE' : (K.capture || 0) < 0 ? 'RED' : null,
        contested: !!K.contested
      }));
    }
    return (g.capturePoints || []).map(cp => ({
      id: cp.id, x: cp.x, z: cp.z, r: cp.radius,
      owner: cp.owner || null,
      progress: cp.owner ? (cp.holdTimer || 0) / (cp.holdGoal || 60) : (cp.captureProgress || 0) / 100,
      team: cp.owner || cp.capTeam || null,
      contested: !!cp.isDisputed
    }));
  }
  teamCol(team, a = 1) { return team === 'BLUE' ? `rgba(95, 176, 220, ${a})` : team === 'RED' ? `rgba(224, 103, 92, ${a})` : `rgba(231, 166, 58, ${a})`; }

  drawObjectives(ctx, k) {
    const t = performance.now() / 1000;
    for (const ob of this.objectives()) {
      const p = this.worldToScreen(ob.x, ob.z);
      const R = Math.max(16, ob.r * k);
      const col = ob.contested ? `rgba(231, 166, 58, ${0.6 + 0.4 * Math.sin(t * 8)})` : this.teamCol(ob.owner, 0.95);
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (ob.team && ob.progress > 0.005) {
        ctx.strokeStyle = this.teamCol(ob.team, 0.95); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ob.progress)); ctx.stroke();
      }
      const label = 'OBJ ' + ob.id;
      ctx.font = 'bold 12px Share Tech Mono, monospace';
      const w = ctx.measureText(label).width + 14, h = 18, x = p.x - w / 2, y = Math.max(22, p.y - R - h - 6);   // không bị khuất ở mép trên khi phóng to
      ctx.fillStyle = 'rgba(10, 13, 12, 0.88)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = this.teamCol(ob.owner, 1); ctx.fillRect(x, y, 3, h);
      ctx.fillStyle = '#e8edf2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x + 1.5, y + h / 2 + 0.5);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6); ctx.stroke();
      ctx.restore();
    }
  }

  drawCrates(ctx) {
    const C = this.game.supplyCrates;
    if (!C) return;
    ctx.save();
    for (const c of C) {
      if (!c.active) continue;
      const p = this.worldToScreen(c.x, c.z);
      if (p.x < -10 || p.y < -10 || p.x > this.cssW + 10 || p.y > this.cssH + 10) continue;
      // hòm tiếp tế: dấu cộng nhỏ, mờ (không lấn át đơn vị & mục tiêu)
      ctx.strokeStyle = 'rgba(231, 166, 58, 0.65)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
    }
    ctx.restore();
  }

  drawAirdrop(ctx) {
    const a = this.game.airdrop;
    if (!a || a.collected) return;
    const p = this.worldToScreen(a.x, a.z), t = performance.now() / 1000;
    ctx.save();
    ctx.strokeStyle = '#e7a63a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y + 4); ctx.lineTo(p.x, p.y - 5); ctx.lineTo(p.x + 5, p.y + 4); ctx.stroke();
    ctx.restore();
  }

  // Vòng tầm bắn: nét mảnh + vạch chia mỗi 30°; lựu pháo có vòng tối thiểu
  drawRanges(ctx, k) {
    const p = this.game.player, s = this.worldToScreen(p.x, p.z), R = this.rangeFor(p);
    const ring = (r, col, dash) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();
      for (let a = 0; a < 360; a += 30) {
        const rad = a * Math.PI / 180, Lt = a % 90 === 0 ? 9 : 5;
        ctx.moveTo(s.x + Math.sin(rad) * r, s.y - Math.cos(rad) * r);
        ctx.lineTo(s.x + Math.sin(rad) * (r - Lt), s.y - Math.cos(rad) * (r - Lt));
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.fillStyle = 'rgba(95, 176, 220, 0.045)';
    ctx.beginPath(); ctx.arc(s.x, s.y, R.max * k, 0, Math.PI * 2);
    if (R.min > 0) ctx.arc(s.x, s.y, R.min * k, 0, Math.PI * 2, true);
    ctx.fill();
    ring(R.max * k, 'rgba(95, 176, 220, 0.75)');
    this.tag(ctx, `${R.max} m`, s.x, s.y - R.max * k - 10, 'rgba(95, 176, 220, 1)');
    if (R.lobMin) {
      // lựu pháo: trong vòng này hạ nòng bắn thẳng, ngoài vòng bắn cầu vồng
      ring(R.lobMin * k, 'rgba(95, 176, 220, 0.45)', [3, 5]);
      if (R.lobMin * k > 30) this.tag(ctx, `BẮN THẲNG < ${R.lobMin} m`, s.x, s.y + R.lobMin * k + 11, 'rgba(140, 200, 235, 1)');
    }
    if (R.min > 0 && R.min * k > 6) {
      ring(R.min * k, 'rgba(255, 120, 90, 0.75)', [4, 4]);
      if (!R.lobMin) this.tag(ctx, `MIN ${R.min} m`, s.x, s.y + R.min * k + 11, 'rgba(255, 140, 110, 1)');
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // ĐƠN VỊ (ký hiệu NATO giản lược)
  // ---------------------------------------------------------------------------
  drawSymbol(ctx, x, y, type, opts = {}) {
    const friendly = opts.friendly;
    const col = friendly ? '#5fb0dc' : '#e0675c';
    const fill = friendly ? 'rgba(95, 176, 220, 0.28)' : 'rgba(224, 103, 92, 0.28)';
    const s = opts.size || 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.fillStyle = fill;
    if (opts.uncertain) ctx.setLineDash([3, 2]);
    ctx.beginPath();
    if (friendly) ctx.rect(-s * 1.35, -s * 0.9, s * 2.7, s * 1.8);
    else { ctx.moveTo(0, -s * 1.35); ctx.lineTo(s * 1.35, 0); ctx.lineTo(0, s * 1.35); ctx.lineTo(-s * 1.35, 0); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.3; ctx.strokeStyle = '#eef6fb'; ctx.fillStyle = '#eef6fb';
    const e = s * 0.55;
    if (type === 'SCOUT') { ctx.beginPath(); ctx.moveTo(-e * 1.2, e * 0.8); ctx.lineTo(e * 1.2, -e * 0.8); ctx.stroke(); }   // trinh sát
    else {
      ctx.beginPath(); ctx.ellipse(0, 0, e * 1.25, e * 0.6, 0, 0, Math.PI * 2); ctx.stroke();                         // thiết giáp
      if (type === 'ARTILLERY') { ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill(); }                    // pháo binh
      if (type === 'GATLING') { ctx.beginPath(); ctx.moveTo(-2, -e * 0.6); ctx.lineTo(-2, e * 0.6); ctx.moveTo(2, -e * 0.6); ctx.lineTo(2, e * 0.6); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawIntel(ctx, k) {
    const g = this.game, me = g.player;
    if (!me || !g.units) return;
    const TI = typeof TeamIntel !== 'undefined' ? TeamIntel : null;
    const now = performance.now() / 1000;
    ctx.save();
    if (!me.isDead && TI) {
      const s = this.worldToScreen(me.x, me.z);
      ctx.strokeStyle = 'rgba(232, 240, 245, 0.28)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(s.x, s.y, TI.sightRange(me) * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (TI.hasRadar(me)) {
        const R = TI.radarRange(me) * k, a = (me.radarSweep || 0) - Math.PI / 2;
        const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
        gr.addColorStop(0, 'rgba(110, 231, 183, 0)'); gr.addColorStop(1, 'rgba(110, 231, 183, 0.22)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, R, a - 0.45, a); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.stroke();
      }
    }
    const zoomLbl = this.view.zoom >= 1.8;
    const code = { ALL_ROUNDER: 'TK', GATLING: 'AD', ARTILLERY: 'SPG', SCOUT: 'RCN' };
    for (const u of g.units) {
      if (u === me) continue;
      if (u.isDead) { this.ghosts.delete(u.id); continue; }
      const ally = u.team === me.team;
      const lv = ally ? 'direct' : (TI ? TI.knowledge(me, u) : 'direct');
      if (!ally) {
        if (lv) { this.wasKnown.set(u.id, now); this.ghosts.delete(u.id); }
        else if (this.wasKnown.has(u.id) && now - this.wasKnown.get(u.id) < 0.3 && !this.ghosts.has(u.id)) this.ghosts.set(u.id, { x: u.x, z: u.z, t: now });
      }
      if (!lv) continue;
      let x = u.x, z = u.z;
      if (lv === 'radar' && TI) { const c = TI.radarContact(me, u); if (c) { x = c.x; z = c.z; } }
      const s = this.worldToScreen(x, z);
      if (s.x < -20 || s.y < -20 || s.x > this.cssW + 20 || s.y > this.cssH + 20) continue;
      this.drawSymbol(ctx, s.x, s.y, u.tankType, { friendly: ally, uncertain: lv === 'radar' || lv === 'report' });
      if (lv === 'report') {
        ctx.strokeStyle = 'rgba(231, 166, 58, 0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, 17 + Math.sin(now * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (zoomLbl) {
        ctx.fillStyle = ally ? 'rgba(160, 225, 245, 0.9)' : 'rgba(255, 150, 150, 0.9)';
        ctx.font = '10px Share Tech Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(code[u.tankType] || '', s.x + 15, s.y);
      }
    }
    for (const [id, gh] of this.ghosts) {
      const age = now - gh.t;
      if (age > 6) { this.ghosts.delete(id); continue; }
      const s = this.worldToScreen(gh.x, gh.z), a = 1 - age / 6;
      ctx.strokeStyle = `rgba(255, 120, 100, ${0.7 * a})`; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x + 11, s.y); ctx.lineTo(s.x, s.y + 11); ctx.lineTo(s.x - 11, s.y); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255, 140, 120, ${0.85 * a})`; ctx.font = 'bold 11px Share Tech Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', s.x, s.y + 0.5);
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const g = this.game, p = g.player, s = this.worldToScreen(p.x, p.z);
    if (!p.isDead) {
      const pred = g.ballistics.predictTrajectoryImpact(p.x, p.y, p.z, p.azimuth, p.elevation, p.charge, g.terrain, p);
      const imp = this.worldToScreen(pred.impactX, pred.impactZ);
      const wall = pred.hitType === 'WALL';
      ctx.save();
      ctx.strokeStyle = wall ? 'rgba(224, 103, 92, 0.7)' : 'rgba(231, 166, 58, 0.7)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(imp.x, imp.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = wall ? '#e0675c' : '#e7a63a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(imp.x, imp.y, 6, 0, Math.PI * 2);
      ctx.moveTo(imp.x - 10, imp.y); ctx.lineTo(imp.x - 6, imp.y); ctx.moveTo(imp.x + 6, imp.y); ctx.lineTo(imp.x + 10, imp.y);
      ctx.moveTo(imp.x, imp.y - 10); ctx.lineTo(imp.x, imp.y - 6); ctx.moveTo(imp.x, imp.y + 6); ctx.lineTo(imp.x, imp.y + 10);
      ctx.stroke();
      ctx.restore();
    }
    this.drawSymbol(ctx, s.x, s.y, p.tankType, { friendly: true, size: 10 });
    ctx.save();
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 1.5;
    const b = 21, L = 6;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(s.x + sx * b, s.y + sy * (b - L)); ctx.lineTo(s.x + sx * b, s.y + sy * b); ctx.lineTo(s.x + sx * (b - L), s.y + sy * b);
    }
    ctx.stroke();
    const br = (p.azimuth * Math.PI) / 180;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x + Math.sin(br) * 14, s.y - Math.cos(br) * 14); ctx.lineTo(s.x + Math.sin(br) * 30, s.y - Math.cos(br) * 30); ctx.stroke();
    ctx.restore();
  }

  // Xe địch đang khóa: khung khóa đỏ xoay chậm + đường nối từ xe mình + cự ly; vừa khóa thì có vòng sáng thu lại
  drawLock(ctx) {
    const g = this.game, p = g.player, T = g.lockedTarget, now = performance.now();
    const fx = this.lockFx && now - this.lockFx.t < 450 ? this.lockFx : null;
    if (fx && fx.fail) {
      const u = (g.units || []).find(v => v.id === fx.id), pos = u && this.shownPos(u);
      if (pos) {
        const s = this.worldToScreen(pos.x, pos.z);
        ctx.save(); ctx.strokeStyle = `rgba(224, 103, 92, ${1 - (now - fx.t) / 450})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - 9, s.y - 9); ctx.lineTo(s.x + 9, s.y + 9); ctx.moveTo(s.x + 9, s.y - 9); ctx.lineTo(s.x - 9, s.y + 9); ctx.stroke();
        ctx.restore();
      }
    }
    if (!p || p.isDead || !T || T.isDead) return;
    const pos = this.shownPos(T);
    if (!pos) return;
    const s = this.worldToScreen(pos.x, pos.z), ps = this.worldToScreen(p.x, p.z);
    const manual = !!g._manualAim;
    const col = manual ? '#e7a63a' : '#ff4d4d';
    ctx.save();
    ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.translate(s.x, s.y);
    ctx.rotate(now / 1600);
    ctx.lineWidth = 2;
    const r = 19, L = 7;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(sx * r, sy * (r - L)); ctx.lineTo(sx * r, sy * r); ctx.lineTo(sx * (r - L), sy * r);
    }
    ctx.stroke();
    if (fx && fx.id === T.id && !fx.fail) {
      const a = (now - fx.t) / 450;
      ctx.globalAlpha = 1 - a; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 19 + (1 - a) * 34, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    const d = Math.round(Math.hypot(T.x - p.x, T.z - p.z));
    this.tag(ctx, manual ? `${d} m · TAB: BÁM LẠI` : `ĐÃ KHÓA · ${d} m`, s.x, s.y - 34, col, true, 'lock');
  }

  // Mục tiêu đã chọn: đường ngắm + khung góc + kết luận ngay cạnh mục tiêu
  drawTarget(ctx) {
    if (!this.measStart || !this.measEnd) return;
    const s = this.worldToScreen(this.measStart.x, this.measStart.z);
    const e = this.worldToScreen(this.measEnd.x, this.measEnd.z);
    if (Math.hypot(e.x - s.x, e.y - s.y) < 4) return;
    const st = this.measStatus;
    const col = st === 'ok' ? '#8fc46f' : st ? '#e0675c' : '#5fb0dc';
    ctx.save();
    ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(e.x, e.y);
    ctx.lineWidth = 1.6;
    const r = 12, L = 5;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(sx * r, sy * (r - L)); ctx.lineTo(sx * r, sy * r); ctx.lineTo(sx * (r - L), sy * r);
    }
    ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.moveTo(0, -3); ctx.lineTo(0, 3);
    ctx.stroke();
    ctx.restore();
    const dist = Math.round(Math.hypot(this.measEnd.x - this.measStart.x, this.measEnd.z - this.measStart.z));
    const how = st === 'ok' && this.measDirect !== null && this.measDirect !== undefined ? (this.measDirect ? ' · BẮN THẲNG' : ' · CẦU VỒNG') : '';
    const verdict = st === 'ok' ? `${dist} m${this.flightT ? ' · ' + this.flightT.toFixed(1) + 's' : ''}${how}`
      : st === 'far' ? `${dist} m · QUÁ XA` : st === 'near' ? `${dist} m · QUÁ GẦN` : `${dist} m`;
    const icon = st === 'ok' ? 'check' : (st === 'far' || st === 'near') ? 'x' : null;
    this.tag(ctx, verdict, e.x, e.y + 24, col, true, icon);
  }

  // Khung: thước vạch 100 m + mã ô A–H / 1–8 trên mép, góc khung kiểu ống ngắm, thước tỉ lệ, hướng Bắc
  drawFrame(ctx, o, S, k, W, H) {
    ctx.save();
    const n = 8, cellPx = S / n;
    const top = Math.max(o.y, 0), left = Math.max(o.x, 0);
    const x0r = Math.max(0, o.x), x1r = Math.min(W, o.x + S), y0r = Math.max(0, o.y), y1r = Math.min(H, o.y + S);
    ctx.fillStyle = 'rgba(10, 13, 12, 0.82)';
    ctx.fillRect(x0r, top, x1r - x0r, 16);
    ctx.fillRect(left, y0r, 16, y1r - y0r);
    ctx.strokeStyle = 'rgba(200, 225, 240, 0.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 100 * k;
    for (let i = 0; i * step <= S + 0.5; i++) {
      const x = o.x + i * step, y = o.y + i * step, Lx = i % 5 === 0 ? 6 : 3;
      if (x >= left + 16 && x <= W) { ctx.moveTo(x, top + 16); ctx.lineTo(x, top + 16 - Lx); }
      if (y >= top + 16 && y <= H) { ctx.moveTo(left + 16, y); ctx.lineTo(left + 16 - Lx, y); }
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(220, 235, 245, 0.85)'; ctx.font = 'bold 10px Share Tech Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const cx = o.x + (i + 0.5) * cellPx, cy = o.y + (i + 0.5) * cellPx;
      if (cx > left + 16 && cx < W) ctx.fillText(String.fromCharCode(65 + i), cx, top + 7);
      if (cy > top + 16 && cy < H) ctx.fillText(String(i + 1), left + 8, cy);
    }
    ctx.strokeStyle = 'rgba(95, 176, 220, 0.7)'; ctx.lineWidth = 2;
    const m = 8, Lc = 26;
    ctx.beginPath();
    ctx.moveTo(m, m + Lc); ctx.lineTo(m, m); ctx.lineTo(m + Lc, m);
    ctx.moveTo(W - m - Lc, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + Lc);
    ctx.moveTo(W - m, H - m - Lc); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m - Lc, H - m);
    ctx.moveTo(m + Lc, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, H - m - Lc);
    ctx.stroke();
    const steps = [50, 100, 200, 250, 500, 1000];
    let mm = steps[0];
    for (const v of steps) if (v * k <= 140) mm = v;
    const Ls = mm * k, sx0 = W - Ls - 70, sy0 = H - 26;
    ctx.strokeStyle = '#e8f1f6'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx0, sy0 - 5); ctx.lineTo(sx0, sy0); ctx.lineTo(sx0 + Ls, sy0); ctx.lineTo(sx0 + Ls, sy0 - 5);
    ctx.moveTo(sx0 + Ls / 2, sy0); ctx.lineTo(sx0 + Ls / 2, sy0 - 3); ctx.stroke();
    ctx.fillStyle = '#e8f1f6'; ctx.font = '11px Share Tech Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${mm} m`, sx0 + Ls + 8, sy0 - 1);
    const nx = W - 34, ny = H - 70;
    ctx.strokeStyle = 'rgba(232, 241, 246, 0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(nx, ny, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e0675c';
    ctx.beginPath(); ctx.moveTo(nx, ny - 11); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx - 4, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(232, 241, 246, 0.8)';
    ctx.beginPath(); ctx.moveTo(nx, ny + 11); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx - 4, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8f1f6'; ctx.font = 'bold 9px Share Tech Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny - 21);
    ctx.restore();
  }

  // Nhãn chữ có khung; icon (tùy chọn) là tên icon Tabler vẽ trước chữ
  tag(ctx, text, x, y, color, strong, icon) {
    ctx.save();
    const font = (strong ? 'bold 12px' : '11px') + ' Share Tech Mono, monospace';
    const glyph = icon && typeof UIIcons !== 'undefined' ? UIIcons.glyph(icon) : '';
    const iconW = glyph ? (strong ? 17 : 15) : 0;
    ctx.font = font;
    const w = ctx.measureText(text).width + 12 + iconW, h = strong ? 19 : 16;
    const px = Math.max(24, Math.min(this.cssW - w - 8, x - w / 2)), py = Math.max(24, Math.min(this.cssH - h - 8, y - h / 2));
    ctx.fillStyle = 'rgba(10, 13, 12, 0.88)'; ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (glyph) {
      ctx.font = (strong ? 13 : 12) + 'px "' + UIIcons.FONT + '"';
      ctx.fillText(glyph, px + 5, py + h / 2 + 0.5);
      ctx.font = font;
    }
    ctx.fillText(text, px + 6 + iconW, py + h / 2 + 0.5);
    ctx.restore();
  }

  // Rê chuột lên đơn vị / cứ điểm: chỉ hiện tên ngắn
  updateTip() {
    const box = this.tip;
    if (!box) return;
    if (!this.mouse || this.pan) { box.classList.add('hidden'); return; }
    const g = this.game, w = this.localToWorld(this.mouse.x, this.mouse.y), k = this.k;
    const TI = typeof TeamIntel !== 'undefined' ? TeamIntel : null;
    let text = null;
    for (const u of g.units || []) {
      if (u.isDead || u === g.player) continue;
      const known = !TI || !g.player || TI.knows(g.player, u);
      if (known && Math.hypot((u.x - w.x) * k, (u.z - w.z) * k) < 12) {
        const ally = g.player && u.team === g.player.team;
        text = `${ally ? 'TA' : 'ĐỊCH'} · ${TI ? TI.typeName(u) : u.tankType}`;
        break;
      }
    }
    if (!text) for (const ob of this.objectives()) {
      if (Math.hypot(ob.x - w.x, ob.z - w.z) < ob.r) {
        text = `OBJ ${ob.id} · ${ob.owner === 'BLUE' ? 'XANH GIỮ' : ob.owner === 'RED' ? 'ĐỎ GIỮ' : ob.contested ? 'TRANH CHẤP' : 'TRUNG LẬP'}`;
        break;
      }
    }
    if (!text) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.style.left = `${this.mouse.x}px`;
    box.style.top = `${this.mouse.y}px`;
    box.textContent = text;
  }
}

window.TacticalMapController = TacticalMapController;
