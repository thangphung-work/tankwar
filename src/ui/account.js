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

  async function api(path, body) {
    const t = token();
    const r = await fetch('/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
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
      prof.addEventListener('click', () => { if (profile) openPanel(); else if (online) show(auth); });
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
    // Thẻ chỉ huy góc sảnh: tên + cấp · quân hàm + kinh nghiệm · thanh kinh nghiệm · Bạc / trận thắng / hạ gục
    const nameEl = $('#mm-display-name'), rankEl = $('.mm-commander-profile .rank-text');
    const bar = $('.mm-commander-profile .acc-xpbar'), lvEl = $('#mm-level'), xpEl = $('#mm-xp-text'), meta = $('#mm-cmd-meta');
    const silverEl = $('.mm-commander-profile .acc-silver'), winsEl = $('#mm-stat-wins'), killsEl = $('#mm-stat-kills');
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
      if (killsEl) UIIcons.set(killsEl, `[[target-arrow]] ${n(st.kills)} hạ`);
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
  function kitFor(tank) {
    const A = profile && profile.armory;
    if (!A || typeof Equipment === 'undefined') return { kit: null, stock: {} };
    const lo = (A.loadouts && A.loadouts[tank]) || { m: [], a: {} };
    const stock = Object.assign({}, (A.stock && A.stock[tank]) || {});
    const a = {};
    for (const k in lo.a || {}) a[k] = Math.min(lo.a[k], stock[k] || 0);
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
  async function setLoadout(tank, m, a) {
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
  function openPanel() {
    const panel = $('#acc-panel'), body = $('.acc-body', panel), p = profile, S = p.stats;
    const wr = S.matches ? Math.round(100 * S.wins / S.matches) : 0;
    const kd = S.deaths ? (S.kills / S.deaths).toFixed(2) : String(S.kills);
    const fav = Object.entries(S.byTank || {}).sort((a, b) => b[1].matches - a[1].matches)[0];
    const hist = (p.history || []).slice().reverse().map(h => `
      <tr class="r-${h.result}"><td>${h.result === 'win' ? 'Thắng' : h.result === 'draw' ? 'Hòa' : 'Thua'}</td>
      <td>${esc(TANK_NAMES[h.tank] || h.tank)}</td><td>${esc(MAP_NAMES[h.map] || '—')}</td>
      <td>${h.kills} hạ / ${h.deaths || 0} chết</td><td>+${h.xp} KN</td></tr>`).join('');
    body.innerHTML = `
      <div class="acc-head">
        <img src="assets/commander_avatar.jpg" alt="">
        <div class="acc-head-info">
          <div class="acc-name-row"><input class="acc-name" value="${esc(p.displayName)}" maxlength="24" title="Bấm để đổi tên hiển thị"><span class="acc-user">@${esc(p.username)}</span></div>
          <div class="acc-rank"><i class="ti ti-star"></i> ${esc(p.rankText)}</div>
          <div class="acc-xpbar big"><i style="width:${Math.round(100 * p.xpInLevel / p.xpToNext)}%"></i></div>
          <div class="acc-xptext">${p.xpInLevel} / ${p.xpToNext} kinh nghiệm để lên cấp</div>
        </div>
      </div>
      <div class="acc-stats">
        <div><b>${S.matches}</b><span>Trận</span></div>
        <div><b>${wr}%</b><span>Thắng</span></div>
        <div><b>${S.kills}</b><span>Hạ gục</span></div>
        <div><b>${kd}</b><span>Hạ / Chết</span></div>
        <div><b>${Math.round(S.damage)}</b><span>Sát thương</span></div>
        <div><b>${fmtTime(S.playSec)}</b><span>Thời gian</span></div>
      </div>
      ${fav ? `<div class="acc-fav">Xe hay dùng: <b>${esc(TANK_NAMES[fav[0]] || fav[0])}</b> · ${fav[1].matches} trận · ${fav[1].kills} hạ gục</div>` : ''}
      <div class="acc-sec">Trận gần đây</div>
      ${hist ? `<table class="acc-hist">${hist}</table>` : '<div class="acc-empty">Chưa có trận nào — xuất trận thôi!</div>'}
      <details class="acc-pw"><summary>Đổi mật khẩu</summary>
        <form class="acc-pw-form"><input type="password" name="o" placeholder="Mật khẩu hiện tại" autocomplete="current-password">
        <input type="password" name="n" placeholder="Mật khẩu mới (ít nhất 6 ký tự)" autocomplete="new-password">
        <button type="submit" class="acc-primary small">Lưu mật khẩu</button><span class="acc-error"></span></form>
      </details>
      <button type="button" class="acc-link danger" data-act="logout"><i class="ti ti-logout"></i> Đăng xuất</button>`;
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
    const pf = $('.acc-pw-form', body);
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
  async function reportMatch(g, result) {
    const card = $('#game-over-modal .stats-summary');
    let line = $('#acc-xp-line');
    if (!line && card) { line = document.createElement('div'); line.id = 'acc-xp-line'; line.className = 'acc-xp-line'; card.after(line); }
    if (window.strongholdLab || /[?&]lab=/.test(location.search)) { if (line) line.textContent = ''; return; }
    if (!profile) { if (line) line.textContent = online ? 'Đăng nhập để lưu thành tích & lên cấp' : ''; return; }
    const P = g.player || {};
    const durationSec = Math.min(g.matchDuration || 1800, Math.floor((Date.now() - (g.matchStartTime || Date.now())) / 1000));
    const mm = g.matchmaking || window.matchmakingController || {};
    if (line) line.textContent = 'Đang lưu kết quả…';
    try {
      const ammoUsed = (typeof Equipment !== 'undefined' && Equipment.paidUsed) ? Equipment.paidUsed(P) : {};
      const r = await api('match-result', { result, kills: P.kills || 0, deaths: g._playerDeaths || 0, damage: P.damageDealt || 0, shots: P.shotsFired || 0,
        tankType: P.tankType, mapType: mm.selectedMapType || (g.terrain && g.terrain.mapType), durationSec, ammoUsed });
      setProfile(r.profile, false);
      armoryChanged();
      if (line) line.innerHTML = `<b>+${r.gained} kinh nghiệm</b> · <b class="silver"><i class="ti ti-coins"></i> +${fmtSilver(r.silver)} Bạc</b>${r.levelUp ? ` · <span class="up">LÊN CẤP: ${esc(r.profile.rankText)}!</span>` : ` · ${esc(r.profile.rankText)}`}`
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

  return { get profile() { return profile; }, get online() { return online; }, api, kitFor, owns, buy, setLoadout, fmtSilver, showLogin: () => show($('#acc-auth')), TANK_NAMES, MAP_NAMES };
})();
window.Account = Account;
