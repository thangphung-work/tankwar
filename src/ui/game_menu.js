/**
 * MENU TRÒ CHƠI
 * - Cài đặt (nút bánh răng ở sảnh, hoặc Esc trong trận): âm lượng tổng, nhạc nền, tiếng động cơ, chất lượng đồ họa, khử răng cưa.
 *   Lưu trong trình duyệt (localStorage) — đồ họa phụ thuộc từng máy nên không lưu theo tài khoản.
 * - Esc trong trận: Tiếp tục / Cài đặt / Phím điều khiển / Rời trận. Trận nhiều người không tạm dừng.
 * - Bảng phím điều khiển; lần đầu vào trận tự hiện thẻ phím tắt gọn.
 * - Mất kết nối máy chủ giữa trận: báo rõ, cho chọn chơi tiếp với máy hoặc về sảnh.
 */
const GameMenu = (() => {
  const KEY = 'spg_settings', SEEN_KEY = 'spg_seen_controls';
  const DEF = { vol: 0.8, music: 0.6, engine: 0.8, gfx: 'high', aa: true, smooth: true };
  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  // gfxUser: người chơi đã tự chọn mức đồ họa. Chưa chọn -> mức theo card đồ họa của máy (xem GfxQuality.detectTier)
  let suggested = null;
  let root = null, view = null;
  const game = () => window.game || window.artilleryGame || null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  // ---------------------------------------------------------------------------
  // ÁP DỤNG CÀI ĐẶT
  // ---------------------------------------------------------------------------
  // dpr: tỉ lệ điểm ảnh tối đa; ssaa: được vẽ cao hơn độ phân giải màn hình rồi thu nhỏ (siêu lấy mẫu, cạnh mịn);
  // shadowMap: cỡ bản đồ bóng đổ; aniso: lọc dị hướng cho mặt đất / tường nhìn nghiêng (0 = giữ như lúc tạo)
  const GFX = {
    low: { dpr: 0.85, shadows: false, grass: false, soft: false, shadowMap: 2048, aniso: 0 },
    medium: { dpr: 1, shadows: true, grass: true, soft: false, shadowMap: 2048, aniso: 0 },
    high: { dpr: 1.5, shadows: true, grass: true, soft: true, shadowMap: 2048, aniso: 0 },
    ultra: { dpr: 2, ssaa: true, shadows: true, grass: true, soft: true, shadowMap: 4096, aniso: 16 }
  };
  function applyAudio() {
    const se = window.soundEngine;
    if (se && se.setUserVolume) se.setUserVolume(S.vol, S.engine);
    if (se && se.setMusicVolume) se.setMusicVolume(S.music);
  }
  function applyGraphics() {
    const g = game();
    if (!g || !g.renderer) return;
    if (!suggested && typeof GfxQuality !== 'undefined') {
      suggested = GfxQuality.detectTier(g.renderer);
      if (!S.gfxUser) S.gfx = suggested;
    }
    const P = GFX[S.gfx] || GFX.high;
    if (typeof GfxQuality !== 'undefined') GfxQuality.configure(g.renderer, { maxScale: P.dpr, ssaa: !!P.ssaa, dynamic: S.smooth !== false });
    else {
      const dpr = Math.min(window.devicePixelRatio || 1, P.dpr);
      if (Math.abs(g.renderer.getPixelRatio() - dpr) > 0.01) {
        g.renderer.setPixelRatio(dpr);
        g.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }
    g.gfxShadows = P.shadows;
    g.gfxGrass = P.grass;
    let rebuild = false;
    const type = P.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (g.renderer.shadowMap.type !== type) { g.renderer.shadowMap.type = type; rebuild = true; }
    const L = g.sunLight;
    if (L && L.shadow.mapSize.width !== P.shadowMap) {
      L.shadow.mapSize.set(P.shadowMap, P.shadowMap);
      if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }   // tạo lại bản đồ bóng theo cỡ mới
    }
    if (rebuild && g.scene) g.scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.needsUpdate = true; }); });
    applyAnisotropy(g, P.aniso);
  }
  // Lọc dị hướng: kết cấu bề mặt (đất, đường, tường, giáp xe — những cái đã bật lọc khi tạo) nét hơn khi nhìn nghiêng
  // từ camera thấp. Áp lên kết cấu đang có trong cảnh; gọi lại lúc vào trận (bản đồ mới tạo kết cấu mới).
  function applyAnisotropy(g, want) {
    if (!g.scene || !g.renderer.capabilities) return;
    const max = g.renderer.capabilities.getMaxAnisotropy ? g.renderer.capabilities.getMaxAnisotropy() : 1;
    const seen = new Set();
    const fix = (t) => {
      if (!t || !t.isTexture || seen.has(t)) return;
      seen.add(t);
      if (t._baseAniso === undefined) t._baseAniso = t.anisotropy || 1;
      if (t._baseAniso < 4) return;   // kết cấu hiệu ứng / chữ: giữ nguyên
      const a = want ? Math.min(max, Math.max(t._baseAniso, want)) : t._baseAniso;
      if (t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; }
    };
    g.scene.traverse(o => {
      const m = o.material;
      if (!m) return;
      for (const x of (Array.isArray(m) ? m : [m])) {
        fix(x.map); fix(x.normalMap); fix(x.roughnessMap); fix(x.bumpMap);
        if (x.uniforms) for (const k in x.uniforms) { const v = x.uniforms[k] && x.uniforms[k].value; if (v && v.isTexture) fix(v); }
      }
    });
  }
  function apply() { applyAudio(); applyGraphics(); }
  // game.js đọc khi tạo renderer (khử răng cưa chỉ đổi được khi tải lại trang)
  function wantAntialias() { return S.aa !== false; }

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'game-menu';
    root.className = 'gm-overlay hidden';
    root.innerHTML = '<div class="gm-card"><button type="button" class="gm-close" title="Đóng [Esc]"><i class="ti ti-x"></i></button><div class="gm-body"></div></div>';
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target === root) { close(); return; }
      if (e.target.closest('.gm-close')) { close(); return; }
      const b = e.target.closest('[data-act]');
      if (b) onAct(b.dataset.act, b);
    });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.name === 'vol' || el.name === 'engine' || el.name === 'music') {
        S[el.name] = Number(el.value) / 100;
        const out = root.querySelector(`[data-out="${el.name}"]`);
        if (out) out.textContent = el.value + '%';
        applyAudio(); save();
      }
    });
    root.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  }

  const inMatch = () => { const g = game(); return !!(g && g.isGameStarted && !g.isGameOver); };
  const isNet = () => { const g = game(); return !!(g && g.netSync && !g.netSync.detached); };

  function render() {
    const body = root.querySelector('.gm-body');
    if (view === 'pause') {
      body.innerHTML = `
        <h3 class="gm-title"><i class="ti ti-menu-2"></i> MENU</h3>
        ${isNet() ? '<p class="gm-note">Trận đấu nhiều người vẫn đang diễn ra trong lúc mở menu.</p>' : ''}
        <div class="gm-list">
          <button class="gm-btn primary" data-act="resume"><i class="ti ti-player-play"></i> Tiếp tục chiến đấu</button>
          <button class="gm-btn" data-act="settings"><i class="ti ti-adjustments"></i> Cài đặt</button>
          <button class="gm-btn" data-act="controls"><i class="ti ti-keyboard"></i> Phím điều khiển</button>
          <button class="gm-btn danger" data-act="leave"><i class="ti ti-door-exit"></i> Rời trận về sảnh</button>
        </div>`;
    } else if (view === 'leave') {
      body.innerHTML = `
        <h3 class="gm-title"><i class="ti ti-door-exit"></i> Rời trận?</h3>
        <p class="gm-note">Trận này sẽ không được tính kết quả, kinh nghiệm và Bạc.</p>
        <div class="gm-row">
          <button class="gm-btn" data-act="pause">Ở lại</button>
          <button class="gm-btn danger" data-act="leave-yes"><i class="ti ti-door-exit"></i> Rời trận</button>
        </div>`;
    } else if (view === 'settings') {
      const q = (k, label, sub) => `<button class="gm-seg${S.gfx === k ? ' on' : ''}" data-act="gfx" data-v="${k}"><b>${label}${suggested === k ? ' <i class="ti ti-star-filled" title="Hợp với máy này"></i>' : ''}</b><small>${sub}</small></button>`;
      body.innerHTML = `
        <h3 class="gm-title"><i class="ti ti-adjustments"></i> CÀI ĐẶT</h3>
        <div class="gm-field"><span><i class="ti ti-volume"></i> Âm lượng tổng</span><input type="range" name="vol" min="0" max="100" value="${Math.round(S.vol * 100)}"><b data-out="vol">${Math.round(S.vol * 100)}%</b></div>
        <div class="gm-field"><span><i class="ti ti-music"></i> Nhạc nền</span><input type="range" name="music" min="0" max="100" value="${Math.round(S.music * 100)}"><b data-out="music">${Math.round(S.music * 100)}%</b></div>
        <div class="gm-field"><span><i class="ti ti-engine"></i> Tiếng động cơ xe</span><input type="range" name="engine" min="0" max="100" value="${Math.round(S.engine * 100)}"><b data-out="engine">${Math.round(S.engine * 100)}%</b></div>
        <div class="gm-sub">Chất lượng hình ảnh</div>
        <div class="gm-segs">${q('low', 'Thấp', 'Máy yếu: tắt bóng đổ & cỏ')}${q('medium', 'Vừa', 'Bóng đổ thường')}${q('high', 'Cao', 'Bóng đổ mềm, nét hơn')}${q('ultra', 'Siêu cao', 'Card rời: nét nhất, bóng chi tiết')}</div>
        ${suggested ? `<p class="gm-note"><i class="ti ti-star-filled"></i> Hợp với máy này</p>` : ''}
        <label class="gm-check"><input type="checkbox" data-act="smooth" ${S.smooth !== false ? 'checked' : ''}> Tự giữ mượt <small>(máy vẽ không kịp thì tạm giảm độ nét một chút)</small></label>
        <label class="gm-check"><input type="checkbox" data-act="aa" ${S.aa !== false ? 'checked' : ''}> Khử răng cưa cạnh hình <small>(áp dụng sau khi tải lại trang)</small></label>
        <div class="gm-row"><button class="gm-btn" data-act="${inMatch() ? 'pause' : 'close'}"><i class="ti ti-arrow-left"></i> ${inMatch() ? 'Quay lại' : 'Xong'}</button><button class="gm-btn" data-act="controls"><i class="ti ti-keyboard"></i> Phím điều khiển</button></div>`;
    } else if (view === 'controls') {
      body.innerHTML = `<h3 class="gm-title"><i class="ti ti-keyboard"></i> PHÍM ĐIỀU KHIỂN</h3>${controlsTable()}
        <div class="gm-row"><button class="gm-btn" data-act="${inMatch() ? 'pause' : 'settings'}"><i class="ti ti-arrow-left"></i> Quay lại</button></div>`;
    } else if (view === 'notice') {
      const N = render.notice || {};
      body.innerHTML = `<h3 class="gm-title"><i class="ti ti-${N.icon || 'alert-triangle'}"></i> ${N.title || ''}</h3><p class="gm-note">${N.text || ''}</p>
        <div class="gm-row">${(N.buttons || []).map((b, i) => `<button class="gm-btn${b.primary ? ' primary' : ''}" data-act="notice" data-i="${i}">${b.label}</button>`).join('')}</div>`;
    }
  }

  const K = (k) => `<kbd>${k}</kbd>`;
  function controlsTable() {
    const rows = [
      [`${K('W')} ${K('S')}`, 'Tiến / lùi'],
      [`${K('A')} ${K('D')}`, 'Rẽ trái / phải (xe bánh lốp phải đang chạy mới rẽ được)'],
      [K('Shift'), 'Giữ để chạy hết tốc lực'],
      ['<i class="ti ti-mouse"></i> Chuột trái vào xe địch', 'Khóa mục tiêu — nòng tự ngắm & đón đầu'],
      ['<i class="ti ti-mouse"></i> Chuột trái xuống đất', 'Ngắm bắn vào điểm đó'],
      ['<i class="ti ti-mouse"></i> Chuột phải', 'Tự lái tới điểm đó (tự tìm đường)'],
      [K('Space'), 'Bắn (giữ để xả liên thanh)'],
      [K('Tab'), 'Khóa / đổi mục tiêu tiếp theo'],
      [`${K('1')} ${K('2')} ${K('3')} hoặc ${K('Q')} ${K('E')} ${K('R')}`, 'Đổi loại đạn'],
      [K('3'), 'Tên lửa chống tăng (xe trinh sát): chọn ô 3 rồi bắn'],
      [K('G'), 'Phóng lựu đạn khói (cần trang bị)'],
      [K('B'), 'Pháo tự hành: đổi cách bắn (tự chọn / bắn thẳng / bắn cầu vồng)'],
      [`${K('←')} ${K('→')} ${K('↑')} ${K('↓')}`, 'Xoay tháp / nâng hạ nòng bằng tay'],
      [K('M'), 'Bản đồ lớn (nhấp xe địch để khóa, nhấp đúp để ngắm điểm thật xa, chuột phải để lái xe tới)'],
      ['<i class="ti ti-mouse"></i> Con lăn chuột', 'Camera gần / xa (kéo xa để nhìn từ trên cao)'],
      ['<i class="ti ti-mouse"></i> Giữ chuột giữa + kéo', 'Nhìn quanh xe'],
      [K('V'), 'Đổi góc nhìn: bám sau xe / nhìn cao'],
      [`${K('Ctrl')} hoặc ${K('C')}`, 'Ngắm bắn: kính ngắm trên tháp — rê chuột ngắm tự do, nhấp trái / Space bắn, vẫn lái W A S D được, Tab tự khóa xe địch gần tâm kính, lăn chuột phóng to; pháo tự hành: drone điều khiển hỏa lực, W A S D lái drone. Bấm lại để thoát'],
      [K('I'), 'Xem chi tiết xe'],
      [K('Esc'), 'Menu / cài đặt']
    ];
    return `<table class="gm-keys">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
  }

  function open(v) {
    build();
    view = v || (inMatch() ? 'pause' : 'settings');
    render();
    root.classList.remove('hidden');
    const g = game();
    if (g) { g.keys = {}; g.isPointerFiring = false; }
  }
  function close() {
    if (!root) return;
    root.classList.add('hidden');
    view = null;
  }
  const isOpen = () => !!(root && !root.classList.contains('hidden'));

  function onAct(act, b) {
    if (act === 'resume' || act === 'close') close();
    else if (act === 'settings' || act === 'controls' || act === 'pause' || act === 'leave') { view = act; render(); }
    else if (act === 'leave-yes') { close(); leaveMatch(); }
    else if (act === 'gfx') { S.gfx = b.dataset.v; S.gfxUser = true; save(); applyGraphics(); render(); }
    else if (act === 'smooth') { S.smooth = !!b.checked; save(); applyGraphics(); }
    else if (act === 'aa') { S.aa = !!b.checked; save(); }
    else if (act === 'notice') {
      const N = render.notice || {}, btn = (N.buttons || [])[Number(b.dataset.i)];
      close();
      if (btn && btn.onClick) btn.onClick();
    }
  }

  // Rời trận giữa chừng: không tính kết quả, dọn trận, về sảnh (rời phòng mạng)
  function leaveMatch() {
    const g = game();
    if (!g || !g.isGameStarted) return;
    g.isGameOver = true;
    g.keys = {};
    if (g.tacticalMap && g.tacticalMap.isOpen && g.tacticalMap.toggle) g.tacticalMap.toggle(false);
    if (typeof g.restartMatch === 'function') g.restartMatch();
  }

  function notice(opts) {
    render.notice = opts;
    open('notice');
  }

  // Mất kết nối máy chủ (NetTransport phát '$close')
  function onConnectionLost() {
    const g = game();
    if (g && g.isGameStarted && !g.isGameOver) {
      if (g.addCombatLog) g.addCombatLog('[[wifi-off]] Mất kết nối máy chủ — các xe khác do máy điều khiển tiếp', 'defeat');
      notice({
        icon: 'wifi-off', title: 'Mất kết nối máy chủ',
        text: 'Trận vẫn tiếp tục: xe của những người chơi khác giờ do máy điều khiển. Bạn có thể chơi hết trận này, hoặc về sảnh để tìm trận mới.',
        buttons: [{ label: '<i class="ti ti-player-play"></i> Chơi tiếp với máy', primary: true }, { label: '<i class="ti ti-home"></i> Về sảnh', onClick: leaveMatch }]
      });
    }
  }

  // Lần đầu vào trận: thẻ phím tắt gọn ở giữa màn hình (bấm "Đã hiểu" hoặc tự ẩn sau 14 giây)
  function maybeShowFirstHint() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
    if (seen || /[?&]lab=/.test(location.search)) return;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    const el = document.createElement('div');
    el.className = 'gm-hint';
    el.innerHTML = `<div class="gm-hint-head"><b><i class="ti ti-keyboard"></i> Phím cơ bản</b><button class="gm-btn primary small">Đã hiểu</button></div>
      <div class="gm-hint-grid">
        <span>${K('W')}${K('S')}</span><span>Tiến / lùi</span>
        <span>${K('A')}${K('D')}</span><span>Rẽ trái / phải</span>
        <span><i class="ti ti-mouse"></i> trái</span><span>Khóa địch / ngắm điểm</span>
        <span><i class="ti ti-mouse"></i> phải</span><span>Tự lái tới điểm</span>
        <span>${K('Space')}</span><span>Bắn</span>
        <span>${K('Tab')}</span><span>Đổi mục tiêu</span>
        <span>${K('M')}</span><span>Bản đồ lớn</span>
        <span>${K('V')}</span><span>Nhìn cao / bám sau xe</span>
        <span>${K('Ctrl')}${K('C')}</span><span>Ngắm bắn</span>
        <span>${K('Esc')}</span><span>Menu & tất cả phím</span>
      </div>`;
    document.body.appendChild(el);
    const hide = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.querySelector('button').addEventListener('click', hide);
    setTimeout(hide, 14000);
  }

  // ---------------------------------------------------------------------------
  // PHÍM ESC + NÚT BÁNH RĂNG
  // ---------------------------------------------------------------------------
  // Pha "capture" trên window: chạy trước các bộ nghe phím khác -> còn biết bản đồ lớn / phòng xem xe đang mở
  window.addEventListener('keydown', (e) => {
    if (isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (view === 'pause' || view === 'notice' || !inMatch()) close(); else { view = 'pause'; render(); } return; }
      if (!root.contains(e.target)) e.stopImmediatePropagation();   // menu đang mở: không lái / bắn
      return;
    }
    if (e.key !== 'Escape') return;
    const g = game();
    if (!g || !g.isGameStarted || g.isGameOver) return;
    if (g.tacticalMap && g.tacticalMap.isOpen) return;                    // Esc đóng bản đồ lớn
    if (window.tankInspector && window.tankInspector.isOpen) return;      // Esc đóng phòng xem xe
    if (document.querySelector('.acc-overlay:not(.hidden)')) return;      // Esc đóng bảng tài khoản
    e.preventDefault();
    open('pause');
  }, true);

  function init() {
    const gear = document.querySelector('.mm-gear-btn');
    if (gear) { gear.title = 'Cài đặt & phím điều khiển'; gear.addEventListener('click', (e) => { e.stopPropagation(); open('settings'); }); }  // nút nằm trong thẻ hồ sơ: không để mở thêm bảng hồ sơ
    // âm thanh bật lười (sau thao tác đầu tiên) -> áp lại âm lượng khi đã có
    const tryAudio = () => {
      const se = window.soundEngine;
      if (!se || !se.ctx) return;
      applyAudio();
      window.removeEventListener('pointerdown', tryAudio, true);
      window.removeEventListener('keydown', tryAudio, true);
    };
    window.addEventListener('pointerdown', tryAudio, true);
    window.addEventListener('keydown', tryAudio, true);
    applyAudio();   // lưu sẵn mức âm lượng vào bộ âm thanh (áp khi âm thanh được bật)
    const waitGame = () => { const g = game(); if (g && g.renderer) apply(); else setTimeout(waitGame, 300); };
    waitGame();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, close, isOpen, notice, onConnectionLost, maybeShowFirstHint, apply, applyGraphics, wantAntialias, leaveMatch, get settings() { return S; } };
})();
window.GameMenu = GameMenu;
