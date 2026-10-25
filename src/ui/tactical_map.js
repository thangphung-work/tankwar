/**
 * BẢN ĐỒ TÁC CHIẾN (phím M) — toàn màn hình, phong cách bản đồ quân sự
 * - Nền địa hình dựng riêng: đổ bóng địa hình + đường đồng mức + đường sá, sông hồ, rừng, nhà (tông trầm, dễ đọc ký hiệu)
 * - Đơn vị theo ký hiệu NATO: ta = khung chữ nhật xanh, địch = hình thoi đỏ; nét đứt = vết radar / báo cáo; "?" = vị trí cuối
 * - Cứ điểm OBJ A/B/C: vòng tiến độ chiếm + màu phe giữ; tầm bắn có vạch chia hướng
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
    on('tm-legend-btn', 'click', () => this.toggleLegend());
    this.toggleLegend(this.legendPref());

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
      if (e.code === 'KeyM' && !e.repeat) this.toggle();
      else if (!this.isOpen) return;
      else if (e.key === 'Escape') this.toggle(false);
      else if (e.code === 'Space') { e.preventDefault(); this.game.triggerPlayerFire(); }
      else if (e.code === 'KeyF') this.focusPlayer();
      else if (e.code === 'KeyL' && !e.repeat) this.toggleLegend();
      else if (e.code === 'Digit0' || e.code === 'Numpad0') this.resetView();
      else if (e.key === '+' || e.key === '=') this.zoomAt(this.cssW / 2, this.cssH / 2, 1.4);
      else if (e.key === '-') this.zoomAt(this.cssW / 2, this.cssH / 2, 1 / 1.4);
    });
    window.addEventListener('resize', () => { if (this.isOpen) this.resizeCanvas(); });
  }

  // Bảng chú giải ký hiệu (nút i / phím L); nhớ trạng thái bật / tắt trong trình duyệt — mặc định bật cho người mới
  legendPref() { try { return localStorage.getItem('tm-legend') !== '0'; } catch (e) { return true; } }
  toggleLegend(on) {
    const el = this.$('tm-legend'), btn = this.$('tm-legend-btn');
    if (!el) return;
    const want = on !== undefined ? on : el.classList.contains('hidden');
    el.classList.toggle('hidden', !want);
    if (btn) btn.classList.toggle('on', want);
    if (on === undefined) { try { localStorage.setItem('tm-legend', want ? '1' : '0'); } catch (e) { /* bỏ qua */ } }
  }

  // Xe mình gãy hết ăng-ten: mất bản đồ số (vehicle_damage breakAntennas -> dmg.mapLost)
  mapLost() {
    const me = this.game && this.game.player;
    return !!(me && !me.isDead && me.dmg && me.dmg.mapLost);
  }

  toggle(forceState) {
    const want = forceState !== undefined ? forceState : !this.isOpen;
    if (want && this.mapLost()) {
      const now = performance.now();
      if (!this._lostWarnT || now - this._lostWarnT > 1500) {
        this._lostWarnT = now;
        if (this.game.addCombatLog) this.game.addCombatLog('[[antenna-bars-off]] Mất hết ăng-ten — không có tín hiệu, không mở được bản đồ', 'alert');
      }
      return;
    }
    this.isOpen = want;
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
  get k() { return Math.max(this.cssW, this.cssH) / this.worldSize * this.view.zoom; }

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
    const minZ = Math.min(1, (Math.min(this.cssW, this.cssH) - 40) / Math.max(this.cssW, this.cssH));
    this.view.zoom = Math.max(minZ, Math.min(6, this.view.zoom * f));
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
  resetView() {
    const minZ = Math.min(1, (Math.min(this.cssW, this.cssH) - 40) / Math.max(this.cssW, this.cssH));
    if (Math.abs(this.view.zoom - 1) < 0.05 && this.view.cx === 0 && this.view.cz === 0) {
      this.view = { zoom: minZ, cx: 0, cz: 0 };
    } else {
      this.view = { zoom: 1, cx: 0, cz: 0 };
    }
    this.clampView();
  }

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

  // Xe địch đang vẽ trong vòng minimap radar gần điểm (clientX, clientY); null nếu không trúng xe nào
  minimapEnemyAt(cv, clientX, clientY) {
    const g = this.game, r = cv.getBoundingClientRect();
    const css = r.width / RadarMinimap.size(cv), V = RadarMinimap.view(g, cv);
    const mx = clientX - r.left, my = clientY - r.top;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let best = null, bd = coarse ? 18 : 12;
    for (const u of g.units) {
      if (!g.canTarget(u)) continue;
      const pos = this.shownPos(u);
      if (!pos) continue;
      const s = V.toScreen(pos.x, pos.z);
      if (Math.hypot(s.x - V.cx, s.y - V.cy) > V.Rpx) continue;
      const d = Math.hypot(s.x * css - mx, s.y * css - my);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // Nhấp lên minimap radar góc màn hình (vòng tròn quanh xe mình — RadarMinimap.view): chỉ khóa được xe đang vẽ trong vòng
  lockFromMinimap(e) {
    const g = this.game, me = g.player, cv = document.getElementById('aow-minimap-canvas');
    if (!cv || !me || me.isDead || !g.units || !g.worldWidth || typeof RadarMinimap === 'undefined') return false;
    if (this.mapLost()) return true;   // nuốt cú nhấp (không mở bản đồ — toggle tự báo)
    const r = cv.getBoundingClientRect();
    if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
    const best = this.minimapEnemyAt(cv, e.clientX, e.clientY);
    if (!best) return false;
    this.lockFromMap(best);
    return true;
  }

  // Điểm chỉ định cho lệnh bộ đàm (quick_comms.js) khi con trỏ nằm trên bản đồ lớn đang mở hoặc trong vòng minimap:
  // { x, z, enemy } theo tọa độ thế giới; null nếu con trỏ không ở trên bản đồ nào (hoặc bản đồ đang mất tín hiệu)
  pickAt(clientX, clientY) {
    const g = this.game;
    if (!g.player || !g.units || !g.worldWidth || this.mapLost()) return null;
    const inRect = (r) => r.width && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    if (this.isOpen) {
      const r = this.canvas.getBoundingClientRect();
      if (!inRect(r)) return null;
      const p = this.screenToWorld(clientX, clientY);
      return { x: p.x, z: p.z, enemy: this.enemyAt(clientX - r.left, clientY - r.top) };
    }
    const cv = document.getElementById('aow-minimap-canvas');
    if (!cv || typeof RadarMinimap === 'undefined') return null;
    const r = cv.getBoundingClientRect();
    if (!inRect(r)) return null;
    const css = r.width / RadarMinimap.size(cv), V = RadarMinimap.view(g, cv);
    const px = (clientX - r.left) / css, py = (clientY - r.top) / css;
    if (Math.hypot(px - V.cx, py - V.cy) > V.Rpx) return null;   // góc vuông ngoài vòng radar
    const p = RadarMinimap.toWorld(g, cv, px, py);
    return { x: p.x, z: p.z, enemy: this.minimapEnemyAt(cv, clientX, clientY) };
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
    if (!cv || !g.player || g.player.isDead || !g.worldWidth || this.mapLost() || typeof RadarMinimap === 'undefined') return;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const css = r.width / RadarMinimap.size(cv), p = RadarMinimap.toWorld(g, cv, (e.clientX - r.left) / css, (e.clientY - r.top) / css);
    this.driveTo(p.x, p.z);
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
    this.obstacle(s.x + 5, s.y - 10, 9, 12);
    this.tag(ctx, `ĐANG TỚI · ${d} m`, s.x, s.y + 18, '#00e5ff', false, null, s, 1);
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
      const probe = { tankType: unit.tankType, selectedAmmo: ammo, mainGun: unit.mainGun || null };
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
  // Nền cả bản đồ BASE_N px (mức phóng 1 trên màn hình lớn gần 1:1 điểm ảnh), nội suy bậc ba; tên công trình không in vào
  // nền mà vẽ trực tiếp mỗi khung (drawLandmarkLabels). stepBase(): dựng dần — mỗi lần gọi chạy các chặng trong ngân sách
  // thời gian (game.js gọi mỗi khung từ đầu trận, khỏi khựng); buildBase(): cần ngay (mở bản đồ khi chưa xong) thì chạy
  // nốt phần còn lại. Trả về true khi nền đã sẵn
  stepBase(budget) {
    const T = this.game.terrain, M = T && T.map;
    if (!M || !T.heightData) return false;
    if (this.base && this.base.map === M) return true;
    let J = this._baseJob;
    if (!J || J.map !== M) {
      const N = TacticalMapController.BASE_N, c = document.createElement('canvas'); c.width = c.height = N;
      J = this._baseJob = { map: M, c, it: this.paintTerrain(c.getContext('2d'), -T.width / 2, -T.width / 2, T.width, N, { smooth: true, lw: N / 1400 }) };
    }
    if (!TacticalMapController.runFor(J.it, budget === undefined ? 3 : budget)) return false;
    this.base = { canvas: J.c, map: M };
    this._baseJob = null;
    return true;
  }
  buildBase() { this.stepBase(Infinity); }

  // Vẽ địa hình vùng vuông [x0, x0 + span] x [z0, z0 + span] (toạ độ thế giới) lên canvas N x N điểm ảnh: nền cả bản đồ,
  // ô nét khi phóng to (drawDetail), minimap radar (radar_minimap.js) dựng vùng nhỏ quanh xe.
  // opt.smooth: nội suy độ cao bậc ba (Catmull-Rom) thay song tuyến — lưới độ cao ~84 m/ô, phóng gần thì song tuyến lộ ô
  // vuông gãy khúc trên đổ bóng / đồng mức. opt.lw: hệ số nét vẽ (điểm ảnh thiết bị). opt.labels: in tên công trình.
  // Generator: việc chia thành chặng nhỏ (~0.5–2 ms, đếm theo khối lượng) — nơi gọi chạy bao nhiêu chặng tùy ngân sách
  // thời gian của khung hình (TacticalMapController.runFor)
  *paintTerrain(g, x0, z0, span, N, opt) {
    const T = this.game.terrain, M = T.map, o = opt || {}, lw = o.lw || 1;
    const size = T.width, half = size / 2, S = T.segments, NN = S + 1, H = T.heightData;
    const cell = size / S;
    const hLin = (x, z) => {
      const gx = Math.max(0, Math.min(S - 1e-4, (x + half) / cell)), gz = Math.max(0, Math.min(S - 1e-4, (z + half) / cell));
      const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * NN + ix;
      return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fz) + (H[i + NN] * (1 - fx) + H[i + NN + 1] * fx) * fz;
    };
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const hCub = (x, z) => {
      const gx = Math.max(0, Math.min(S - 1e-4, (x + half) / cell)), gz = Math.max(0, Math.min(S - 1e-4, (z + half) / cell));
      const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
      const row = (j) => {
        const r = Math.max(0, Math.min(S, j)) * NN;
        return cr(H[r + Math.max(0, ix - 1)], H[r + ix], H[r + ix + 1], H[r + Math.min(S, ix + 2)], fx);
      };
      return cr(row(iz - 1), row(iz), row(iz + 1), row(iz + 2), fz);
    };
    const hAt = o.smooth ? hCub : hLin, cost = o.smooth ? 4 : 1;
    let work = 0;
    const CH = 60000;   // khối lượng mỗi chặng (1 = một điểm ảnh tô màu / một mẫu song tuyến)
    if (!this._hRange || this._hRange.map !== M) {   // thang màu theo độ cao lấy cả bản đồ: vùng nhỏ cùng tông với bản đồ lớn
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < H.length; i++) { const v = H[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      this._hRange = { map: M, lo, hi };
    }
    const hmin = this._hRange.lo, hmax = this._hRange.hi;
    const water = !!(M.river || (M.lakes && M.lakes.length) || (M.canals && M.canals.length));
    const px = span / N;
    // 1. Đổ bóng địa hình + thang màu theo độ cao (tông trầm, ít bão hòa). Độ cao tại góc điểm ảnh tính từng hàng (giữ 2
    // hàng), tô từng dải vài hàng rồi đổ lên canvas — không cấp phát mảng cả ảnh (nền 2048 px: ~33 MB, khựng lúc cấp phát)
    const L = [-0.55, 0.62, -0.55]; const ll = Math.hypot(L[0], L[1], L[2]); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const ramp = [[38, 48, 44], [58, 70, 58], [84, 90, 72], [118, 116, 96], [150, 146, 128]];
    // Phóng gần (điểm ảnh nhỏ hơn ô lưới độ cao nhiều lần): lấy mẫu bậc ba thưa mỗi st điểm ảnh (~1/12 ô) theo cả hai
    // chiều, giữa các mẫu nội suy tuyến tính — mắt không phân biệt, ô nét 512 px nhanh hơn ~10 lần
    const st = o.smooth ? Math.max(1, Math.min(8, Math.floor(cell / 12 / px))) : 1;
    const keyRow = (yy, out) => {
      const wz = z0 + yy * px;
      for (let x = 0; x <= N; x += st) out[x] = hAt(x0 + x * px, wz);
      if (N % st) out[N] = hAt(x0 + N * px, wz);
      if (st > 1) for (let x = 0; x < N; x += st) {
        const x2 = Math.min(N, x + st), a = out[x], d = (out[x2] - a) / (x2 - x);
        for (let q = 1; x + q < x2; q++) out[x + q] = a + d * q;
      }
      work += Math.ceil(N / st + 1) * cost;
    };
    let kA = new Float32Array(N + 1), kB = new Float32Array(N + 1), kyA = 0, kyB = Math.min(N, st);
    keyRow(0, kA); keyRow(kyB, kB);
    let prev = new Float32Array(N + 1), cur = new Float32Array(N + 1);
    prev.set(kA);
    const rows = Math.max(1, Math.floor(CH / (N * (cost / st + 2))));
    const hp = 0.5 / px, L0 = L[0], L1 = L[1], L2 = L[2], RM = ramp.length - 1, hs = RM / Math.max(1, hmax - hmin);
    let strip = null, sy = 0;
    for (let y = 0; y < N; y++) {
      if (!strip) { sy = y; strip = g.createImageData(N, Math.min(rows, N - y)); }
      const yy = y + 1, D = strip.data, row = (y - sy) * N;
      if (yy > kyB) { const t = kA; kA = kB; kB = t; kyA = kyB; kyB = Math.min(N, kyB + st); keyRow(kyB, kB); }
      if (st === 1 || yy === kyB) cur.set(kB);
      else { const t = (yy - kyA) / (kyB - kyA); for (let x = 0; x <= N; x++) cur[x] = kA[x] + (kB[x] - kA[x]) * t; }
      for (let x = 0; x < N; x++) {
        const a = prev[x], b = prev[x + 1], d = cur[x], e = cur[x + 1];
        const h = (a + b + d + e) * 0.25;
        const dx = ((b + e) - (a + d)) * hp, dz = ((d + e) - (a + b)) * hp;
        let lit = (L1 - dx * L0 - dz * L2) / Math.sqrt(dx * dx + 1 + dz * dz);   // Math.hypot chậm hơn nhiều trong V8
        if (lit < 0) lit = 0;
        const shade = 0.52 + 0.62 * lit, kk = (row + x) * 4;
        let rr, gg, bb;
        if (water && h < 0.2) { rr = 30; gg = 48; bb = 62; }
        else {
          let t = (h - hmin) * hs;
          if (t < 0) t = 0; else if (t > RM) t = RM;
          let i0 = t | 0; if (i0 > RM - 1) i0 = RM - 1;
          const f = t - i0, c0 = ramp[i0], c1 = ramp[i0 + 1];
          rr = c0[0] + (c1[0] - c0[0]) * f; gg = c0[1] + (c1[1] - c0[1]) * f; bb = c0[2] + (c1[2] - c0[2]) * f;
        }
        D[kk] = rr * shade; D[kk + 1] = gg * shade; D[kk + 2] = bb * shade; D[kk + 3] = 255;   // Uint8ClampedArray tự kẹp 255
      }
      const sw = prev; prev = cur; cur = sw;
      if (y - sy + 1 === strip.height) { g.putImageData(strip, 0, sy); strip = null; yield; }
    }
    // Từ đây vẽ theo toạ độ cả bản đồ (P: thế giới -> điểm ảnh, dùng chung cho x và z) dời gốc về góc vùng
    const sc = N / span, P = v => (v + half) * sc;
    g.save();
    g.beginPath(); g.rect(0, 0, N, N); g.clip();
    g.translate(-(x0 + half) * sc, -(z0 + half) * sc);

    // 2. Đường đồng mức (marching squares), cách 10 m, đậm mỗi 50 m. Lưới: song tuyến ô/2; bậc ba mau hơn (ô/5).
    // Mỗi ô chỉ xét các mức nằm giữa thấp nhất / cao nhất 4 góc (vành núi cao hàng trăm mét không duyệt cả trăm mức mỗi ô)
    {
      const gc = o.smooth ? Math.max(px, cell / 5) : cell / 2, G = Math.ceil(span / gc), GN = G + 1;
      const hg = new Float32Array(GN * GN);
      for (let j = 0; j < GN; j++) {
        for (let i = 0; i < GN; i++) hg[j * GN + i] = hAt(x0 + i * gc, z0 + j * gc);
        if ((work += GN * cost) > CH) { work = 0; yield; }
      }
      const step = 10, major = 50;
      const minorP = new Path2D(), majorP = new Path2D();
      const CASES = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
      const ox = P(x0), oz = P(z0), k = gc * sc;
      const E = [0, 0];
      // cạnh: 0 trên, 1 phải, 2 dưới, 3 trái -> điểm cắt (toạ độ ô) ghi vào E
      const edge = (q, i, j, a, b, cc, d, lv) => {
        if (q === 0) { E[0] = i + (lv - a) / (b - a); E[1] = j; }
        else if (q === 1) { E[0] = i + 1; E[1] = j + (lv - b) / (cc - b); }
        else if (q === 2) { E[0] = i + (lv - d) / (cc - d); E[1] = j + 1; }
        else { E[0] = i; E[1] = j + (lv - a) / (d - a); }
      };
      for (let j = 0; j < G; j++) {
        for (let i = 0; i < G; i++) {
          const a = hg[j * GN + i], b = hg[j * GN + i + 1], d = hg[(j + 1) * GN + i], cc = hg[(j + 1) * GN + i + 1];
          const lo = Math.min(a, b, cc, d), hi = Math.max(a, b, cc, d);
          let lv = Math.ceil(lo / step) * step;
          if (water && lv <= 0) lv = step;
          for (; lv < hi; lv += step) {
            const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc > lv ? 2 : 0) | (d > lv ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const path = lv % major === 0 ? majorP : minorP;
            for (const [ea, eb] of CASES[idx]) {
              edge(ea, i, j, a, b, cc, d, lv); const ax = E[0], az = E[1];
              edge(eb, i, j, a, b, cc, d, lv);
              path.moveTo(ox + ax * k, oz + az * k); path.lineTo(ox + E[0] * k, oz + E[1] * k);
            }
          }
        }
        if ((work += G * 3) > CH) { work = 0; yield; }
      }
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(214, 200, 160, 0.16)'; g.lineWidth = 0.8 * lw; g.stroke(minorP);
      g.strokeStyle = 'rgba(232, 214, 168, 0.34)'; g.lineWidth = 1.3 * lw; g.stroke(majorP);
    }
    yield;

    // 3. Sông hồ
    if (M.river) {
      g.strokeStyle = '#2a4458';
      BattleTerrain3D.strokeRiver(g, M.river, P, sc);
    }
    for (const Lk of M.lakes || []) {
      g.fillStyle = '#2a4458'; g.beginPath(); g.arc(P(Lk.x), P(Lk.z), Lk.r * sc, 0, Math.PI * 2); g.fill();
    }
    for (const c of M.canals || []) {   // kênh đào đô thị
      g.strokeStyle = '#2a4458'; g.lineWidth = c.hw * 2 * sc; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(P(c.pts[0][0]), P(c.pts[0][1])); g.lineTo(P(c.pts[1][0]), P(c.pts[1][1])); g.stroke();
    }
    // 4. Rừng: chấm cây (phóng gần: tán cây ~7 m)
    {
      g.fillStyle = 'rgba(24, 40, 26, 0.75)';
      const ts = Math.max(2.2, 7 * sc), x1 = x0 + span, z1 = z0 + span, m = 10;
      for (const t of M.trees || []) {
        if (t.kind === 'cactus' || t.kind === 'deadTree' || t.x < x0 - m || t.x > x1 + m || t.z < z0 - m || t.z > z1 + m) continue;
        g.fillRect(P(t.x) - ts / 2, P(t.z) - ts / 2, ts, ts);
      }
    }
    yield;
    // 5. Đường: viền tối + lòng đường sáng
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const rd of M.roads || []) {
        g.strokeStyle = pass ? (rd.kind === 'asphalt' ? '#b9b4a2' : '#a89c7e') : 'rgba(10, 12, 12, 0.7)';
        g.lineWidth = Math.max((pass ? 1.4 : 3) * lw, rd.width * sc * (pass ? 0.55 : 0.9));
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
      g.fillStyle = '#20262c'; g.strokeStyle = 'rgba(200, 200, 190, 0.45)'; g.lineWidth = 0.8 * lw;
      g.fillRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      g.strokeRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      g.restore();
    }
    yield;
    // 7. Cứ điểm bê tông
    if (T.propSet) T.propSet.drawOnMap(g, P, sc, lw);
    if (T.strongholdSet) T.strongholdSet.drawOnMap(g, P, sc, 'tac');
    if (T.landmarkSet) T.landmarkSet.drawOnMap(g, P, sc, !!o.labels);
    // 8. Phủ tối ngoài lòng thung lũng (sườn vành núi xe không tới được) theo đúng hình dạng vùng chiến đấu
    BattleTerrain3D.shadeOutside(g, M, P, size * sc, o.smooth ? 2 * lw : undefined);
    g.restore();
  }

  // ---------------------------------------------------------------------------
  // NỀN NÉT KHI PHÓNG TO: bản đồ chia ô vuông TILE_N px theo cấp (cấp L: 2^L x 2^L ô); chọn cấp có mật độ điểm ảnh bằng
  // màn hình (giới hạn số ô nhìn thấy), dựng dần trong ngân sách ~4 ms/khung — ô gần giữa màn hình trước; ô chưa xong thì
  // mượn phần tương ứng của ô cấp thấp hơn đã có, không có nữa thì thấy nền chung. Nhớ tối đa TILE_CACHE ô (bỏ ô lâu
  // không dùng nhất)
  // ---------------------------------------------------------------------------
  drawDetail(ctx, o, S) {
    const T = this.game.terrain, M = T.map, TN = TacticalMapController.TILE_N, CAP = TacticalMapController.TILE_CACHE;
    const devPx = S * this.dpr, baseL = Math.log2(this.base.canvas.width / TN);
    let L = Math.min(7, Math.ceil(Math.log2(devPx / TN) - 0.15));
    if (L <= baseL) return;
    if (!this.tiles || this.tiles.map !== M) this.tiles = { map: M, cache: new Map(), job: null, frame: 0 };
    const TL = this.tiles, cache = TL.cache, W = this.cssW, Hh = this.cssH, frame = ++TL.frame;
    const range = (L) => {
      const n = 1 << L, ct = S / n;
      return { n, ct, i0: Math.max(0, Math.floor(-o.x / ct)), i1: Math.min(n - 1, Math.floor((W - o.x) / ct)),
        j0: Math.max(0, Math.floor(-o.y / ct)), j1: Math.min(n - 1, Math.floor((Hh - o.y) / ct)) };
    };
    let R = range(L);
    while (L > baseL + 1 && (R.i1 - R.i0 + 1) * (R.j1 - R.j0 + 1) > CAP * 0.7) R = range(--L);
    const want = [];
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) {
      const x = o.x + i * R.ct, y = o.y + j * R.ct, key = L + ':' + i + ':' + j, t = cache.get(key);
      if (t) { t.used = frame; ctx.drawImage(t.canvas, x, y, R.ct + 0.5, R.ct + 0.5); continue; }
      // mượn ô cấp thấp hơn (vừa phóng to: ô cũ còn trong bộ nhớ)
      for (let m = 1; L - m > baseL; m++) {
        const p = cache.get((L - m) + ':' + (i >> m) + ':' + (j >> m));
        if (!p) continue;
        p.used = frame;
        const sub = TN >> m, sx = (i & ((1 << m) - 1)) * sub, sy = (j & ((1 << m) - 1)) * sub;
        ctx.drawImage(p.canvas, sx, sy, sub, sub, x, y, R.ct + 0.5, R.ct + 0.5);
        break;
      }
      want.push({ key, i, j, L, d: Math.hypot(x + R.ct / 2 - W / 2, y + R.ct / 2 - Hh / 2) });
    }
    // dựng ô còn thiếu: đang dựng ô không còn cần thì bỏ, chọn ô gần giữa màn hình nhất
    if (TL.job) { const ix = want.findIndex(w => w.key === TL.job.key); if (ix < 0) TL.job = null; else want.splice(ix, 1); }
    const t0 = performance.now();
    while (performance.now() - t0 < 4) {
      if (!TL.job) {
        if (!want.length) break;
        want.sort((a, b) => a.d - b.d);
        const w = want.shift(), n = 1 << w.L, span = this.worldSize / n, half = this.worldSize / 2;
        const c = document.createElement('canvas'); c.width = c.height = TN;
        TL.job = { key: w.key, canvas: c, it: this.paintTerrain(c.getContext('2d'), -half + w.i * span, -half + w.j * span, span, TN, { smooth: true, lw: this.dpr }) };
      }
      if (TacticalMapController.runFor(TL.job.it, 4 - (performance.now() - t0))) {
        cache.set(TL.job.key, { canvas: TL.job.canvas, used: frame });
        TL.job = null;
      }
    }
    if (cache.size > CAP) {
      const old = [...cache.entries()].filter(([, t]) => t.used !== frame).sort((a, b) => a[1].used - b[1].used);
      for (let q = 0; q < old.length && cache.size > CAP; q++) cache.delete(old[q][0]);
    }
  }

  // Tên công trình (sân bay, nhà máy điện...) vẽ trực tiếp theo điểm ảnh màn hình: nét ở mọi mức phóng
  drawLandmarkLabels(ctx, o, k) {
    const LS = this.game.terrain && this.game.terrain.landmarkSet;
    if (!LS || !LS.drawLabels) return;
    const half = this.worldSize / 2;
    ctx.save(); ctx.translate(o.x, o.y);
    LS.drawLabels(ctx, (v) => (v + half) * k, k, 12);
    ctx.restore();
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
    // nền chưa dựng xong (mở bản đồ ngay đầu trận): dựng tiếp ~8 ms mỗi khung, tạm dùng ảnh mặt đất thô của địa hình
    const baseReady = this.stepBase(8);
    if (this.measStart && this.measStart.fromPlayer && g.player) { this.measStart.x = g.player.x; this.measStart.z = g.player.z; this.updateMeasurements(false); }
    const W = this.cssW, Hh = this.cssH, k = this.k, half = this.worldSize / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0d0c';
    ctx.fillRect(0, 0, W, Hh);
    const o = this.worldToScreen(-half, -half), S = this.worldSize * k;
    ctx.imageSmoothingEnabled = true;
    if (baseReady) { ctx.drawImage(this.base.canvas, o.x, o.y, S, S); this.drawDetail(ctx, o, S); }
    else if (T.mapCanvas) ctx.drawImage(T.mapCanvas, o.x, o.y, S, S);

    this._tags = []; this._obst = [];   // nhãn chờ đặt chỗ + ô ký hiệu nhãn không được đè (layoutTags)
    this.drawGrid(ctx, o, S);
    this.drawLandmarkLabels(ctx, o, k);
    this.drawBushes(ctx, k);
    ctx.save(); ctx.translate(o.x, o.y); g.radar.renderOnTacticalMap(ctx, k); ctx.restore();
    this.drawObjectives(ctx, k);
    this.drawCrates(ctx);
    if (typeof SupplyDepot !== 'undefined') SupplyDepot.drawOnMap(ctx, g, (x, z) => this.worldToScreen(x, z), k, { size: 7, labels: true });
    this.drawAirdrop(ctx);
    if (g.player && !g.player.isDead) this.drawRanges(ctx, k);
    this.drawIntel(ctx, k);
    this.drawDrive(ctx);
    if (typeof QuickComms !== 'undefined') QuickComms.drawOnMap(ctx, (x, z) => this.worldToScreen(x, z));
    if (g.player) this.drawPlayer(ctx);
    this.drawLock(ctx);
    this.drawTarget(ctx);
    this.layoutTags(ctx);
    this.drawFrame(ctx, o, S, k, W, Hh);
    this.updateTip();
  }

  // LƯỚI BÁO VỊ TRÍ: ô 1 km phủ đúng vùng chơi (lòng thung lũng trong vành núi), cột A, B, C... / hàng 1, 2, 3...; mỗi ô
  // chia 3 x 3 ô con đánh số 1–9 theo thứ tự đọc (1 trên trái, 9 dưới phải) -> gọi vị trí kiểu "D5-7" (~330 m)
  grid() {
    const T = this.game.terrain, M = T && T.map;
    if (this._grid && this._grid.map === M) return this._grid;
    const O = M && M.outer, half = this.worldSize / 2;
    let x0 = -half, x1 = half, z0 = -half, z1 = half;
    if (O && O.rimFoot) {
      x0 = z0 = Infinity; x1 = z1 = -Infinity;
      for (let a = 0; a < 360; a += 2) {
        const t = a * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t), r = O.rimFoot(c * 2000, sn * 2000);
        x0 = Math.min(x0, c * r); x1 = Math.max(x1, c * r); z0 = Math.min(z0, sn * r); z1 = Math.max(z1, sn * r);
      }
    }
    const cell = 1000, cols = Math.min(26, Math.max(1, Math.ceil((x1 - x0) / cell))), rows = Math.max(1, Math.ceil((z1 - z0) / cell));
    this._grid = { map: M, cell, cols, rows, x0: (x0 + x1) / 2 - cols * cell / 2, z0: (z0 + z1) / 2 - rows * cell / 2 };
    return this._grid;
  }
  // Ô lưới của điểm (x, z): "D5-7"; null nếu ngoài lưới
  gridRef(x, z) {
    const G = this.grid(), fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= G.cols || j >= G.rows) return null;
    const si = Math.min(2, Math.floor((fx - i) * 3)), sj = Math.min(2, Math.floor((fz - j) * 3));
    return String.fromCharCode(65 + i) + (j + 1) + '-' + (sj * 3 + si + 1);
  }
  drawGrid(ctx) {
    const G = this.grid(), cp = G.cell * this.k, a = this.worldToScreen(G.x0, G.z0), W = this.cssW, Hh = this.cssH;
    const i0 = Math.max(0, Math.floor(-a.x / cp)), i1 = Math.min(G.cols - 1, Math.floor((W - a.x) / cp));
    const j0 = Math.max(0, Math.floor(-a.y / cp)), j1 = Math.min(G.rows - 1, Math.floor((Hh - a.y) / cp));
    if (i1 < i0 || j1 < j0) return;
    const L = a.x + i0 * cp, R = a.x + (i1 + 1) * cp, Tp = a.y + j0 * cp, B = a.y + (j1 + 1) * cp;
    ctx.save();
    // ô con: nét đứt rất mờ khi phóng đủ to
    if (cp >= 150) {
      ctx.strokeStyle = 'rgba(200, 210, 192, 0.09)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) for (const q of [1, 2]) { const x = a.x + (i + q / 3) * cp; ctx.moveTo(x, Tp); ctx.lineTo(x, B); }
      for (let j = j0; j <= j1; j++) for (const q of [1, 2]) { const y = a.y + (j + q / 3) * cp; ctx.moveTo(L, y); ctx.lineTo(R, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // ô chính
    ctx.strokeStyle = 'rgba(200, 210, 192, 0.17)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = i0; i <= i1 + 1; i++) { const x = a.x + i * cp; ctx.moveTo(x, Tp); ctx.lineTo(x, B); }
    for (let j = j0; j <= j1 + 1; j++) { const y = a.y + j * cp; ctx.moveTo(L, y); ctx.lineTo(R, y); }
    ctx.stroke();
    // tên ô ở góc trên trái mỗi ô; phóng rất to thì thêm số ô con mờ ở giữa ô con
    if (cp >= 70) {
      ctx.font = '600 10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(220, 232, 240, 0.4)';
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ctx.fillText(String.fromCharCode(65 + i) + (j + 1), a.x + i * cp + 4, a.y + j * cp + 4);
    }
    if (cp >= 330) {
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(220, 232, 240, 0.2)';
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let q = 0; q < 9; q++) {
        if (q === 0) continue;   // ô con 1 trùng tên ô
        ctx.fillText(String(q + 1), a.x + (i + (q % 3 + 0.5) / 3) * cp, a.y + (j + ((q / 3 | 0) + 0.5) / 3) * cp);
      }
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
      progress: cp.owner ? (cp.holdTimer || 0) / (cp.holdGoal || 90) : (cp.captureProgress || 0) / 100,
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
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      const w = ctx.measureText(label).width + 14, h = 18, x = p.x - w / 2, y = Math.max(52, p.y - R - h - 6);   // không chui dưới tiêu đề khi phóng to
      this.obstacle(p.x, y + h / 2, w / 2, h / 2); this.obstacle(p.x, p.y, 8, 8);
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
    this.obstacle(x, y, s * 1.45, s * 1.45);
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
    const code = { ALL_ROUNDER: 'TĂNG', GATLING: '6 NÒNG', ARTILLERY: 'PHÁO TH', SCOUT: 'TRINH SÁT' };
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
        const lbl = code[u.tankType] || '';
        ctx.font = '600 10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillStyle = ally ? 'rgba(160, 225, 245, 0.95)' : 'rgba(255, 150, 150, 0.95)';
        ctx.strokeText(lbl, s.x + 15, s.y); ctx.fillText(lbl, s.x + 15, s.y);
        const lw = ctx.measureText(lbl).width;
        this.obstacle(s.x + 15 + lw / 2, s.y, lw / 2, 6);
      }
    }
    if (g.drawDronesOnMap) g.drawDronesOnMap(ctx, (x, z) => this.worldToScreen(x, z), true);
    for (const [id, gh] of this.ghosts) {
      const age = now - gh.t;
      if (age > 6) { this.ghosts.delete(id); continue; }
      const s = this.worldToScreen(gh.x, gh.z), a = 1 - age / 6;
      ctx.strokeStyle = `rgba(255, 120, 100, ${0.7 * a})`; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x + 11, s.y); ctx.lineTo(s.x, s.y + 11); ctx.lineTo(s.x - 11, s.y); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255, 140, 120, ${0.85 * a})`; ctx.font = 'bold 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
      this.obstacle(imp.x, imp.y, 10, 10);
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
    // XE MÌNH: cùng kiểu minimap — hình quạt hướng camera (mờ dần ra xa), mũi tên màu phe theo hướng nòng, quầng tròn
    // nhẹ cho dễ tìm giữa đồng đội
    this.obstacle(s.x, s.y, 16, 16);
    ctx.save();
    if (p.isDead) {
      ctx.strokeStyle = 'rgba(232, 241, 246, 0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x - 7, s.y - 7); ctx.lineTo(s.x + 7, s.y + 7); ctx.moveTo(s.x + 7, s.y - 7); ctx.lineTo(s.x - 7, s.y + 7); ctx.stroke();
      ctx.restore();
      return;
    }
    const col = p.team === 'RED' ? '#ff5a4a' : '#22d3f0', rgb = p.team === 'RED' ? '255, 90, 74' : '34, 211, 240';
    {
      const yaw = g._camYaw || 0, a0 = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)), Lc = 90;
      const hf = g.camera ? Math.atan(Math.tan(g.camera.fov * Math.PI / 360) * g.camera.aspect) : 0.6;
      const fg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Lc);
      fg.addColorStop(0, 'rgba(235, 250, 255, 0.3)'); fg.addColorStop(1, 'rgba(235, 250, 255, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, Lc, a0 - hf, a0 + hf); ctx.closePath(); ctx.fill();
      const eg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Lc);
      eg.addColorStop(0, 'rgba(235, 250, 255, 0.6)'); eg.addColorStop(1, 'rgba(235, 250, 255, 0)');
      ctx.strokeStyle = eg; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a0 - hf) * Lc, s.y + Math.sin(a0 - hf) * Lc);
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a0 + hf) * Lc, s.y + Math.sin(a0 + hf) * Lc);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${rgb}, 0.13)`; ctx.strokeStyle = `rgba(${rgb}, 0.55)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.translate(s.x, s.y); ctx.rotate((p.azimuth || 0) * Math.PI / 180);
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 8); ctx.lineTo(0, 4.5); ctx.lineTo(-8, 8); ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#f4fdff'; ctx.lineWidth = 1.4; ctx.stroke();
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
    this.obstacle(s.x, s.y, 21, 21);
    this.tag(ctx, manual ? `${d} m · TAB: BÁM LẠI` : `ĐÃ KHÓA · ${d} m`, s.x, s.y - 34, col, true, 'lock', s, 3);
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
    this.obstacle(e.x, e.y, 13, 13);
    this.tag(ctx, verdict, e.x, e.y + 24, col, true, icon, e, 2);
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
    // mã cột / hàng của lưới báo vị trí (drawGrid) trên mép
    {
      const G = this.grid(), cp = G.cell * k, a = this.worldToScreen(G.x0, G.z0);
      ctx.fillStyle = 'rgba(232, 241, 246, 0.95)'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < G.cols; i++) { const cx = a.x + (i + 0.5) * cp; if (cx > left + 16 && cx < W) ctx.fillText(String.fromCharCode(65 + i), cx, top + 8); }
      for (let j = 0; j < G.rows; j++) { const cy = a.y + (j + 0.5) * cp; if (cy > top + 16 && cy < H) ctx.fillText(String(j + 1), left + 8, cy); }
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
    ctx.fillStyle = '#e8f1f6'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${mm} m`, sx0 + Ls + 8, sy0 - 1);
    const nx = W - 34, ny = H - 70;
    ctx.strokeStyle = 'rgba(232, 241, 246, 0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(nx, ny, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e0675c';
    ctx.beginPath(); ctx.moveTo(nx, ny - 11); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx - 4, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(232, 241, 246, 0.8)';
    ctx.beginPath(); ctx.moveTo(nx, ny + 11); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx - 4, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8f1f6'; ctx.font = 'bold 9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny - 21);
    // góc dưới trái: ô lưới của xe mình (để gọi vị trí qua bộ đàm) + ô / cự ly / hướng của điểm dưới con trỏ
    const p = this.game.player, box = (y, txt, col) => {
      ctx.font = '600 12px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(10, 12, 10, 0.86)'; ctx.fillRect(28, y, w, 22);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.strokeRect(28.5, y + 0.5, w - 1, 21); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.fillText(txt, 36, y + 11.5);
    };
    if (p && !p.isDead) box(H - 74, 'XE MÌNH · Ô ' + (this.gridRef(p.x, p.z) || '—'), '#7fe3f5');
    if (this.mouse && !this.pan) {
      const w = this.localToWorld(this.mouse.x, this.mouse.y);
      let txt = 'CON TRỎ · Ô ' + (this.gridRef(w.x, w.z) || '—');
      if (p && !p.isDead) {
        const brg = ((Math.atan2(w.x - p.x, -(w.z - p.z)) * 180 / Math.PI) % 360 + 360) % 360;
        txt += ' · ' + Math.round(Math.hypot(w.x - p.x, w.z - p.z)) + ' m · ' + String(Math.round(brg) % 360).padStart(3, '0') + '°';
      }
      box(H - 46, txt, '#e8f1f6');
    }
    ctx.restore();
  }

  // Nhãn chữ có khung; icon (tùy chọn) là tên icon Tabler vẽ trước chữ. Trong lúc vẽ khung hình (render) nhãn chỉ được
  // xếp hàng, cuối khung layoutTags đặt chỗ một lượt: không đè ký hiệu xe / mục tiêu / nhãn khác (dời quanh điểm neo, kẻ
  // nét nối khi dời xa). anchor: điểm nhãn chỉ vào (mặc định (x, y)); pri: nhãn quan trọng hơn được chọn chỗ trước
  tag(ctx, text, x, y, color, strong, icon, anchor, pri) {
    const t = { text, x, y, color, strong, icon, ax: anchor ? anchor.x : x, ay: anchor ? anchor.y : y, pri: pri || 0 };
    if (this._tags) { this._tags.push(t); return; }
    const m = this.measureTag(ctx, t);
    this.drawTag(ctx, t, m, Math.max(24, Math.min(this.cssW - m.w - 8, x - m.w / 2)), Math.max(52, Math.min(this.cssH - m.h - 8, y - m.h / 2)));
  }
  measureTag(ctx, t) {
    const font = (t.strong ? 'bold 12px' : '11px') + ' "JetBrains Mono", monospace';
    const glyph = t.icon && typeof UIIcons !== 'undefined' ? UIIcons.glyph(t.icon) : '';
    const iconW = glyph ? (t.strong ? 17 : 15) : 0;
    ctx.font = font;
    return { font, glyph, iconW, w: ctx.measureText(t.text).width + 12 + iconW, h: t.strong ? 19 : 16 };
  }
  drawTag(ctx, t, m, px, py) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 13, 12, 0.9)'; ctx.fillRect(px, py, m.w, m.h);
    ctx.strokeStyle = t.color; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, m.w - 1, m.h - 1);
    ctx.fillStyle = t.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (m.glyph) {
      ctx.font = (t.strong ? 13 : 12) + 'px "' + UIIcons.FONT + '"';
      ctx.fillText(m.glyph, px + 5, py + m.h / 2 + 0.5);
    }
    ctx.font = m.font;
    ctx.fillText(t.text, px + 6 + m.iconW, py + m.h / 2 + 0.5);
    ctx.restore();
  }
  // Vùng ký hiệu (tâm x, y; nửa rộng / cao) nhãn không được đè
  obstacle(x, y, hw, hh) {
    if (this._obst && x + hw > 0 && y + hh > 0 && x - hw < this.cssW && y - hh < this.cssH) this._obst.push({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh });
  }
  layoutTags(ctx) {
    const tags = this._tags, placed = (this._obst || []).slice();
    this._tags = null; this._obst = null;
    if (!tags || !tags.length) return;
    const W = this.cssW, Hh = this.cssH, TOP = 52;
    const overlap = (r) => {
      let a = 0;
      for (const q of placed) {
        const ix = Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0), iy = Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0);
        if (ix > 0 && iy > 0) a += ix * iy;
      }
      return a;
    };
    tags.sort((a, b) => b.pri - a.pri);
    for (const t of tags) {
      const m = this.measureTag(ctx, t), w = m.w, h = m.h, cands = [[t.x, t.y]];
      for (const D of [14, 28, 46, 66]) {
        const d = D * 0.75;
        cands.push([t.ax, t.ay - D - h / 2], [t.ax, t.ay + D + h / 2], [t.ax + D + w / 2, t.ay], [t.ax - D - w / 2, t.ay],
          [t.ax + d + w / 2, t.ay - d - h / 2], [t.ax - d - w / 2, t.ay - d - h / 2], [t.ax + d + w / 2, t.ay + d + h / 2], [t.ax - d - w / 2, t.ay + d + h / 2]);
      }
      let best = null, bestA = Infinity;
      for (const [cx, cy] of cands) {
        const x0 = Math.max(24, Math.min(W - w - 8, cx - w / 2)), y0 = Math.max(TOP, Math.min(Hh - h - 8, cy - h / 2));
        const r = { x0: x0 - 2, y0: y0 - 2, x1: x0 + w + 2, y1: y0 + h + 2 }, a = overlap(r);
        if (a < bestA) { bestA = a; best = { x0, y0, r }; if (a === 0) break; }
      }
      placed.push(best.r);
      // dời xa chỗ muốn: nét mảnh từ cạnh ký hiệu tới mép nhãn gần nhất
      const nx = Math.max(best.x0, Math.min(best.x0 + w, t.ax)), ny = Math.max(best.y0, Math.min(best.y0 + h, t.ay));
      const dl = Math.hypot(nx - t.ax, ny - t.ay);
      if (Math.hypot(best.x0 + w / 2 - t.x, best.y0 + h / 2 - t.y) > 4 && dl > 16) {
        const ux = (nx - t.ax) / dl, uy = (ny - t.ay) / dl;
        ctx.save(); ctx.strokeStyle = t.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(t.ax + ux * 12, t.ay + uy * 12); ctx.lineTo(nx, ny); ctx.stroke(); ctx.restore();
      }
      this.drawTag(ctx, t, m, best.x0, best.y0);
    }
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

TacticalMapController.BASE_N = 2048;     // cạnh nền cả bản đồ (điểm ảnh)
TacticalMapController.TILE_N = 512;      // cạnh ô nét khi phóng to
TacticalMapController.TILE_CACHE = 48;   // số ô nhớ tối đa (~1 MB / ô)
// Chạy generator dựng nền (paintTerrain) tới khi xong hoặc hết ngân sách ms; true = xong
TacticalMapController.runFor = (it, budget) => {
  const t0 = performance.now();
  do { if (it.next().done) return true; } while (performance.now() - t0 < budget);
  return false;
};

window.TacticalMapController = TacticalMapController;
