/**
 * TÀI KHOẢN NGƯỜI CHƠI (phía máy khách)
 * - Cửa sổ Đăng nhập / Tạo tài khoản (tên + mật khẩu), hoặc "Chơi không cần tài khoản".
 * - Hồ sơ ở góc sảnh: tên hiển thị, quân hàm + thanh kinh nghiệm; bấm vào -> bảng thành tích, đổi tên, đổi mật khẩu, đăng xuất.
 * - Nhớ xe & bản đồ chọn lần trước; cuối trận tự gửi kết quả -> cộng kinh nghiệm, lên cấp.
 * - Mở bằng file:// (không có máy chủ): chạy như cũ, không có tài khoản.
 * - Ví Bạc + kho trang bị (mua / lắp ở phòng xem xe — tank_inspector.js); bộ trang bị gửi kèm slot khi ghép trận.
 */
const Account = (() => {
  const TOKEN_KEY = 'spg_account_token';
  const PROFILE_KEY = 'spg_account_profile';   // bản nhớ tạm hồ sơ (chỉ để hiện ngay, máy chủ vẫn là nguồn chuẩn)
  const online = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
  const TANK_NAMES = { ALL_ROUNDER: 'HALBERD MK.3', GATLING: 'HAILSTORM R6', ARTILLERY: 'ARBALEST 155', SCOUT: 'MARTEN R4' };
  const MAP_NAMES = { DESERT: 'Sa mạc lửa', URBAN: 'Đô thị đổ nát', JUNGLE: 'Rừng rậm', HIGHLAND: 'Cao nguyên', RIVER_LAKE: 'Sông hồ' };
  let profile = null, guest = false, saveTimer = null, applying = false;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PROFILE_KEY); } } catch (e) {} }
  function cachedProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { return null; } }

  async function api(path, body, keepalive) {
    const t = token();
    const r = await fetch('/api/' + path, {
      method: body === undefined ? 'GET' : 'POST', keepalive: !!keepalive,
      headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(data.error || ('Lỗi ' + r.status)); err.status = r.status; throw err; }
    return data;
  }

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  function buildDom() {
    const auth = document.createElement('div');
    auth.id = 'acc-auth';
    auth.className = 'acc-overlay hidden';
    auth.innerHTML = `
      <form class="acc-card" autocomplete="on" novalidate>
        <div class="acc-tabs">
          <button type="button" class="acc-tab active" data-mode="login">Đăng nhập</button>
          <button type="button" class="acc-tab" data-mode="register">Tạo tài khoản</button>
        </div>
        <label class="acc-field"><span>Tên đăng nhập</span>
          <input name="username" autocomplete="username" maxlength="20" spellcheck="false" placeholder="vd: phao_thu_01"></label>
        <label class="acc-field"><span>Mật khẩu</span>
          <input name="password" type="password" autocomplete="current-password" maxlength="72" placeholder="ít nhất 6 ký tự"></label>
        <label class="acc-field acc-only-register"><span>Nhập lại mật khẩu</span>
          <input name="password2" type="password" autocomplete="new-password" maxlength="72"></label>
        <div class="acc-error" role="alert"></div>
        <button type="submit" class="acc-primary">Đăng nhập</button>
        <button type="button" class="acc-link" data-act="guest">Chơi không cần tài khoản</button>
      </form>`;
    document.body.appendChild(auth);

    const panel = document.createElement('div');
    panel.id = 'acc-panel';
    panel.className = 'acc-overlay hidden';
    panel.innerHTML = `<div class="acc-card acc-wide"><button type="button" class="acc-close" title="Đóng"><i class="ti ti-x"></i></button><div class="acc-body"></div></div>`;
    document.body.appendChild(panel);

    // ---- sự kiện cửa sổ đăng nhập
    const form = $('form', auth);
    form.addEventListener('keydown', (e) => e.stopPropagation());   // gõ phím không điều khiển xe
    let mode = 'login';
    const setMode = (m) => {
      mode = m;
      auth.querySelectorAll('.acc-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
      auth.classList.toggle('register', m === 'register');
      $('.acc-primary', auth).textContent = m === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
      form.password.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      $('.acc-error', auth).textContent = '';
    };
    auth.querySelectorAll('.acc-tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('[data-act="guest"]', auth).addEventListener('click', () => { guest = true; hide(auth); renderHeader(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = form.username.value.trim(), password = form.password.value;
      const errEl = $('.acc-error', auth);
      if (mode === 'register' && password !== form.password2.value) { errEl.textContent = 'Hai lần nhập mật khẩu không khớp'; return; }
      const btn = $('.acc-primary', auth);
      btn.disabled = true; errEl.textContent = '';
      try {
        const r = await api(mode === 'login' ? 'login' : 'register', { username, password });
        setToken(r.token);
        form.password.value = form.password2.value = '';
        guest = false;
        hide(auth);
        setProfile(r.profile, true);
      } catch (err) {
        errEl.textContent = err.message;
      } finally { btn.disabled = false; }
    });

    // ---- bảng hồ sơ
    $('.acc-close', panel).addEventListener('click', () => hide(panel));
    panel.addEventListener('click', (e) => { if (e.target === panel) hide(panel); });

    // bấm vào hồ sơ góc sảnh
    const prof = $('.mm-commander-profile');
    if (prof) {
      prof.style.cursor = 'pointer';
      prof.title = online ? 'Hồ sơ & thành tích' : 'Chơi ngoại tuyến (không có tài khoản)';
      prof.addEventListener('click', (e) => {
        if (e.target.closest('.mm-gear-btn')) return;   // bánh răng = cài đặt (game_menu.js), không phải hồ sơ
        if (profile) openPanel(); else if (online) show(auth);
      });
    }
    // nhớ xe / bản đồ vừa chọn
    document.addEventListener('click', (e) => {
      if (applying || !profile) return;
      const tank = e.target.closest('.mm-class-card'), map = e.target.closest('.mm-map-card');
      if (tank && !e.target.closest('.btn-inspect-tank-3d')) queueSave({ lastTank: tank.getAttribute('data-tank-type') });
      if (map) queueSave({ lastMap: map.getAttribute('data-map-type') });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) hide(panel);
    });
  }
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  function renderHeader() {
    // Thẻ chỉ huy góc sảnh (2 dòng): tên + cấp | Bạc · quân hàm + kinh nghiệm | trận thắng; thanh kinh nghiệm ở viền dưới
    const nameEl = $('#mm-display-name'), rankEl = $('.mm-commander-profile .rank-text');
    const bar = $('.mm-commander-profile .acc-xpbar'), lvEl = $('#mm-level'), xpEl = $('#mm-xp-text'), meta = $('#mm-cmd-meta');
    const silverEl = $('.mm-commander-profile .acc-silver'), winsEl = $('#mm-stat-wins');
    const tiSilver = document.getElementById('ti-silver');   // ô Bạc góc trên màn xem xe (tank_inspector.js)
    if (tiSilver) {
      tiSilver.classList.toggle('off', !profile);
      if (profile) {
        const b = tiSilver.querySelector('b'), txt = fmtSilver(profile.silver);
        if (b.textContent !== txt) { b.textContent = txt; tiSilver.classList.remove('bump'); void tiSilver.offsetWidth; tiSilver.classList.add('bump'); }
      }
    }
    if (profile) {
      const st = profile.stats || {}, n = v => Math.round(v || 0).toLocaleString('vi-VN');
      if (nameEl) nameEl.textContent = profile.displayName;
      if (rankEl) rankEl.textContent = profile.rankText;
      if (lvEl) { lvEl.textContent = 'CẤP ' + (profile.level || 1); lvEl.classList.remove('hidden'); }
      if (xpEl) xpEl.textContent = `${n(profile.xpInLevel)} / ${n(profile.xpToNext)} KN`;
      if (bar) { bar.style.display = ''; bar.firstChild.style.width = Math.round(100 * profile.xpInLevel / profile.xpToNext) + '%'; bar.title = `${profile.xpInLevel} / ${profile.xpToNext} kinh nghiệm tới cấp sau`; }
      if (meta) meta.classList.remove('hidden');
      if (silverEl) UIIcons.set(silverEl, `[[coins]] ${fmtSilver(profile.silver)} Bạc`);
      if (winsEl) UIIcons.set(winsEl, `[[trophy]] ${n(st.wins)}/${n(st.matches)} trận`);
    } else {
      if (nameEl) nameEl.textContent = 'Chưa đăng nhập';
      if (rankEl) rankEl.textContent = online ? 'Bấm để đăng nhập' : 'Chơi ngoại tuyến';
      if (lvEl) lvEl.classList.add('hidden');
      if (xpEl) xpEl.textContent = '';
      if (bar) bar.style.display = 'none';
      if (meta) meta.classList.add('hidden');
    }
  }

  function setProfile(p, applyChoices) {
    profile = p;
    try { if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
    renderHeader();
    const mm = window.matchmakingController || (window.game && window.game.matchmaking);
    if (mm && !p && mm.guestName) {
      // đăng xuất: về lại tên khách, không giữ tên tài khoản cũ
      mm.myName = mm.guestName;
      const me = mm.slots && mm.slots.find(s => s.isMe);
      if (me) me.name = mm.guestName;
      if (mm.net) mm.net.name = mm.guestName;
      if (typeof mm.renderLobby === 'function') mm.renderLobby();
    }
    if (mm && p) {
      mm.myName = p.displayName;
      const me = mm.slots && mm.slots.find(s => s.isMe);
      if (me) me.name = p.displayName;
      if (mm.net) mm.net.name = p.displayName;
      if (applyChoices && mm.state === 'IDLE') {
        applying = true;
        try {
          const tc = document.querySelector(`.mm-class-card[data-tank-type="${p.lastTank}"]`);
          if (tc) tc.click();
          const mc = document.querySelector(`.mm-map-card[data-map-type="${p.lastMap}"]`);
          if (mc) mc.click();
        } finally { applying = false; }
      }
      if (typeof mm.renderLobby === 'function') mm.renderLobby();
    }
  }

  const fmtSilver = (n) => Math.round(n || 0).toLocaleString('vi-VN');

  // ---------------------------------------------------------------------------
  // KHO TRANG BỊ
  // ---------------------------------------------------------------------------
  /** Bộ trang bị mang vào trận của xe `tank`: { kit, stock } (kit đã kiểm tra, số đạn mang thêm không quá kho) */
  // Chưa đăng nhập / chơi ngoại tuyến: đồ cơ bản (miễn phí) chọn lưu ngay trên máy này
  const GUEST_KEY = 'spg_guest_loadout';
  function guestLoadouts() { try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function loadoutOf(tank) {
    if (profile && profile.armory) return (profile.armory.loadouts && profile.armory.loadouts[tank]) || { m: [], a: {} };
    const g = guestLoadouts()[tank] || { m: [] };
    return { m: (g.m || []).filter(id => typeof Equipment !== 'undefined' && Equipment.isFree(id)), a: {} };
  }
  function kitFor(tank) {
    const A = profile && profile.armory;
    if (!A && typeof Equipment !== 'undefined') {
      // khách: chỉ đạn chính (đạn khác phải mua bằng tài khoản)
      const lo = loadoutOf(tank);
      return { kit: lo.m.length ? Equipment.sanitize({ m: lo.m, p: [], a: {} }, tank) : null, stock: {} };
    }
    if (!A || typeof Equipment === 'undefined') return { kit: null, stock: {} };
    const lo = (A.loadouts && A.loadouts[tank]) || { m: [], a: {} };
    const stock = Object.assign({}, (A.stock && A.stock[tank]) || {});
    // Đạn mua thêm: mặc định mang tối đa mỗi lần xuất kích (không quá số còn trong kho)
    const a = {}, shop = Equipment.AMMO_SHOP[tank] || {};
    for (const k in shop) {
      const want = (lo.a && lo.a[k] !== undefined) ? lo.a[k] : shop[k].max;
      const n = Math.min(want, stock[k] || 0);
      if (n > 0) a[k] = n;
    }
    const p = ((A.owned && A.owned[tank]) || []).filter(id => Equipment.PREMIUM[id]);
    return { kit: Equipment.sanitize({ m: lo.m, p, a }, tank), stock };
  }
  function owns(tank, id) {
    const o = profile && profile.armory && profile.armory.owned && profile.armory.owned[tank];
    return !!(o && o.indexOf(id) >= 0);
  }
  function armoryChanged() {
    const mm = window.matchmakingController || (window.game && window.game.matchmaking);
    if (mm && typeof mm.onArmoryChanged === 'function') mm.onArmoryChanged();
    try { window.dispatchEvent(new CustomEvent('armory-changed')); } catch (e) {}
  }
  async function buy(tank, what) {
    const r = await api('shop/buy', Object.assign({ tank }, what));
    setProfile(r.profile, false);
    armoryChanged();
    return r.profile;
  }
  // Trả lại n viên đạn mua thêm (hoàn đúng giá)
  async function sell(tank, ammo, n) {
    const r = await api('shop/sell', { tank, ammo, n });
    setProfile(r.profile, false);
    armoryChanged();
    return r.profile;
  }
  // Nhận đồ nâng cao bằng xem quảng cáo: adStart -> (xem hết quảng cáo) -> claim
  async function adStart(tank, item) { return api('ad/start', { tank, item }); }
  async function claim(tank, item, token) {
    const r = await api('shop/claim', { tank, item, token });
    setProfile(r.profile, false);
    armoryChanged();
    return r.profile;
  }
  async function setLoadout(tank, m, a) {
    if (!profile) {
      const g = guestLoadouts();
      g[tank] = { m: (m || []).filter(id => Equipment.isFree(id)) };
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch (e) {}
      armoryChanged();
      return null;
    }
    const r = await api('loadout', { tank, m, a });
    setProfile(r.profile, false);
    armoryChanged();
    return r.profile;
  }

  function queueSave(patch) {
    queueSave.pending = Object.assign(queueSave.pending || {}, patch);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const body = queueSave.pending; queueSave.pending = null;
      try { const r = await api('profile', body); profile = r.profile; } catch (e) {}
    }, 600);
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    return h ? `${h} giờ ${m} phút` : `${m} phút`;
  }
  function fmtAgo(t) {
    if (!t) return '';
    const s = Math.max(0, (Date.now() - (t < 1e12 ? t * 1000 : t)) / 1000);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return Math.floor(s / 60) + ' phút trước';
    if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
    return Math.floor(s / 86400) + ' ngày trước';
  }
  function openPanel() {
    const panel = $('#acc-panel'), body = $('.acc-body', panel), p = profile, S = p.stats;
    const n = v => Math.round(v || 0).toLocaleString('vi-VN');
    const wr = S.matches ? Math.round(100 * S.wins / S.matches) : 0;
    const kd = S.deaths ? (S.kills / S.deaths).toFixed(2) : String(S.kills);
    const fav = Object.entries(S.byTank || {}).sort((a, b) => b[1].matches - a[1].matches)[0];
    const pct = Math.round(100 * p.xpInLevel / p.xpToNext);
    const RES = { win: 'Thắng', draw: 'Hòa', loss: 'Thua' };
    const hist = (p.history || []).slice().reverse().map(h => `
      <li class="r-${h.result}">
        <span class="acc-res">${RES[h.result] || 'Thua'}</span>
        <span class="acc-h-main"><b>${esc(TANK_NAMES[h.tank] || h.tank)}</b><small>${esc(MAP_NAMES[h.map] || '—')}${h.t ? ' · ' + fmtAgo(h.t) : ''}</small></span>
        <span class="acc-h-kd">${h.kills} hạ · ${h.deaths || 0} chết</span>
        <span class="acc-h-xp">+${n(h.xp)} KN</span>
      </li>`).join('');
    const empty = !S.matches;
    body.innerHTML = `
      <div class="acc-kicker">Hồ sơ chỉ huy</div>
      <div class="acc-head">
        <div class="acc-avatar"><img src="assets/commander_avatar.jpg" alt=""></div>
        <div class="acc-head-info">
          <label class="acc-name-wrap" title="Bấm để đổi tên hiển thị">
            <input class="acc-name" value="${esc(p.displayName)}" maxlength="24" spellcheck="false"><i class="ti ti-pencil"></i>
          </label>
          <div class="acc-sub">@${esc(p.username)}<span class="acc-dot"></span><span class="acc-silver-sm"><i class="ti ti-coins"></i> ${fmtSilver(p.silver)} Bạc</span></div>
          <div class="acc-rank-row">
            <span class="acc-rank"><i class="ti ti-star-filled"></i> ${esc(p.rankText)}</span>
            <span class="acc-lv">Cấp ${p.level || 1}</span>
          </div>
          <div class="acc-xpbar big"><i style="width:${pct}%"></i></div>
          <div class="acc-xptext"><span>${n(p.xpInLevel)} / ${n(p.xpToNext)} KN</span><span>còn ${n(p.xpToNext - p.xpInLevel)} KN lên cấp ${(p.level || 1) + 1}</span></div>
        </div>
      </div>
      <div class="acc-stats${empty ? ' is-empty' : ''}">
        <div><b>${n(S.matches)}</b><span>Trận</span></div>
        <div><b>${wr}<small>%</small></b><span>Tỉ lệ thắng</span></div>
        <div><b>${n(S.kills)}</b><span>Hạ gục</span></div>
      </div>
      <dl class="acc-minor">
        <div><dt>Hạ / chết</dt><dd>${kd}</dd></div>
        <div><dt>Sát thương</dt><dd>${n(S.damage)}</dd></div>
        <div><dt>Thời gian chơi</dt><dd>${fmtTime(S.playSec || 0)}</dd></div>
        ${fav ? `<div><dt>Xe hay dùng</dt><dd>${esc(TANK_NAMES[fav[0]] || fav[0])}</dd></div>` : ''}
      </dl>
      <div class="acc-sec">Trận gần đây</div>
      ${hist ? `<ul class="acc-hist">${hist}</ul>` : `<div class="acc-empty"><i class="ti ti-target"></i><div><b>Chưa có trận nào</b><span>Xuất trận để bắt đầu ghi thành tích.</span></div></div>`}
      <form class="acc-pw-form hidden">
        <input type="password" name="o" placeholder="Mật khẩu hiện tại" autocomplete="current-password">
        <input type="password" name="n" placeholder="Mật khẩu mới (ít nhất 6 ký tự)" autocomplete="new-password">
        <div class="acc-pw-row"><span class="acc-error"></span><button type="submit" class="acc-primary small">Lưu mật khẩu</button></div>
      </form>
      <div class="acc-foot">
        <button type="button" class="acc-ghost" data-act="pw"><i class="ti ti-key"></i> Đổi mật khẩu</button>
        <button type="button" class="acc-ghost danger" data-act="logout"><i class="ti ti-logout"></i> Đăng xuất</button>
      </div>`;
    // đổi tên hiển thị
    const nameIn = $('.acc-name', body);
    const commitName = async () => {
      const v = nameIn.value.trim();
      if (!v || v === profile.displayName) { nameIn.value = profile.displayName; return; }
      try { const r = await api('profile', { displayName: v }); setProfile(r.profile, false); nameIn.value = r.profile.displayName; }
      catch (e) { nameIn.value = profile.displayName; alert(e.message); }
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); e.stopPropagation(); });
    nameIn.addEventListener('blur', commitName);
    // đổi mật khẩu
    const pf = $('.acc-pw-form', body), pwBtn = $('[data-act="pw"]', body);
    pwBtn.addEventListener('click', () => {
      const open = pf.classList.toggle('hidden') === false;
      pwBtn.classList.toggle('active', open);
      if (open) pf.o.focus();
    });
    pf.addEventListener('keydown', (e) => e.stopPropagation());
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.acc-error', pf);
      try { await api('password', { oldPassword: pf.o.value, newPassword: pf.n.value }); err.textContent = 'Đã đổi mật khẩu'; err.classList.add('ok'); pf.o.value = pf.n.value = ''; }
      catch (ex) { err.classList.remove('ok'); err.textContent = ex.message; }
    });
    $('[data-act="logout"]', body).addEventListener('click', async () => {
      try { await api('logout', {}); } catch (e) {}
      setToken(null); guest = false; setProfile(null, false);
      hide(panel); show($('#acc-auth'));
    });
    show(panel);
  }

  // ---------------------------------------------------------------------------
  // KẾT QUẢ TRẬN
  // ---------------------------------------------------------------------------
  function hookGame(g) {
    if (!g || g._accHooked) return;
    g._accHooked = true;
    const wrap = (name, resultOf) => {
      const orig = g[name];
      if (typeof orig !== 'function') return;
      g[name] = function (...args) {
        const already = this.isGameOver;
        const out = orig.apply(this, args);
        if (!already && this.isGameOver) reportMatch(this, resultOf.apply(this, args));
        return out;
      };
    };
    // rời trận / chơi lại: báo nốt số đạn đã bắn trước khi dọn xe
    const origRestart = g.restartMatch;
    if (typeof origRestart === 'function') g.restartMatch = function (...args) { if (this.player) flushAmmo(this.player); return origRestart.apply(this, args); };
    addEventListener('pagehide', () => { if (g.player && g.isGameStarted) flushAmmo(g.player, true); });
    wrap('finishMatchByTime', function () {
      const my = this.player && this.player.team === 'RED' ? 'RED' : 'BLUE';
      const b = this.blueKills || 0, r = this.redKills || 0;
      if (b === r) return 'draw';
      return (b > r) === (my === 'BLUE') ? 'win' : 'loss';
    });
    wrap('finishMatchByCapture', function (winningTeam) {
      const my = this.player && this.player.team === 'RED' ? 'red' : 'blue';
      return String(winningTeam).toLowerCase() === my ? 'win' : 'loss';
    });
  }
  // Đạn mua thêm đã bắn: trừ kho ngay khi dùng (mỗi lần hồi sinh, hết trận, rời trận, đóng trang)
  // keepalive: request vẫn đi tiếp khi trang đang đóng
  function flushAmmo(u, keepalive) {
    if (!profile || typeof Equipment === 'undefined' || !Equipment.ammoDelta) return Promise.resolve();
    if (window.strongholdLab || /[?&]lab=/.test(location.search)) return Promise.resolve();
    if (!u || !u._eq || !u._eq.local) return Promise.resolve();
    const used = Equipment.ammoDelta(u);
    if (!Object.keys(used).length) return Promise.resolve();
    return api('shop/use', { tank: u.tankType, used }, keepalive)
      .then(r => { setProfile(r.profile, false); armoryChanged(); })
      .catch(() => { Equipment.ammoDelta(u, used); });   // lỗi mạng: giữ lại, lần sau gửi tiếp
  }

  async function reportMatch(g, result) {
    const card = $('#game-over-modal .stats-summary');
    let line = $('#acc-xp-line');
    if (!line && card) { line = document.createElement('div'); line.id = 'acc-xp-line'; line.className = 'acc-xp-line'; ($('#kd-podium') || card).after(line); }
    if (window.strongholdLab || /[?&]lab=/.test(location.search)) { if (line) line.textContent = ''; return; }
    if (!profile) { if (line) line.textContent = online ? 'Đăng nhập để lưu thành tích & lên cấp' : ''; return; }
    const P = g.player || {};
    const durationSec = Math.min(g.matchDuration || 1800, Math.floor((Date.now() - (g.matchStartTime || Date.now())) / 1000));
    const mm = g.matchmaking || window.matchmakingController || {};
    if (line) line.textContent = 'Đang lưu kết quả…';
    try {
      await flushAmmo(P);   // trừ kho phần đạn chưa báo (đạn đã báo lúc hồi sinh không trừ lại)
      const ammoUsed = {};
      const r = await api('match-result', { result, kills: P.kills || 0, deaths: g._playerDeaths || 0, damage: P.damageDealt || 0, shots: P.shotsFired || 0,
        tankType: P.tankType, mapType: mm.selectedMapType || (g.terrain && g.terrain.mapType), durationSec, ammoUsed, kdPlace: g._kdPlace || 0 });
      setProfile(r.profile, false);
      armoryChanged();
      const kd = r.kdPlace && r.kdBonus ? ` <span class="acc-kd">(có thưởng hạng ${r.kdPlace}: +${fmtSilver(r.kdBonus.silver)} Bạc)</span>` : '';
      if (line) line.innerHTML = `<b>+${r.gained} kinh nghiệm</b> · <b class="silver"><i class="ti ti-coins"></i> +${fmtSilver(r.silver)} Bạc</b>${kd}${r.levelUp ? ` · <span class="up">LÊN CẤP: ${esc(r.profile.rankText)}!</span>` : ` · ${esc(r.profile.rankText)}`}`
        + (r.verified ? ' <span class="acc-verified" title="Số hạ gục / sát thương lấy theo máy chủ"><i class="ti ti-shield-check"></i> Đã đối chiếu máy chủ</span>' : '');
    } catch (e) {
      if (line) line.textContent = e.status === 400 ? e.message : 'Không lưu được kết quả: ' + e.message;
    }
  }

  // ---------------------------------------------------------------------------
  async function init() {
    buildDom();
    renderHeader();
    // nối vào game khi đã khởi tạo
    const waitGame = () => { if (window.game) hookGame(window.game); else setTimeout(waitGame, 300); };
    waitGame();
    if (!online) return;
    if (window.strongholdLab || /[?&]lab=/.test(location.search)) return;   // trang thử nghiệm: không hỏi đăng nhập
    if (token()) {
      // hiện ngay hồ sơ đã nhớ (không chờ mạng), rồi lấy bản mới nhất từ máy chủ
      const cp = cachedProfile();
      if (cp) setProfile(cp, true);
      try { const r = await api('me'); setProfile(r.profile, !cp); return; }
      catch (e) { if (e.status === 401) { setToken(null); setProfile(null, false); } else { renderHeader(); return; } }   // máy chủ lỗi: chơi tiếp với hồ sơ đã nhớ / như khách
    }
    show($('#acc-auth'));
    setTimeout(() => { const i = $('#acc-auth input[name=username]'); if (i) i.focus(); }, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { get profile() { return profile; }, get online() { return online; }, api, kitFor, loadoutOf, owns, buy, sell, flushAmmo, adStart, claim, setLoadout, fmtSilver, showLogin: () => show($('#acc-auth')), TANK_NAMES, MAP_NAMES };
})();
window.Account = Account;
